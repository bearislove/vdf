import { randomInt } from "crypto";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getVideoProvider } from "@/lib/providers/registry";
import { listSceneCompositeImages, storageRelative } from "@/lib/storage";
import { toErrorMessage } from "@/lib/utils/errors";
import { finalizeVideoFile } from "@/lib/video/finalize-video-file";
import { dedupeStorageImagePaths } from "@/lib/video/reference-image-dedup";
import type { GenerationProviderName, VideoGenContext, VideoGenHooks } from "@/lib/providers/types";
import type { Prisma } from "@prisma/client";

export type SceneForVideoGeneration = Prisma.SceneGetPayload<{
  include: {
    episode: { include: { film: true } };
    objectLinks: { include: { object: true } };
  };
}>;

export function buildVideoHooks(ids: {
  variantId: string;
  filmId: string;
  episodeId: string;
  sceneId: string;
}): VideoGenHooks {
  return {
    async onSubmitted(meta) {
      await prisma.videoVariant.update({
        where: { id: ids.variantId },
        data: {
          status: "GENERATING_VIDEO",
          ...(meta.strategy !== undefined && { strategy: meta.strategy }),
          ...(meta.externalJobId !== undefined && { externalJobId: meta.externalJobId }),
          ...(meta.providerCredentialId !== undefined && {
            providerCredentialId: meta.providerCredentialId,
          }),
          ...(meta.comfyPromptId !== undefined && { comfyPromptId: meta.comfyPromptId }),
          ...(meta.comfyClientId !== undefined && { comfyClientId: meta.comfyClientId }),
          ...(meta.workflowSnapshot !== undefined && {
            workflowSnapshot: meta.workflowSnapshot as Prisma.InputJsonValue,
          }),
          ...(meta.referenceImagePaths !== undefined && {
            referenceImagePaths: dedupeStorageImagePaths(meta.referenceImagePaths),
          }),
        },
      });
    },
    async onProgress(progress) {
      await prisma.videoVariant.update({
        where: { id: ids.variantId },
        data: {
          ...(progress.step !== undefined && { progressStep: progress.step }),
          ...(progress.total !== undefined && { progressTotal: progress.total }),
          ...(progress.currentNode !== undefined && { currentNode: progress.currentNode }),
          ...(progress.statusMessage !== undefined && { statusMessage: progress.statusMessage }),
        },
      }).catch(() => {});
    },
    async onComplete(buffer, ext) {
      await finalizeVideoFile({ ...ids, buffer, ext });
    },
    async onError(message) {
      await prisma.videoVariant.update({
        where: { id: ids.variantId },
        data: { status: "FAILED", errorDetail: toErrorMessage(message), completedAt: new Date() },
      }).catch(() => {});
    },
  };
}

export function buildVideoParams(
  scene: SceneForVideoGeneration,
  requestedParams: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...requestedParams,
    negativePrompt: typeof requestedParams.negativePrompt === "string"
      ? requestedParams.negativePrompt.trim()
      : scene.negativePrompt,
    seed: typeof requestedParams.seed === "number" ? requestedParams.seed : randomInt(0, 2 ** 31),
  };
}

export function buildVideoContext(
  scene: SceneForVideoGeneration,
  videoParams: Record<string, unknown>
): {
  baseCtx: Omit<VideoGenContext, "variantId">;
  referenceImagePath: string | null;
  referenceImagePaths: string[];
} {
  const filmId = scene.episode.filmId;
  const episodeId = scene.episodeId;
  const sceneReferenceImages = listSceneCompositeImages(filmId, episodeId, scene.id);
  const selectedInitialImage = scene.compositeImagePath
    && ["composite_", "initial_"].some((prefix) => path.basename(scene.compositeImagePath!).startsWith(prefix))
    ? sceneReferenceImages.find((image) => storageRelative(image.absPath) === scene.compositeImagePath)
    : undefined;
  const inputImagePath = selectedInitialImage?.absPath && fs.existsSync(selectedInitialImage.absPath)
    ? selectedInitialImage.absPath
    : undefined;
  const referenceImagePath = inputImagePath ? storageRelative(inputImagePath) : null;
  const nextVideoParams = { ...videoParams, referenceImagePath };
  const contentReferenceImagePaths: string[] = [];

  return {
    baseCtx: {
      scene: scene as unknown as VideoGenContext["scene"],
      videoParams: nextVideoParams,
      filmId,
      episodeId,
      inputImagePath,
      firstFrameImagePath: undefined,
      firstFrameSource: "none",
      contentReferenceImagePaths,
    },
    referenceImagePath,
    referenceImagePaths: dedupeStorageImagePaths([
      ...(referenceImagePath ? [referenceImagePath] : []),
      ...contentReferenceImagePaths.map((imagePath) => storageRelative(imagePath)),
    ]),
  };
}

export function startVideoGeneration(params: {
  variantId: string;
  providerName: GenerationProviderName;
  baseCtx: Omit<VideoGenContext, "variantId">;
}): void {
  void runVideoGeneration(params);
}

/** Awaitable form used by concurrency-limited batch workers. */
export async function runVideoGeneration(params: {
  variantId: string;
  providerName: GenerationProviderName;
  baseCtx: Omit<VideoGenContext, "variantId">;
}): Promise<void> {
  const provider = getVideoProvider(params.providerName);
  const ctx: VideoGenContext = { ...params.baseCtx, variantId: params.variantId };
  const hooks = buildVideoHooks({
    variantId: params.variantId,
    filmId: params.baseCtx.filmId,
    episodeId: params.baseCtx.episodeId,
    sceneId: params.baseCtx.scene.id,
  });

  await provider.runVideoGeneration(ctx, hooks).catch((e) => hooks.onError(toErrorMessage(e)));
}
