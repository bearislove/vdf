import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { ensureCompositeImageSelected } from "@/lib/scene-composite-selection";
import { cloneLinkedObjectReferences } from "@/lib/scene-reference-clones";
import {
  ensureDir,
  listSceneCompositeImages,
  resolveStoragePathInside,
  sceneCompositeImagesDir,
  storageRelative,
} from "@/lib/storage";

const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const MAX_UPLOAD_SIZE = 15 * 1024 * 1024;

function hasValidImageSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === "image/webp") {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString("ascii") === "RIFF"
      && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

async function getScene(sceneId: string) {
  return prisma.scene.findUnique({
    where: { id: sceneId },
    include: { episode: true },
  });
}

export async function GET(
  _: NextRequest,
  { params }: { params: { sceneId: string } }
) {
  const scene = await getScene(params.sceneId);
  if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Đồng bộ ảnh nhận dạng của object vào thư mục scene ngay lúc đọc — client không cần gọi clone riêng
  await cloneLinkedObjectReferences(scene.id);
  const images = listSceneCompositeImages(scene.episode.filmId, scene.episodeId, scene.id)
    .map(({ absPath, mtimeMs }) => ({
      path: storageRelative(absPath),
      createdAt: new Date(mtimeMs).toISOString(),
    }));

  return NextResponse.json({ images });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { sceneId: string } }
) {
  const scene = await getScene(params.sceneId);
  if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const directory = sceneCompositeImagesDir(scene.episode.filmId, scene.episodeId, scene.id);
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const formData = await req.formData();
    const image = formData.get("image");
    if (!image || typeof image === "string" || image.size === 0) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }
    const extension = IMAGE_MIME_EXTENSIONS[image.type];
    if (!extension) {
      return NextResponse.json({ error: "Only JPG, PNG, and WEBP images are supported" }, { status: 415 });
    }
    if (image.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: "Image must be 15 MB or smaller" }, { status: 413 });
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    if (!hasValidImageSignature(buffer, image.type)) {
      return NextResponse.json({ error: "The uploaded file is not a valid image" }, { status: 415 });
    }

    ensureDir(directory);
    const filename = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${extension}`;
    const absolutePath = path.join(directory, filename);
    fs.writeFileSync(absolutePath, buffer);
    const uploadedPath = storageRelative(absolutePath);
    await ensureCompositeImageSelected(scene, { filmId: scene.episode.filmId, episodeId: scene.episodeId }, uploadedPath);
    return NextResponse.json({ path: uploadedPath }, { status: 201 });
  }

  return NextResponse.json({ error: "Expected an image upload" }, { status: 415 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { sceneId: string } }
) {
  const scene = await getScene(params.sceneId);
  if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const directory = sceneCompositeImagesDir(scene.episode.filmId, scene.episodeId, scene.id);
  const absolutePath = resolveStoragePathInside(body.path, directory);
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return NextResponse.json({ error: "Reference image not found" }, { status: 404 });
  }

  const relativePath = storageRelative(absolutePath);
  fs.unlinkSync(absolutePath);
  if (scene.compositeImagePath === relativePath) {
    await prisma.scene.update({
      where: { id: scene.id },
      data: { compositeImagePath: null },
    });
  }

  return NextResponse.json({ ok: true });
}
