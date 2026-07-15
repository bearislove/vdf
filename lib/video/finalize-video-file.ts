import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { variantDir, ensureDir, storageRelative, STORAGE_ROOT } from "@/lib/storage";
import { extractFirstFrame, extractLastFrame, getVideoDuration } from "@/lib/ffmpeg";

export interface FinalizeVideoParams {
  variantId: string;
  filmId: string;
  episodeId: string;
  sceneId: string;
  buffer: Buffer;
  ext: string;
}

/**
 * Persists a completed video: writes the file, extracts thumbnail/last-frame/duration
 * via ffmpeg, and marks the VideoVariant as DONE. Returns the storage-relative video path.
 */
export async function finalizeVideoFile(params: FinalizeVideoParams): Promise<string> {
  const { variantId, filmId, episodeId, sceneId, buffer, ext } = params;

  const vDir = variantDir(filmId, episodeId, sceneId, variantId);
  ensureDir(vDir);
  const outPath = path.join(vDir, `video${ext}`);
  fs.writeFileSync(outPath, buffer);
  const videoPath = storageRelative(outPath);

  let thumbnailPath: string | null = null;
  let lastFramePath: string | null = null;
  let durationSeconds: number | null = null;

  const absVideo = path.resolve(STORAGE_ROOT, videoPath);
  if (fs.existsSync(absVideo)) {
    try {
      const thumbOut = path.join(vDir, "thumbnail.png");
      await extractFirstFrame(absVideo, thumbOut);
      thumbnailPath = storageRelative(thumbOut);
    } catch { /* ignore */ }
    try {
      const lastFrameOut = path.join(vDir, "last_frame.png");
      await extractLastFrame(absVideo, lastFrameOut);
      lastFramePath = storageRelative(lastFrameOut);
    } catch { /* ignore */ }
    try {
      const dur = await getVideoDuration(absVideo);
      durationSeconds = typeof dur === "number" && isFinite(dur) ? dur : null;
    } catch { /* ignore */ }
  }

  await prisma.videoVariant.update({
    where: { id: variantId },
    data: {
      status: "DONE",
      videoPath,
      thumbnailPath,
      lastFramePath,
      durationSeconds,
      completedAt: new Date(),
      errorDetail: null,
    },
  });

  return videoPath;
}
