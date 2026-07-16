import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  objectRefImagesDir,
  ensureDir,
  resolveStoragePathInside,
  storageRelative,
} from "@/lib/storage";
import fs from "fs";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: { objectId: string } }
) {
  const obj = await prisma.storyObject.findUnique({
    where: { id: params.objectId },
  });
  if (!obj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const files = formData.getAll("images") as File[];
  if (!files.length) return NextResponse.json({ error: "No files" }, { status: 400 });

  const refImagesDir = objectRefImagesDir(obj.filmId, obj.id);
  ensureDir(refImagesDir);

  const existing: Array<{ path: string; isMain: boolean; label: string }> =
    (obj.refImages as Array<{ path: string; isMain: boolean; label: string }>) ?? [];

  const newImages: typeof existing = [];
  for (const file of files) {
    const ext = path.extname(file.name) || ".png";
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    const dest = path.join(refImagesDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(dest, buffer);
    newImages.push({
      path: storageRelative(dest),
      isMain: existing.length === 0 && newImages.length === 0,
      label: file.name,
    });
  }

  const updated = [...existing, ...newImages];
  await prisma.storyObject.update({
    where: { id: params.objectId },
    data: { refImages: updated },
  });

  return NextResponse.json({ ok: true, added: newImages.length });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { objectId: string } }
) {
  const obj = await prisma.storyObject.findUnique({ where: { id: params.objectId } });
  if (!obj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const images = (obj.refImages ?? []) as Array<{ path: string; isMain: boolean; label: string }>;
  if (typeof body.path !== "string" || !images.some((image) => image.path === body.path)) {
    return NextResponse.json({ error: "Reference image not found" }, { status: 404 });
  }

  const directory = objectRefImagesDir(obj.filmId, obj.id);
  const absolutePath = resolveStoragePathInside(body.path, directory);
  if (!absolutePath) {
    return NextResponse.json({ error: "Invalid reference image path" }, { status: 400 });
  }

  const remainingImages = images.filter((image) => image.path !== body.path);
  if (remainingImages.length > 0 && !remainingImages.some((image) => image.isMain)) {
    remainingImages[0] = { ...remainingImages[0], isMain: true };
  }
  await prisma.storyObject.update({
    where: { id: obj.id },
    data: { refImages: remainingImages },
  });
  try {
    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
  } catch {
    // The database is authoritative; an orphaned file must not keep a deleted reference visible.
  }

  return NextResponse.json({ ok: true, refImages: remainingImages });
}
