import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getVideoProvider,
  resolveVideoProviderName,
  serializeGenerationProviderName,
} from "@/lib/providers/registry";
import {
  buildVideoContext,
  buildVideoParams,
  startVideoGeneration,
} from "@/lib/video/run-video-generation";
import type { Prisma } from "@prisma/client";

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

  const videoParams = buildVideoParams(scene, requestedParams);
  const { baseCtx, referenceImagePath, referenceImagePaths } = buildVideoContext(scene, videoParams);
  const providerName = resolveVideoProviderName(bodyProvider);
  const provider = getVideoProvider(providerName);

  const validationError = provider.validate(baseCtx);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const variant = await prisma.videoVariant.create({
    data: {
      sceneId,
      paramsSnapshot: baseCtx.videoParams as Prisma.InputJsonValue,
      compositeImagePath: referenceImagePath,
      workflowSnapshot: {},
      status: "QUEUED",
      strategy: "i2v_single",
      provider: serializeGenerationProviderName(providerName),
      referenceImagePaths,
    },
  });

  startVideoGeneration({ variantId: variant.id, providerName, baseCtx });

  return NextResponse.json({ variantId: variant.id }, { status: 202 });
}
