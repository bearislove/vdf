import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveVideoProviderName,
} from "@/lib/providers/registry";
import { queueVideoGeneration } from "@/lib/video/queue-video-generation";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sceneId, provider: bodyProvider } = body;
  if (!sceneId) return NextResponse.json({ error: "sceneId required" }, { status: 400 });

  const requestedParams = body.params && typeof body.params === "object" && !Array.isArray(body.params)
    ? body.params as Record<string, unknown>
    : {};

  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      episode: { include: { film: true } },
      objectLinks: { include: { object: true } },
    },
  });
  if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });

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
