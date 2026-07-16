import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVideoProvider, resolveVideoProviderName } from "@/lib/providers/registry";
import { finalizeVideoFile } from "@/lib/video/finalize-video-file";
import type { VideoGenHooks } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

let initialized = false;

/** One-shot on app start: reconcile variants left in a generating state by a previous process. */
export async function GET() {
  if (initialized) return NextResponse.json({ ok: true, alreadyRan: true });
  initialized = true;

  const stuck = await prisma.videoVariant.findMany({
    where: { status: { in: ["GENERATING_IMAGE", "GENERATING_VIDEO", "QUEUED"] } },
    include: { scene: { include: { episode: { include: { film: true } } } } },
  });

  const recovered: string[] = [];
  const failed: string[] = [];

  for (const variant of stuck) {
    if (!variant.scene) continue;

    const provider = getVideoProvider(resolveVideoProviderName(variant.provider));
    const markFailed = async (errorDetail: string) => {
      await prisma.videoVariant.update({ where: { id: variant.id }, data: { status: "FAILED", errorDetail } });
      failed.push(variant.id);
    };

    const hooks: VideoGenHooks = {
      async onSubmitted() { /* recovery never re-submits */ },
      async onProgress() { /* one-shot check */ },
      async onComplete(buffer, ext) {
        await finalizeVideoFile({
          variantId: variant.id,
          filmId: variant.scene!.episode.filmId,
          episodeId: variant.scene!.episodeId,
          sceneId: variant.sceneId,
          buffer,
          ext,
        });
        recovered.push(variant.id);
      },
      async onError(message) {
        await markFailed(message);
      },
    };

    try {
      const result = await provider.recoverVideo(variant, hooks);
      if (result.status === "no_prompt_id") {
        await markFailed("App restarted before submit");
      } else if (result.status === "not_found") {
        await markFailed("Job history not found after restart");
      }
      // still_running / provider_unreachable: giữ nguyên trạng thái, sẽ recover ở lần check sau
    } catch {
      await markFailed("Recovery check failed");
    }
  }

  return NextResponse.json({ ok: true, recovered, failed });
}
