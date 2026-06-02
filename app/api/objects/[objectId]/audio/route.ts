import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { objectDir, ensureDir, storageRelative } from "@/lib/storage";
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
  const file = formData.get("audio") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const dir = objectDir(obj.filmId, obj.id);
  ensureDir(dir);

  const ext = path.extname(file.name) || ".wav";
  const dest = path.join(dir, `audio_ref${ext}`);
  fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));

  await prisma.storyObject.update({
    where: { id: obj.id },
    data: { audioRefPath: storageRelative(dest) },
  });

  return NextResponse.json({ path: storageRelative(dest) });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: { objectId: string } }
) {
  const obj = await prisma.storyObject.findUnique({ where: { id: params.objectId } });
  if (!obj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (obj.audioRefPath) {
    const STORAGE_ROOT = process.env.STORAGE_PATH ?? "./storage";
    const abs = path.resolve(STORAGE_ROOT, obj.audioRefPath);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }

  await prisma.storyObject.update({
    where: { id: params.objectId },
    data: { audioRefPath: null },
  });

  return NextResponse.json({ ok: true });
}
