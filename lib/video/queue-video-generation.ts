import { prisma } from "@/lib/prisma";
import {
  getVideoProvider,
  serializeGenerationProviderName,
} from "@/lib/providers/registry";
import {
  buildVideoContext,
  buildVideoParams,
  runVideoGeneration,
  type SceneForVideoGeneration,
} from "@/lib/video/run-video-generation";
import type { GenerationProviderName } from "@/lib/providers/types";
import { toErrorMessage } from "@/lib/utils/errors";
import type { Prisma } from "@prisma/client";

export interface QueuedVideoGeneration {
  variantId: string;
  hasReferenceImage: boolean;
  fail: (error: unknown) => Promise<void>;
  run: (sceneOverride?: SceneForVideoGeneration) => Promise<void>;
}

async function markVideoGenerationFailed(variantId: string, error: unknown): Promise<void> {
  await prisma.videoVariant.update({
    where: { id: variantId },
    data: {
      status: "FAILED",
      errorDetail: toErrorMessage(error),
      completedAt: new Date(),
    },
  }).catch(() => undefined);
}

/**
 * Creates the persisted QUEUED variant first, then returns an explicit runner.
 * Callers can fire it immediately for a single scene or schedule it in a
 * concurrency-limited worker pool for episode-wide generation.
 */
export async function queueVideoGeneration(params: {
  scene: SceneForVideoGeneration;
  providerName: GenerationProviderName;
  requestedParams?: Record<string, unknown>;
}): Promise<QueuedVideoGeneration> {
  const requestedParams = params.requestedParams ?? {};
  const videoParams = buildVideoParams(params.scene, requestedParams);
  const { baseCtx, referenceImagePath, referenceImagePaths } = buildVideoContext(
    params.scene,
    videoParams
  );
  const provider = getVideoProvider(params.providerName);
  const validationError = provider.validate(baseCtx);
  if (validationError) throw new Error(validationError);

  const variant = await prisma.videoVariant.create({
    data: {
      sceneId: params.scene.id,
      paramsSnapshot: baseCtx.videoParams as Prisma.InputJsonValue,
      compositeImagePath: referenceImagePath,
      workflowSnapshot: {},
      status: "QUEUED",
      strategy: referenceImagePath ? "i2v_single" : "t2v",
      provider: serializeGenerationProviderName(params.providerName),
      referenceImagePaths,
    },
  });

  return {
    variantId: variant.id,
    hasReferenceImage: !!baseCtx.inputImagePath,
    fail: (error) => markVideoGenerationFailed(variant.id, error),
    run: async (sceneOverride = params.scene) => {
      try {
        const nextContext = buildVideoContext(sceneOverride, videoParams);
        const nextValidationError = provider.validate(nextContext.baseCtx);
        if (nextValidationError) throw new Error(nextValidationError);

        await prisma.videoVariant.update({
          where: { id: variant.id },
          data: {
            paramsSnapshot: nextContext.baseCtx.videoParams as Prisma.InputJsonValue,
            compositeImagePath: nextContext.referenceImagePath,
            referenceImagePaths: nextContext.referenceImagePaths,
            strategy: nextContext.referenceImagePath ? "i2v_single" : "t2v",
          },
        });
        await runVideoGeneration({
          variantId: variant.id,
          providerName: params.providerName,
          baseCtx: nextContext.baseCtx,
        });
      } catch (error) {
        await markVideoGenerationFailed(variant.id, error);
      }
    },
  };
}
