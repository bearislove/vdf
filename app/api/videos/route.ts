import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { resolvePreviousSceneFirstFrame } from "@/lib/comfyui/prompt";
import {
  getVideoProvider,
  resolveVideoProviderName,
  serializeGenerationProviderName,
} from "@/lib/providers/registry";
import { listSceneCompositeImages, storageRelative } from "@/lib/storage";
import { toErrorMessage } from "@/lib/utils/errors";
import { pickLastFrameVariant } from "@/lib/utils/scene-reference-images";
import { finalizeVideoFile } from "@/lib/video/finalize-video-file";
import { dedupeStorageImagePaths } from "@/lib/video/reference-image-dedup";
import type { VideoGenContext, VideoGenHooks } from "@/lib/providers/types";
import type { Prisma } from "@prisma/client";

function buildVideoHooks(ids: {
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
      // Ép về string kẻo Prisma từ chối errorDetail và variant kẹt GENERATING mãi
      await prisma.videoVariant.update({
        where: { id: ids.variantId },
        data: { status: "FAILED", errorDetail: toErrorMessage(message), completedAt: new Date() },
      }).catch(() => {});
    },
  };
}

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

  const filmId = scene.episode.filmId;
  const episodeId = scene.episodeId;

  // Last frame của scene trước cho chaining — cùng quy tắc chọn với luồng tạo ảnh scene
  const prevScene = await prisma.scene.findFirst({
    where: { episodeId, order: { lt: scene.order } },
    orderBy: { order: "desc" },
    include: {
      selectedVideo: true,
      videoVariants: {
        where: { status: "DONE", lastFramePath: { not: null } },
        orderBy: { completedAt: "desc" },
      },
    },
  });
  const previousVariant = pickLastFrameVariant(prevScene?.selectedVideo, prevScene?.videoVariants);

  const useLastFrameChaining = typeof body.useLastFrameChaining === "boolean"
    ? body.useLastFrameChaining
    : scene.useLastFrameChaining;
  const sceneReferenceImages = listSceneCompositeImages(filmId, episodeId, scene.id);
  const previousSceneFirstFrame = useLastFrameChaining
    ? resolvePreviousSceneFirstFrame(previousVariant)
    : undefined;
  const selectedInitialImage = scene.compositeImagePath
    && ["composite_", "initial_"].some((prefix) => path.basename(scene.compositeImagePath!).startsWith(prefix))
    ? sceneReferenceImages.find(
        (image) => storageRelative(image.absPath) === scene.compositeImagePath
      )
    : undefined;
  const validPreviousSceneFirstFrame = previousSceneFirstFrame && fs.existsSync(previousSceneFirstFrame)
    ? previousSceneFirstFrame
    : undefined;
  const validCurrentSceneInitialImage = selectedInitialImage?.absPath
    && fs.existsSync(selectedInitialImage.absPath)
    ? selectedInitialImage.absPath
    : undefined;
  const inputImagePath = validCurrentSceneInitialImage;
  const firstFrameImagePath = validPreviousSceneFirstFrame;
  const firstFrameSource: VideoGenContext["firstFrameSource"] = firstFrameImagePath
    ? "previous_scene"
    : "none";
  const referenceImagePath = inputImagePath
    ? storageRelative(inputImagePath)
    : null;
  const contentReferenceImagePaths: string[] = [];
  const videoParams = {
    ...requestedParams,
    negativePrompt: typeof requestedParams.negativePrompt === "string"
      ? requestedParams.negativePrompt.trim()
      : scene.negativePrompt,
    seed: randomInt(0, 2 ** 31),
    referenceImagePath,
    firstFrameReferencePath: firstFrameImagePath ? storageRelative(firstFrameImagePath) : null,
    useLastFrameChaining,
  };

  const providerName = resolveVideoProviderName(bodyProvider);
  const provider = getVideoProvider(providerName);

  const baseCtx: Omit<VideoGenContext, "variantId"> = {
    scene: scene as unknown as VideoGenContext["scene"],
    videoParams,
    filmId,
    episodeId,
    inputImagePath,
    firstFrameImagePath,
    firstFrameSource,
    contentReferenceImagePaths,
  };

  const validationError = provider.validate(baseCtx);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const variant = await prisma.videoVariant.create({
    data: {
      sceneId,
      paramsSnapshot: videoParams,
      compositeImagePath: referenceImagePath,
      workflowSnapshot: {},
      status: "QUEUED",
      strategy: "i2v_single",
      provider: serializeGenerationProviderName(providerName),
      referenceImagePaths: dedupeStorageImagePaths([
        ...(referenceImagePath ? [referenceImagePath] : []),
        ...(firstFrameImagePath ? [storageRelative(firstFrameImagePath)] : []),
        ...contentReferenceImagePaths.map((imagePath) => storageRelative(imagePath)),
      ]),
    },
  });

  const ctx: VideoGenContext = { ...baseCtx, variantId: variant.id };
  const hooks = buildVideoHooks({ variantId: variant.id, filmId, episodeId, sceneId });

  // Fire-and-forget: tiến trình được theo dõi qua DB (VariantList polling / recover)
  void provider.runVideoGeneration(ctx, hooks).catch((e) => hooks.onError(toErrorMessage(e)));

  return NextResponse.json({ variantId: variant.id }, { status: 202 });
}
