import path from "path";
import {
  agnesDownload,
  agnesGetVideoStatus,
  agnesGroundVideoPrompt,
  agnesPollVideo,
  agnesSubmitVideo,
} from "@/lib/providers/agnes";
import type { AgnesVideoImageRef } from "@/lib/providers/agnes";
import { buildPrompt } from "@/lib/comfyui/prompt";
import { LTX_VIDEO_DEFAULTS, ASPECT_RATIOS } from "@/lib/comfyui/defaults";
import { storageRelative } from "@/lib/storage";
import { toErrorMessage } from "@/lib/utils/errors";
import type {
  RecoverableVariant,
  VideoGenContext,
  VideoGenHooks,
  VideoProvider,
  VideoRecoveryResult,
} from "@/lib/providers/types";

function resolveDimensions(videoParams: Record<string, unknown>) {
  const ratio = videoParams.aspectRatio as string | undefined;
  const dims = ratio && ASPECT_RATIOS[ratio] ? ASPECT_RATIOS[ratio] : LTX_VIDEO_DEFAULTS;
  return {
    width: (videoParams.width as number) || dims.width,
    height: (videoParams.height as number) || dims.height,
  };
}

function extFromUrl(url: string): string {
  return path.extname(url).split("?")[0] || ".mp4";
}

function buildImageToVideoPrompt(
  scenePrompt: string,
  source: VideoGenContext["firstFrameSource"]
): string {
  const sourceDirection = source === "previous_scene"
    ? "The supplied opening frame is the exact final frame of the previous scene. Preserve visual continuity at the cut, then perform the requested scene action."
    : "The supplied opening frame comes from Initial reference image and is the visual source of truth for this scene. Preserve its subjects, environment, identity, composition, colors, and recognizable details throughout the video.";
  return `${sourceDirection} Stay faithful to the visual reference requirements in the direction below. Avoid abrupt unrelated changes, replacement subjects, or a disconnected visual style. Keep all motion coherent and temporally consistent.

Scene direction:
${scenePrompt}`;
}

function buildVideoNegativePrompt(sceneNegativePrompt: string | undefined, hasImage: boolean): string | undefined {
  const consistencyConstraints = hasImage
    ? "unrelated content, abrupt scene change, subject replacement, identity drift, sudden cut, morphing, visual discontinuity"
    : "";
  return [sceneNegativePrompt?.trim(), consistencyConstraints].filter(Boolean).join(", ") || undefined;
}

export class AgnesVideoProvider implements VideoProvider {
  readonly name = "agnes" as const;

  validate(): string | null {
    return null;
  }

  async runVideoGeneration(ctx: VideoGenContext, hooks: VideoGenHooks): Promise<void> {
    const { scene, videoParams } = ctx;
    const scenePrompt = buildPrompt(
      (videoParams.promptEn as string) || scene.promptEnOverride || scene.promptEn,
      scene.objectLinks
    );
    const { width, height } = resolveDimensions(videoParams);
    const imagePath = ctx.firstFrameImagePath;

    // Agnes chỉ hỗ trợ một ảnh cho image-to-video. Nhiều ảnh là keyframes theo thời gian,
    // không phải identity references; gửi ảnh object ở đây sẽ ép video kết thúc ở ảnh cuối.
    const images: AgnesVideoImageRef[] = imagePath
      ? [{ pathOrUrl: imagePath, role: "first_frame" }]
      : [];
    const strategy = imagePath ? "i2v_single" : "t2v";
    const sceneNegativePrompt = typeof videoParams.negativePrompt === "string"
      ? videoParams.negativePrompt
      : scene.negativePrompt;
    const providerNegativePrompt = buildVideoNegativePrompt(sceneNegativePrompt, !!imagePath);

    try {
      const groundedPrompt = await agnesGroundVideoPrompt(
        scenePrompt,
        ctx.contentReferenceImagePaths
      );
      const providerPrompt = imagePath
        ? buildImageToVideoPrompt(groundedPrompt, ctx.firstFrameSource)
        : groundedPrompt;
      const job = await agnesSubmitVideo({
        prompt: providerPrompt,
        negativePrompt: providerNegativePrompt,
        width,
        height,
        numFrames: videoParams.numFrames as number | undefined,
        seed: (videoParams.seed as number) ?? undefined,
        images,
      });

      await hooks.onSubmitted({
        strategy,
        externalJobId: job.videoId ?? job.taskId,
        workflowSnapshot: {
          mode: imagePath ? "image-to-video" : "text-to-video",
          firstFrameSource: ctx.firstFrameSource,
          prompt: providerPrompt,
          negativePrompt: providerNegativePrompt ?? "",
          imageCount: images.length,
          contentReferenceCount: ctx.contentReferenceImagePaths.length,
        },
        referenceImagePaths: [
          ...images
            .filter((image) => !/^https?:\/\//i.test(image.pathOrUrl))
            .map((image) => storageRelative(image.pathOrUrl)),
          ...ctx.contentReferenceImagePaths.map((referencePath) => storageRelative(referencePath)),
        ],
      });

      const finalStatus = await agnesPollVideo(job, (s) => {
        void hooks.onProgress({ step: s.progress, total: 100, statusMessage: s.status });
      });

      if (finalStatus.status !== "completed" || !finalStatus.url) {
        await hooks.onError(finalStatus.error ?? "Agnes AI không trả về video");
        return;
      }

      const buffer = await agnesDownload(finalStatus.url);
      await hooks.onComplete(buffer, extFromUrl(finalStatus.url));
    } catch (e) {
      await hooks.onError(toErrorMessage(e));
    }
  }

  async recoverVideo(variant: RecoverableVariant, hooks: VideoGenHooks): Promise<VideoRecoveryResult> {
    if (!variant.externalJobId) {
      return { status: "no_prompt_id", message: "Variant was never submitted to Agnes AI" };
    }

    const status = await agnesGetVideoStatus({ taskId: variant.externalJobId, videoId: variant.externalJobId });

    if (status.status === "failed") {
      const message = status.error ?? "Agnes AI execution error";
      await hooks.onError(message);
      return { status: "provider_error", message };
    }
    if (status.status !== "completed" || !status.url) {
      return { status: "still_running", message: "Job is still running on Agnes AI" };
    }

    const buffer = await agnesDownload(status.url);
    await hooks.onComplete(buffer, extFromUrl(status.url));
    return { status: "recovered" };
  }
}
