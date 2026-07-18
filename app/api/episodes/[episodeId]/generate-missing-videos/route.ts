import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAgnesCredentialCount } from "@/lib/providers/agnes-credentials";
import { resolveVideoProviderName } from "@/lib/providers/registry";
import { runWithConcurrency } from "@/lib/utils/run-with-concurrency";
import { queueVideoGeneration } from "@/lib/video/queue-video-generation";
import { isVideoActive } from "@/lib/video/video-status";

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
      { error: "Chưa cấu hình AGNES_AI_API_KEY hoặc AGNES_AI_API_KEYS để tạo video" },
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

  // A scene is missing only when it has neither a completed video nor an
  // already queued/running generation. FAILED variants are safe to replace.
  const missingScenes = scenes.filter((scene) => {
    const hasDone = scene.videoVariants.some((variant) => variant.status === "DONE");
    const hasActive = scene.videoVariants.some((variant) => isVideoActive(variant.status));
    return !hasDone && !hasActive;
  });

  if (missingScenes.length === 0) {
    return NextResponse.json({ queuedCount: 0, variantIds: [], concurrency: 0 });
  }

  const queued = [];
  try {
    for (const scene of missingScenes) {
      const savedParams = scene.videoParams
        && typeof scene.videoParams === "object"
        && !Array.isArray(scene.videoParams)
          ? scene.videoParams as Record<string, unknown>
          : {};
      queued.push(
        await queueVideoGeneration({ scene, providerName, requestedParams: savedParams })
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  // One Agnes token owns one concurrent worker. ComfyUI remains serial because
  // it is normally backed by a single local GPU queue.
  const concurrency = providerName === "agnes" ? agnesCredentialCount : 1;
  void runWithConcurrency(
    queued.map(({ run }) => run),
    concurrency
  ).catch(() => undefined); // Each runner persists its own failure detail.

  return NextResponse.json({
    queuedCount: queued.length,
    variantIds: queued.map((item) => item.variantId),
    concurrency,
    provider: providerName,
  }, { status: 202 });
}
