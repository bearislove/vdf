import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAgnesCredentialCount } from "@/lib/providers/agnes-credentials";
import { resolveVideoProviderName } from "@/lib/providers/registry";
import {
  findScenesMissingVideo,
  queueSceneGenerations,
  startSceneGenerationBatch,
} from "@/lib/video/batch-video-generation";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { episodeId: string } }
) {
  const body = await req.json().catch(() => ({}));
  const providerName = resolveVideoProviderName(body.provider);
  const agnesCredentialCount = getAgnesCredentialCount();
  if (providerName === "agnes" && agnesCredentialCount === 0) {
    return NextResponse.json(
      { error: "AGNES_AI_API_KEY or AGNES_AI_API_KEYS is not configured for video generation" },
      { status: 400 }
    );
  }
  const scenes = await prisma.scene.findMany({
    where: { episodeId: params.episodeId },
    orderBy: { order: "asc" },
    include: {
      episode: { include: { film: true } },
      objectLinks: { include: { object: true } },
      videoVariants: { select: { status: true } },
    },
  });

  if (scenes.length === 0) {
    return NextResponse.json({ error: "Episode has no scenes" }, { status: 404 });
  }

  const missingScenes = findScenesMissingVideo(scenes);

  if (missingScenes.length === 0) {
    return NextResponse.json({ queuedCount: 0, variantIds: [], concurrency: 0 });
  }

  let queued;
  try {
    queued = await queueSceneGenerations(missingScenes, providerName);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  // One Agnes token owns one concurrent worker. ComfyUI remains serial because
  // it is normally backed by a single local GPU queue.
  const concurrency = providerName === "agnes" ? agnesCredentialCount : 1;
  startSceneGenerationBatch(queued, concurrency);

  return NextResponse.json({
    queuedCount: queued.length,
    variantIds: queued.map(({ generation }) => generation.variantId),
    concurrency,
    provider: providerName,
  }, { status: 202 });
}
