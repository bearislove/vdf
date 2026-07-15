import fs from "fs";
import path from "path";
import { agnesSubmitVideo, agnesPollVideo, agnesGetVideoStatus, agnesDownload } from "@/lib/providers/agnes";
import type { AgnesVideoImageRef } from "@/lib/providers/agnes";
import { buildPrompt } from "@/lib/comfyui/prompt";
import { LTX_VIDEO_DEFAULTS, ASPECT_RATIOS } from "@/lib/comfyui/defaults";
import { STORAGE_ROOT } from "@/lib/storage";
import type { RefImage } from "@/types/object";
import type {
  RecoverableVariant,
  SceneWithLinks,
  VideoGenContext,
  VideoGenHooks,
  VideoProvider,
  VideoRecoveryResult,
} from "@/lib/providers/types";

const MAX_VIDEO_IMAGES = 4;

/**
 * Ảnh tham chiếu của các object gắn với scene (mỗi object lấy ảnh main, giống luồng tạo ảnh scene)
 * — gửi kèm để Agnes giữ nhận dạng nhân vật/bối cảnh. CHARACTER được ưu tiên xếp trước vì tổng số ảnh bị giới hạn.
 */
function collectObjectReferenceImages(scene: SceneWithLinks): string[] {
  const links = [...(scene.objectLinks ?? [])].sort(
    (a, b) => Number(b.object?.type === "CHARACTER") - Number(a.object?.type === "CHARACTER")
  );
  const paths = links.flatMap((link) => {
    const images = (link.object?.refImages ?? []) as RefImage[];
    const image = images.find((item) => item.isMain) ?? images[0];
    if (!image?.path) return [];
    const absPath = path.resolve(STORAGE_ROOT, image.path);
    return fs.existsSync(absPath) ? [absPath] : [];
  });
  return Array.from(new Set(paths));
}

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

export class AgnesVideoProvider implements VideoProvider {
  readonly name = "agnes" as const;

  validate(ctx: Omit<VideoGenContext, "variantId">): string | null {
    const characterCount = (ctx.scene.objectLinks ?? [])
      .filter((link) => link.object?.type === "CHARACTER").length;
    // Nhiều nhân vật vẫn chạy được nếu có ảnh tham chiếu object (multi-reference mode)
    if (characterCount >= 2 && !ctx.firstFrameImagePath && collectObjectReferenceImages(ctx.scene).length === 0) {
      return "Scene có nhiều nhân vật. Hãy tạo ảnh khởi đầu hoặc thêm ảnh tham chiếu cho nhân vật trước khi dùng Agnes AI.";
    }
    return null;
  }

  async runVideoGeneration(ctx: VideoGenContext, hooks: VideoGenHooks): Promise<void> {
    const { scene, videoParams } = ctx;
    const prompt = buildPrompt(
      (videoParams.promptEn as string) || scene.promptEnOverride || scene.promptEn,
      scene.objectLinks
    );
    const { width, height } = resolveDimensions(videoParams);
    const imagePath = ctx.firstFrameImagePath;

    // First frame (nếu có) đi trước với role first_frame; sau đó là ảnh tham chiếu object
    // để giữ nhận dạng — giống luồng tạo ảnh. Agnes giới hạn tối đa 4 ảnh.
    const images: AgnesVideoImageRef[] = [];
    if (imagePath) images.push({ pathOrUrl: imagePath, role: "first_frame" });
    for (const refPath of collectObjectReferenceImages(scene)) {
      if (images.length >= MAX_VIDEO_IMAGES) break;
      if (refPath === imagePath) continue;
      images.push({ pathOrUrl: refPath, role: "reference" });
    }

    const strategy = images.length === 0
      ? "t2v"
      : images.length === 1
        ? "i2v_single"
        : imagePath ? "keyframes" : "i2v_refs";

    try {
      const job = await agnesSubmitVideo({
        prompt,
        negativePrompt: (videoParams.negativePrompt as string) || undefined,
        width,
        height,
        numFrames: videoParams.numFrames as number | undefined,
        seed: (videoParams.seed as number) ?? undefined,
        images,
      });

      await hooks.onSubmitted({
        strategy,
        externalJobId: job.videoId ?? job.taskId,
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
      await hooks.onError(String(e));
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
