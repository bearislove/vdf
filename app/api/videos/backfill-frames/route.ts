import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractFirstFrame, extractLastFrame } from "@/lib/ffmpeg";
import { STORAGE_ROOT, storageRelative } from "@/lib/storage";
import path from "path";
import fs from "fs";

export async function POST() {
  const variants = await prisma.videoVariant.findMany({
    where: {
      status: "DONE",
      videoPath: { not: null },
      lastFramePath: null,
    },
  });

  let updated = 0;
  const errors: string[] = [];

  for (const v of variants) {
    if (!v.videoPath) continue;
    const absVideo = path.resolve(STORAGE_ROOT, v.videoPath);
    if (!fs.existsSync(absVideo)) continue;

    const vDir = path.dirname(absVideo);
    let thumbnailPath = v.thumbnailPath;
    let lastFramePath = v.lastFramePath;

    try {
      if (!thumbnailPath) {
        const thumbOut = path.join(vDir, "thumbnail.png");
        await extractFirstFrame(absVideo, thumbOut);
        thumbnailPath = storageRelative(thumbOut);
      }
    } catch (e) {
      errors.push(`thumbnail ${v.id}: ${e}`);
    }

    try {
      if (!lastFramePath) {
        const lastOut = path.join(vDir, "last_frame.png");
        await extractLastFrame(absVideo, lastOut);
        lastFramePath = storageRelative(lastOut);
      }
    } catch (e) {
      errors.push(`lastFrame ${v.id}: ${e}`);
    }

    await prisma.videoVariant.update({
      where: { id: v.id },
      data: { thumbnailPath, lastFramePath },
    });
    updated++;
  }

  return NextResponse.json({ updated, errors });
}
