import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { resolveFirstFrameImage } from "@/lib/comfyui/prompt";
import { getVideoProvider, resolveVideoProviderName } from "@/lib/providers/registry";
import { newestSceneCompositeImage, storageRelative } from "@/lib/storage";
import { finalizeVideoFile } from "@/lib/video/finalize-video-file";
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
          ...(meta.comfyPromptId !== undefined && { comfyPromptId: meta.comfyPromptId }),
          ...(meta.comfyClientId !== undefined && { comfyClientId: meta.comfyClientId }),
          ...(meta.workflowSnapshot !== undefined && {
            workflowSnapshot: meta.workflowSnapshot as Prisma.InputJsonValue,
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
      // message có thể là object nếu provider trả lỗi lạ — ép về string kẻo Prisma từ chối và variant kẹt GENERATING mãi
      const errorDetail = typeof message === "string" ? message : JSON.stringify(message);
      await prisma.videoVariant.update({
        where: { id: ids.variantId },
        data: { status: "FAILED", errorDetail, completedAt: new Date() },
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

  // Previous scene's last variant, for last-frame chaining
  const prevScene = await prisma.scene.findFirst({
    where: { episodeId, order: scene.order - 1 },
    include: { selectedVideo: true, videoVariants: { orderBy: { completedAt: "desc" }, take: 1 } },
  });
  const previousVariant = prevScene?.selectedVideo ?? prevScene?.videoVariants?.[0] ?? null;

  // Chưa chọn ảnh nào trong mục Initial reference image → tự lấy ảnh mới nhất và lưu làm ảnh được chọn
  if (!scene.compositeImagePath) {
    const newestImage = newestSceneCompositeImage(filmId, episodeId, scene.id);
    if (newestImage) {
      scene.compositeImagePath = storageRelative(newestImage);
      await prisma.scene.update({
        where: { id: scene.id },
        data: { compositeImagePath: scene.compositeImagePath },
      });
    }
  }

  const resolvedFirstFrame = resolveFirstFrameImage(
    scene as unknown as VideoGenContext["scene"],
    previousVariant as VideoGenContext["previousVariant"],
  );
  const firstFrameImagePath = resolvedFirstFrame && fs.existsSync(resolvedFirstFrame)
    ? resolvedFirstFrame
    : undefined;
  const referenceImagePath = firstFrameImagePath
    ? storageRelative(firstFrameImagePath)
    : null;
  const videoParams = {
    ...requestedParams,
    seed: randomInt(0, 2 ** 31),
    referenceImagePath,
  };

  const providerName = resolveVideoProviderName(bodyProvider);
  const provider = getVideoProvider(providerName);

  const baseCtx: Omit<VideoGenContext, "variantId"> = {
    scene: scene as unknown as VideoGenContext["scene"],
    videoParams,
    filmId,
    episodeId,
    firstFrameImagePath,
    previousVariant: previousVariant as VideoGenContext["previousVariant"],
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
      strategy: "t2v",
      provider: providerName === "agnes" ? "AGNES" : "COMFYUI",
    },
  });

  const ctx: VideoGenContext = { ...baseCtx, variantId: variant.id };
  const hooks = buildVideoHooks({ variantId: variant.id, filmId, episodeId, sceneId });

  // Fire-and-forget: tiến trình được theo dõi qua DB (VariantList polling / recover)
  void provider.runVideoGeneration(ctx, hooks).catch((e) => hooks.onError(String(e)));

  return NextResponse.json({ variantId: variant.id }, { status: 202 });
}
