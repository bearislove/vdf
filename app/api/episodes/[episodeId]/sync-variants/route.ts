/**
 * POST /api/episodes/{episodeId}/sync-variants
 *
 * For each queued/generating variant in the episode, checks its provider,
 * finalizes completed output, persists failures, and keeps active jobs running.
 * Returns the latest scene state after reconciliation.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeStoredVariantReferenceImages } from "@/lib/video/reference-image-dedup";
import { recoverVideoVariant } from "@/lib/video/recover-video-variant";

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

  // Check sequentially to avoid hammering a local ComfyUI instance or a
  // provider API when an episode contains many active variants.
  for (const variant of pendingVariants) await recoverVideoVariant(variant);

  // Return the latest scene state after reconciliation.
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

  if (episode) {
    await normalizeStoredVariantReferenceImages(
      episode.scenes.flatMap((scene) => [
        ...scene.videoVariants,
        ...(scene.selectedVideo ? [scene.selectedVideo] : []),
      ])
    );
  }
  return NextResponse.json(episode?.scenes ?? []);
}
