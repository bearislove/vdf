import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveVideoProviderName,
} from "@/lib/providers/registry";
import { queueVideoGeneration } from "@/lib/video/queue-video-generation";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { sceneId, provider: bodyProvider } = body;
  if (typeof sceneId !== "string" || !sceneId) {
    return NextResponse.json({ error: "sceneId required" }, { status: 400 });
  }

  const requestedParams = body.params && typeof body.params === "object" && !Array.isArray(body.params)
    ? body.params as Record<string, unknown>
    : {};

  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      episode: { include: { film: true } },
      objectLinks: { include: { object: true } },
      videoVariants: {
        where: { status: { in: ["QUEUED", "GENERATING_IMAGE", "GENERATING_VIDEO"] } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  if (scene.videoVariants.length > 0) {
    return NextResponse.json({ error: "Scene already has an active video generation" }, { status: 409 });
  }

  const providerName = resolveVideoProviderName(bodyProvider);
  try {
    const queued = await queueVideoGeneration({ scene, providerName, requestedParams });
    void queued.run();
    return NextResponse.json({ variantId: queued.variantId }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
