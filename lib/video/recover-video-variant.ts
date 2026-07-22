import { prisma } from "@/lib/prisma";
import { getVideoProvider, resolveVideoProviderName } from "@/lib/providers/registry";
import type { VideoRecoveryResult } from "@/lib/providers/types";
import { toErrorMessage } from "@/lib/utils/errors";
import { buildVideoHooks } from "@/lib/video/run-video-generation";
import type { Prisma } from "@prisma/client";

export type VideoVariantForRecovery = Prisma.VideoVariantGetPayload<{
  include: { scene: { include: { episode: { include: { film: true } } } } };
}>;

export async function recoverVideoVariant(
  variant: VideoVariantForRecovery
): Promise<VideoRecoveryResult> {
  if (!variant.scene) {
    return { status: "not_found", message: "Scene not found (may have been deleted)", httpStatus: 404 };
  }

  const provider = getVideoProvider(resolveVideoProviderName(variant.provider));
  const hooks = buildVideoHooks({
    variantId: variant.id,
    filmId: variant.scene.episode.filmId,
    episodeId: variant.scene.episodeId,
    sceneId: variant.sceneId,
  });

  try {
    const result = await provider.recoverVideo(variant, hooks);
    if (result.status === "still_running") {
      await prisma.videoVariant.update({
        where: { id: variant.id },
        data: { status: "GENERATING_VIDEO", errorDetail: null },
      });
    }
    if (result.status === "no_output") {
      await hooks.onError(result.message ?? "Video provider completed without an output");
    }
    if (result.status !== "recovered" || result.videoPath) return result;

    const finalized = await prisma.videoVariant.findUnique({
      where: { id: variant.id },
      select: { videoPath: true },
    });
    return { ...result, videoPath: finalized?.videoPath ?? undefined };
  } catch (error) {
    return {
      status: "provider_unreachable",
      message: toErrorMessage(error),
      httpStatus: 502,
    };
  }
}
