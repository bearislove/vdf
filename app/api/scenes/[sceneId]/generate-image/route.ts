import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { buildPrompt, resolveObjectReferenceImagePaths } from "@/lib/comfyui/prompt";
import { imageGenerationSSEResponse } from "@/lib/providers/image/sse";
import { getImageProvider, resolveImageProviderForReferences } from "@/lib/providers/registry";
import {
  ensureDir,
  resolveStoragePath,
  resolveStoragePathInside,
  sceneCompositeImagesDir,
  storageRelative,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_REFERENCE_IMAGES = 4;

interface GenerateImageRequest {
  referenceImages?: unknown;
  objectIds?: unknown;
  uploadedReferencePaths?: unknown;
  prompt?: unknown;
  provider?: unknown;
  model?: unknown;
  width?: unknown;
  height?: unknown;
}

async function findScene(sceneId: string) {
  return prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      episode: { include: { film: true } },
      objectLinks: { include: { object: true } },
    },
  });
}

type GenerationScene = NonNullable<Awaited<ReturnType<typeof findScene>>>;

function existingStoragePath(relativePath: unknown): string[] {
  if (typeof relativePath !== "string") return [];
  try {
    const absolutePath = resolveStoragePath(relativePath);
    return fs.existsSync(absolutePath) ? [absolutePath] : [];
  } catch {
    return [];
  }
}

function resolveRequestedObjectReferences(
  scene: GenerationScene,
  body: GenerateImageRequest
): string[] {
  if (Array.isArray(body.referenceImages)) {
    const linkedObjects = new Map(scene.objectLinks.map((link) => [link.objectId, link.object]));
    return body.referenceImages.flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return [];
      const request = item as { objectId?: unknown; path?: unknown };
      if (typeof request.objectId !== "string" || typeof request.path !== "string") return [];
      const object = linkedObjects.get(request.objectId);
      const images = (object?.refImages ?? []) as Array<{ path?: string }>;
      if (!images.some((image) => image.path === request.path)) return [];
      return existingStoragePath(request.path);
    });
  }

  const requestedIds = Array.isArray(body.objectIds)
    ? new Set(body.objectIds.filter((id: unknown): id is string => typeof id === "string"))
    : undefined;
  return resolveObjectReferenceImagePaths(
    scene.objectLinks as unknown as Parameters<typeof resolveObjectReferenceImagePaths>[0],
    { objectIds: requestedIds, limit: MAX_REFERENCE_IMAGES }
  );
}

function resolveUploadedReferences(scene: GenerationScene, paths: unknown): string[] {
  if (!Array.isArray(paths)) return [];
  const directory = sceneCompositeImagesDir(scene.episode.filmId, scene.episodeId, scene.id);
  return paths.flatMap((relativePath: unknown) => {
    const absolutePath = resolveStoragePathInside(relativePath, directory);
    return absolutePath && fs.existsSync(absolutePath) ? [absolutePath] : [];
  });
}

async function resolveReferenceImages(
  scene: GenerationScene,
  body: GenerateImageRequest
): Promise<string[]> {
  const paths = [
    ...resolveRequestedObjectReferences(scene, body),
    ...resolveUploadedReferences(scene, body.uploadedReferencePaths),
  ];
  return Array.from(new Set(paths)).slice(0, MAX_REFERENCE_IMAGES);
}

function buildGenerationPrompt(basePrompt: string): string {
  return `Preserve the exact identity, face, hairstyle, clothing, colors, and defining visual features of every subject in the reference images. Do not redesign or replace them. Compose them naturally in this scene: ${basePrompt}`;
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

async function saveCompositeImage(scene: GenerationScene, buffer: Buffer): Promise<string> {
  const directory = sceneCompositeImagesDir(scene.episode.filmId, scene.episodeId, scene.id);
  ensureDir(directory);
  const outputPath = path.join(directory, `composite_${Date.now()}.png`);
  fs.writeFileSync(outputPath, buffer);
  return storageRelative(outputPath);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { sceneId: string } }
) {
  const scene = await findScene(params.sceneId);
  if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as GenerateImageRequest;
  const referenceImagePaths = await resolveReferenceImages(scene, body);
  if (referenceImagePaths.length === 0) {
    return NextResponse.json(
      { error: "Các ảnh tham chiếu được chọn không tồn tại hoặc không thuộc scene này" },
      { status: 400 }
    );
  }

  const requestedPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const basePrompt = requestedPrompt || buildPrompt(scene.promptEnOverride ?? scene.promptEn);
  const provider = getImageProvider(
    resolveImageProviderForReferences(body.provider, referenceImagePaths.length)
  );

  return imageGenerationSSEResponse(
    provider,
    {
      prompt: buildGenerationPrompt(basePrompt),
      width: positiveNumber(body.width, 512),
      height: positiveNumber(body.height, 512),
      model: typeof body.model === "string" ? body.model : undefined,
      referenceImagePaths,
    },
    (buffer) => saveCompositeImage(scene, buffer)
  );
}
