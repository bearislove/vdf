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
import type { Prisma } from "@prisma/client";

export interface QueuedVideoGeneration {
  variantId: string;
  run: () => Promise<void>;
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
    run: () => runVideoGeneration({
      variantId: variant.id,
      providerName: params.providerName,
      baseCtx,
    }),
  };
}
