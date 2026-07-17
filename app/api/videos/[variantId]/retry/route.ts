import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVideoProvider, resolveVideoProviderName } from "@/lib/providers/registry";
import {
  buildVideoContext,
  startVideoGeneration,
} from "@/lib/video/run-video-generation";
import type { Prisma } from "@prisma/client";

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function POST(
  _: NextRequest,
  { params }: { params: { variantId: string } }
) {
  const variant = await prisma.videoVariant.findUnique({
    where: { id: params.variantId },
    include: {
      scene: {
        include: {
          episode: { include: { film: true } },
          objectLinks: { include: { object: true } },
        },
      },
    },
  });

  if (!variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  if (!variant.scene) {
    return NextResponse.json({ error: "Scene not found (may have been deleted)" }, { status: 404 });
  }
  if (["QUEUED", "GENERATING_IMAGE", "GENERATING_VIDEO"].includes(variant.status)) {
    return NextResponse.json({ error: "Variant is already running" }, { status: 409 });
  }

  const providerName = resolveVideoProviderName(variant.provider);
  const provider = getVideoProvider(providerName);
  const { baseCtx, referenceImagePath, referenceImagePaths } = buildVideoContext(
    variant.scene,
    jsonObject(variant.paramsSnapshot)
  );

  const validationError = provider.validate(baseCtx);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  await prisma.videoVariant.update({
    where: { id: variant.id },
    data: {
      status: "QUEUED",
      errorDetail: null,
      statusMessage: "",
      currentNode: null,
      progressStep: 0,
      progressTotal: 0,
      comfyPromptId: null,
      comfyClientId: null,
      externalJobId: null,
      providerCredentialId: null,
      workflowSnapshot: {},
      compositeImagePath: referenceImagePath,
      referenceImagePaths,
      paramsSnapshot: baseCtx.videoParams as Prisma.InputJsonValue,
      videoPath: null,
      lastFramePath: null,
      thumbnailPath: null,
      durationSeconds: null,
      completedAt: null,
    },
  });

  startVideoGeneration({ variantId: variant.id, providerName, baseCtx });

  return NextResponse.json({ status: "queued" }, { status: 202 });
}
