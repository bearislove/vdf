import { prisma } from "@/lib/prisma";
import type { GenerationProviderName } from "@/lib/providers/types";
import { runWithConcurrency } from "@/lib/utils/run-with-concurrency";
import { generateAIReferenceImage } from "@/lib/video/generated-reference-image";
import {
  queueVideoGeneration,
  type QueuedVideoGeneration,
} from "@/lib/video/queue-video-generation";
import type { SceneForVideoGeneration } from "@/lib/video/run-video-generation";
import { isVideoActive } from "@/lib/video/video-status";
import type { VideoStatus } from "@/types/video";

interface SceneWithVariantStatuses extends SceneForVideoGeneration {
  videoVariants: Array<{ status: VideoStatus }>;
}

export interface QueuedSceneGeneration {
  scene: SceneForVideoGeneration;
  generation: QueuedVideoGeneration;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function findScenesMissingVideo(
  scenes: SceneWithVariantStatuses[]
): SceneWithVariantStatuses[] {
  return scenes.filter((scene) => {
    const hasCompletedVideo = scene.videoVariants.some((variant) => variant.status === "DONE");
    const hasActiveGeneration = scene.videoVariants.some((variant) => isVideoActive(variant.status));
    return !hasCompletedVideo && !hasActiveGeneration;
  });
}

export async function queueSceneGenerations(
  scenes: SceneForVideoGeneration[],
  providerName: GenerationProviderName
): Promise<QueuedSceneGeneration[]> {
  const queued: QueuedSceneGeneration[] = [];

  try {
    for (const scene of scenes) {
      const generation = await queueVideoGeneration({
        scene,
        providerName,
        requestedParams: jsonObject(scene.videoParams),
      });
      queued.push({ scene, generation });
    }
    return queued;
  } catch (error) {
    // The batch is all-or-nothing from the caller's perspective. Variants that
    // were persisted before a later queue failure must not remain stuck.
    await Promise.all(queued.map(({ generation }) => generation.fail(error)));
    throw error;
  }
}

async function runSceneGeneration({ scene, generation }: QueuedSceneGeneration): Promise<void> {
  try {
    let generationScene = scene;

    if (!generation.hasReferenceImage) {
      await prisma.videoVariant.update({
        where: { id: generation.variantId },
        data: { statusMessage: "generating_ai_reference" },
      }).catch(() => undefined);

      const reference = await generateAIReferenceImage(scene);
      if (reference) generationScene = { ...scene, compositeImagePath: reference.path };
    }

    await generation.run(generationScene);
  } catch (error) {
    await generation.fail(error);
  }
}

export function startSceneGenerationBatch(
  queued: QueuedSceneGeneration[],
  concurrency: number
): void {
  void runWithConcurrency(
    queued.map((item) => () => runSceneGeneration(item)),
    concurrency
  ).catch(() => undefined); // Each task persists its own failure detail.
}
