import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getImageProvider, resolveImageProviderForReferences } from "@/lib/providers/registry";
import { imageGenerationSSEResponse } from "@/lib/providers/image/sse";
import { buildPrompt } from "@/lib/comfyui/prompt";
import {
  STORAGE_ROOT,
  sceneCompositeImagesDir,
  ensureDir,
  resolveStoragePath,
  storageRelative,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

async function saveCompositeImage(
  ids: { filmId: string; episodeId: string; sceneId: string },
  buffer: Buffer
): Promise<string> {
  const dir = sceneCompositeImagesDir(ids.filmId, ids.episodeId, ids.sceneId);
  ensureDir(dir);
  const outPath = path.join(dir, `composite_${Date.now()}.png`);
  fs.writeFileSync(outPath, buffer);
  const relPath = storageRelative(outPath);
  // Scene chưa chọn ảnh nào → chọn luôn ảnh vừa tạo để dùng khi tạo video
  await prisma.scene.updateMany({
    where: { id: ids.sceneId, compositeImagePath: null },
    data: { compositeImagePath: relPath },
  });
  return relPath;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { sceneId: string } }
) {
  const scene = await prisma.scene.findUnique({
    where: { id: params.sceneId },
    include: {
      episode: { include: { film: true } },
      objectLinks: { include: { object: true } },
    },
  });
  if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const objectLinks = scene.objectLinks as unknown as Parameters<typeof buildPrompt>[1];
  const source = body.source === "previous_scene"
    ? "previous_scene"
    : "objects";

  let referenceImagePaths: string[] = [];
  if (source === "previous_scene") {
    const previousScene = await prisma.scene.findFirst({
      where: { episodeId: scene.episodeId, order: { lt: scene.order } },
      orderBy: { order: "desc" },
      include: {
        selectedVideo: true,
        videoVariants: {
          where: { status: "DONE", lastFramePath: { not: null } },
          orderBy: { completedAt: "desc" },
        },
      },
    });
    const previousVariant = previousScene?.selectedVideo?.lastFramePath
      ? previousScene.selectedVideo
      : previousScene?.videoVariants[0];
    if (previousVariant?.lastFramePath) {
      const framePath = resolveStoragePath(previousVariant.lastFramePath);
      if (fs.existsSync(framePath)) referenceImagePaths = [framePath];
    }
  } else {
    const hasRequestedImages = Array.isArray(body.referenceImages);
    const requestedImages = hasRequestedImages ? body.referenceImages : [];
    if (hasRequestedImages) {
      const linkedObjects = new Map(scene.objectLinks.map((link) => [link.objectId, link.object]));
      referenceImagePaths = requestedImages.flatMap((item: unknown) => {
        if (!item || typeof item !== "object") return [];
        const request = item as { objectId?: unknown; path?: unknown };
        if (typeof request.objectId !== "string" || typeof request.path !== "string") return [];
        const object = linkedObjects.get(request.objectId);
        const images = (object?.refImages ?? []) as Array<{ path?: string }>;
        if (!images.some((image) => image.path === request.path)) return [];
        const imagePath = path.resolve(STORAGE_ROOT, request.path);
        return fs.existsSync(imagePath) ? [imagePath] : [];
      });
    } else {
      const requestedIds = Array.isArray(body.objectIds)
        ? new Set(body.objectIds.filter((id: unknown): id is string => typeof id === "string"))
        : null;
      referenceImagePaths = scene.objectLinks
        .filter((link) => !requestedIds || requestedIds.has(link.objectId))
        .flatMap((link) => {
          const images = link.object.refImages as Array<{ path?: string; isMain?: boolean }>;
          const image = images.find((item) => item.isMain) ?? images[0];
          if (!image?.path) return [];
          const imagePath = path.resolve(STORAGE_ROOT, image.path);
          return fs.existsSync(imagePath) ? [imagePath] : [];
      });
    }

    const sceneDirectory = sceneCompositeImagesDir(
      scene.episode.filmId,
      scene.episodeId,
      scene.id
    );
    const uploadedPaths = Array.isArray(body.uploadedReferencePaths)
      ? body.uploadedReferencePaths
      : [];
    referenceImagePaths.push(...uploadedPaths.flatMap((uploadedPath: unknown) => {
      if (typeof uploadedPath !== "string") return [];
      try {
        const imagePath = resolveStoragePath(uploadedPath);
        const relative = path.relative(sceneDirectory, imagePath);
        const belongsToScene = relative !== ""
          && !relative.startsWith("..")
          && !path.isAbsolute(relative);
        return belongsToScene && fs.existsSync(imagePath) ? [imagePath] : [];
      } catch {
        return [];
      }
    }));
    referenceImagePaths = Array.from(new Set(referenceImagePaths)).slice(0, 4);
  }

  if (referenceImagePaths.length === 0) {
    const message = source === "previous_scene"
      ? "Scene trước chưa có frame cuối để làm ảnh tham chiếu"
      : "Các ảnh tham chiếu được chọn không tồn tại hoặc không thuộc scene này";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const provider = getImageProvider(
    resolveImageProviderForReferences(body.provider, referenceImagePaths.length)
  );
  const ids = { filmId: scene.episode.filmId, episodeId: scene.episodeId, sceneId: scene.id };
  const basePrompt = (body.prompt as string) || buildPrompt(scene.promptEnOverride ?? scene.promptEn, objectLinks);
  const prompt = source === "objects"
    ? `Preserve the exact identity, face, hairstyle, clothing, colors, and defining visual features of every subject in the reference images. Do not redesign or replace them. Compose them naturally in this scene: ${basePrompt}`
    : `Use the provided previous-scene frame as the visual anchor. Preserve character identity, clothing, environment, color palette, and continuity while composing this scene: ${basePrompt}`;

  return imageGenerationSSEResponse(
    provider,
    {
      prompt,
      width: (body.width as number) || 512,
      height: (body.height as number) || 512,
      model: typeof body.model === "string" ? body.model : undefined,
      referenceImagePaths,
    },
    (buffer) => saveCompositeImage(ids, buffer)
  );
}
