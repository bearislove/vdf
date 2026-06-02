import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { objectRefImagesDir, ensureDir, storageRelative } from "@/lib/storage";
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
