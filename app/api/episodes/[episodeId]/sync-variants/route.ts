/**
 * POST /api/episodes/{episodeId}/sync-variants
 *
 * Với mỗi VideoVariant đang GENERATING/QUEUED của episode:
 *   1. Hỏi thẳng ComfyUI history xem job đã xong chưa
 *   2. Nếu xong → download + update DB → DONE
 *   3. Nếu lỗi ComfyUI → update → FAILED
 *   4. Nếu vẫn đang chạy → giữ nguyên GENERATING
 * Trả về scenes mới nhất sau khi sync.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHistory, downloadOutput } from "@/lib/comfyui/client";
import { variantDir, ensureDir, storageRelative, STORAGE_ROOT } from "@/lib/storage";
import { extractFirstFrame, extractLastFrame, getVideoDuration } from "@/lib/ffmpeg";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(
  _: NextRequest,
  { params }: { params: { episodeId: string } }
) {
  // Load all GENERATING/QUEUED variants for this episode
  const pendingVariants = await prisma.videoVariant.findMany({
    where: {
      status: { in: ["GENERATING_IMAGE", "GENERATING_VIDEO", "QUEUED"] },
      scene: { episodeId: params.episodeId },
    },
    include: {
      scene: { include: { episode: { include: { film: true } } } },
    },
  });

  for (const variant of pendingVariants) {
    if (!variant.comfyPromptId || !variant.scene) continue;

    let history: Awaited<ReturnType<typeof getHistory>>;
    try {
      history = await getHistory(variant.comfyPromptId);
    } catch {
      continue; // ComfyUI unreachable — giữ nguyên status
    }

    if (!history) continue; // Job chưa có trong history → còn queuing

    if (history.status?.status_str === "error") {
      const msgs: string[][] = history.status?.messages ?? [];
      const errMsg = msgs.find((m: string[]) => m[0] === "execution_error");
      await prisma.videoVariant.update({
        where: { id: variant.id },
        data: {
          status: "FAILED",
          errorDetail: errMsg ? JSON.stringify(errMsg[1]).slice(0, 300) : "ComfyUI error",
        },
      }).catch(() => {});
      continue;
    }

    if (!history.status?.completed) continue; // Vẫn đang chạy

    // Đã xong → download
    const filmId = variant.scene.episode.filmId;
    const episodeId = variant.scene.episodeId;
    const sceneId = variant.sceneId;
    const vDir = variantDir(filmId, episodeId, sceneId, variant.id);
    ensureDir(vDir);

    let videoPath: string | null = null;
    if (history.outputs) {
      for (const nodeOut of Object.values(history.outputs) as Array<{ images?: Array<{ filename: string; subfolder: string; type: string }> }>) {
        if (nodeOut?.images?.length) {
          const img = nodeOut.images[0];
          try {
            const buf = await downloadOutput(img.filename, img.subfolder, img.type);
            const ext = path.extname(img.filename) || ".webp";
            const outPath = path.join(vDir, `video${ext}`);
            fs.writeFileSync(outPath, buf);
            videoPath = storageRelative(outPath);
          } catch { /* ignore */ }
          break;
        }
      }
    }

    let thumbnailPath: string | null = null;
    let lastFramePath: string | null = null;
    let durationSeconds: number | null = null;

    if (videoPath) {
      const abs = path.resolve(STORAGE_ROOT, videoPath);
      if (fs.existsSync(abs)) {
        try { const t = path.join(vDir, "thumbnail.png"); await extractFirstFrame(abs, t); thumbnailPath = storageRelative(t); } catch { /**/ }
        try { const l = path.join(vDir, "last_frame.png"); await extractLastFrame(abs, l); lastFramePath = storageRelative(l); } catch { /**/ }
        try {
          const dur = await getVideoDuration(abs);
          durationSeconds = typeof dur === "number" && isFinite(dur) ? dur : null;
        } catch { /**/ }
      }
    }

    await prisma.videoVariant.update({
      where: { id: variant.id },
      data: {
        status: "DONE",
        videoPath,
        thumbnailPath,
        lastFramePath,
        durationSeconds,
        completedAt: new Date(),
        errorDetail: null,
      },
    }).catch(() => {});
  }

  // Trả về scenes mới nhất sau sync
  const episode = await prisma.episode.findUnique({
    where: { id: params.episodeId },
    include: {
      scenes: {
        orderBy: { order: "asc" },
        include: {
          objectLinks: { include: { object: true } },
          videoVariants: { orderBy: { createdAt: "asc" } },
          selectedVideo: true,
        },
      },
    },
  });

  return NextResponse.json(episode?.scenes ?? []);
}
