import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { STORAGE_ROOT, exportsDir, ensureDir, storageRelative } from "@/lib/storage";
import { normalizeVideo, concatVideos } from "@/lib/ffmpeg";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  const { filmId, episodeIds } = await req.json();
  if (!filmId || !episodeIds?.length) {
    return NextResponse.json({ error: "filmId and episodeIds required" }, { status: 400 });
  }

  // Gather selected videos for each scene in order
  const allVideoPaths: string[] = [];

  for (const episodeId of episodeIds) {
    const scenes = await prisma.scene.findMany({
      where: { episodeId },
      orderBy: { order: "asc" },
      include: {
        selectedVideo: true,
        videoVariants: { where: { status: "DONE" }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    for (const scene of scenes) {
      const variant = scene.selectedVideo ?? scene.videoVariants?.[0];
      if (variant?.videoPath) {
        const absPath = path.resolve(STORAGE_ROOT, variant.videoPath);
        if (fs.existsSync(absPath)) {
          allVideoPaths.push(absPath);
        }
      }
    }
  }

  if (allVideoPaths.length === 0) {
    return NextResponse.json({ error: "No completed videos found" }, { status: 400 });
  }

  ensureDir(exportsDir());
  const timestamp = Date.now();
  const outputPath = path.join(exportsDir(), `${filmId}_${timestamp}_merged.mp4`);

  // Normalize all videos first
  const tmpDir = path.join(exportsDir(), `tmp_${timestamp}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const normalizedPaths: string[] = [];
  for (let i = 0; i < allVideoPaths.length; i++) {
    const normPath = path.join(tmpDir, `${i}.mp4`);
    await normalizeVideo(allVideoPaths[i], normPath);
    normalizedPaths.push(normPath);
  }

  await concatVideos(normalizedPaths, outputPath);

  // Cleanup tmp
  fs.rmSync(tmpDir, { recursive: true, force: true });

  return NextResponse.json({
    outputPath: storageRelative(outputPath),
    outputUrl: `/api/files/${storageRelative(outputPath)}`,
  });
}
