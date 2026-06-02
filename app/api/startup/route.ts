import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { getHistory } from "@/lib/comfyui/client";
import { variantDir, ensureDir, storageRelative } from "@/lib/storage";
import fs from "fs";
import path from "path";

let initialized = false;

export async function GET() {
  if (initialized) return NextResponse.json({ ok: true, alreadyRan: true });
  initialized = true;

  // Find stuck variants
  const stuck = await prisma.videoVariant.findMany({
    where: { status: { in: ["GENERATING_IMAGE", "GENERATING_VIDEO", "QUEUED"] } },
    include: {
      scene: { include: { episode: { include: { film: true } } } },
    },
  });

  const recovered: string[] = [];
  const failed: string[] = [];

  for (const variant of stuck) {
    if (!variant.comfyPromptId) {
      await prisma.videoVariant.update({
        where: { id: variant.id },
        data: { status: "FAILED", errorDetail: "App restarted before submit" },
      });
      failed.push(variant.id);
      continue;
    }

    try {
      const history = await getHistory(variant.comfyPromptId);
      if (!history) {
        await prisma.videoVariant.update({
          where: { id: variant.id },
          data: { status: "FAILED", errorDetail: "ComfyUI history not found after restart" },
        });
        failed.push(variant.id);
        continue;
      }

      if (!history.status) {
        // Job vẫn đang queue / chạy, chưa có status — giữ nguyên GENERATING
        continue;
      }

      if (history.status?.completed) {
        const filmId = variant.scene.episode.filmId;
        const episodeId = variant.scene.episodeId;
        const sceneId = variant.sceneId;
        const vDir = variantDir(filmId, episodeId, sceneId, variant.id);
        ensureDir(vDir);

        // Try to find output file
        let videoPath: string | null = null;
        if (history.outputs) {
          for (const [, nodeOutput] of Object.entries(history.outputs) as [string, { images?: Array<{ filename: string; subfolder: string; type: string }> }][]) {
            if (nodeOutput?.images?.length) {
              const img = nodeOutput.images[0];
              const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://localhost:8188";
              const buffer = await fetch(
                `${COMFYUI_URL}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`
              ).then((r) => r.arrayBuffer()).catch(() => null);
              if (buffer) {
                const ext = path.extname(img.filename) || ".webp";
                const outPath = path.join(vDir, `video${ext}`);
                fs.writeFileSync(outPath, Buffer.from(buffer));
                videoPath = storageRelative(outPath);
              }
            }
          }
        }

        await prisma.videoVariant.update({
          where: { id: variant.id },
          data: { status: "DONE", videoPath, completedAt: new Date() },
        });
        recovered.push(variant.id);
      } else if (history.status?.status_str === "error") {
        await prisma.videoVariant.update({
          where: { id: variant.id },
          data: { status: "FAILED", errorDetail: "ComfyUI reported error" },
        });
        failed.push(variant.id);
      }
    } catch {
      await prisma.videoVariant.update({
        where: { id: variant.id },
        data: { status: "FAILED", errorDetail: "Recovery check failed" },
      });
      failed.push(variant.id);
    }
  }

  return NextResponse.json({ ok: true, recovered, failed });
}
