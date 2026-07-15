import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getImageProvider, resolveImageProviderForReferences } from "@/lib/providers/registry";
import { imageGenerationSSEResponse } from "@/lib/providers/image/sse";
import { objectRefImagesDir, ensureDir, storageRelative, STORAGE_ROOT } from "@/lib/storage";
import type { RefImage } from "@/types/object";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const MAX_REFERENCE_IMAGES = 4;

/** Ảnh gốc do người dùng upload (không phải ảnh AI đã tạo) — dùng làm reference cho AI, ảnh main xếp đầu */
function resolveObjectReferenceImages(refImages: RefImage[]): string[] {
  const originals = refImages.filter((img) => img.label !== "AI generated" && img.path);
  originals.sort((a, b) => Number(b.isMain ?? false) - Number(a.isMain ?? false));
  return originals
    .slice(0, MAX_REFERENCE_IMAGES)
    .map((img) => path.resolve(STORAGE_ROOT, img.path));
}

async function appendGeneratedRefImage(objectId: string, filmId: string, buffer: Buffer): Promise<string> {
  const dir = objectRefImagesDir(filmId, objectId);
  ensureDir(dir);
  const outPath = path.join(dir, `gen_${Date.now()}.png`);
  fs.writeFileSync(outPath, buffer);
  const relPath = storageRelative(outPath);

  const obj = await prisma.storyObject.findUnique({ where: { id: objectId } });
  const existing = (obj?.refImages as unknown as RefImage[]) ?? [];
  const updated = [...existing, { path: relPath, isMain: existing.length === 0, label: "AI generated" }];
  await prisma.storyObject.update({
    where: { id: objectId },
    data: { refImages: updated as unknown as Prisma.InputJsonValue },
  });
  return relPath;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { objectId: string } }
) {
  const obj = await prisma.storyObject.findUnique({ where: { id: params.objectId } });
  if (!obj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const referenceImagePaths = resolveObjectReferenceImages((obj.refImages as unknown as RefImage[]) ?? []);
  const provider = getImageProvider(
    resolveImageProviderForReferences(body.provider, referenceImagePaths.length)
  );

  const basePrompt = (body.prompt as string) || obj.descriptionEn || obj.name;
  const prompt = referenceImagePaths.length > 0
    ? `Preserve the exact identity, face, hairstyle, clothing, colors, and defining visual features of the subject in the reference images. Do not redesign or replace them. ${basePrompt}`
    : basePrompt;

  return imageGenerationSSEResponse(
    provider,
    {
      prompt,
      width: (body.width as number) || 512,
      height: (body.height as number) || 512,
      seed: (body.seed as number) ?? -1,
      model: body.model as string | undefined,
      referenceImagePaths,
    },
    (buffer) => appendGeneratedRefImage(obj.id, obj.filmId, buffer)
  );
}
