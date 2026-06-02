import path from "path";
import { STORAGE_ROOT } from "@/lib/storage";
import { chooseStrategy } from "./strategy";
import { buildLTXT2VWorkflow } from "./workflows/ltx-t2v";
import { buildLTXI2VWorkflow } from "./workflows/ltx-i2v";
import { buildSVDWorkflow } from "./workflows/svd";
import { buildWanVideoWorkflow } from "./workflows/wan-video";
import {
  LTX_VIDEO_DEFAULTS,
  WAN_DEFAULTS,
  SVD_DEFAULTS,
  QUALITY_STEPS,
  ASPECT_RATIOS,
  WAN_SAMPLER_DEFAULTS,
} from "./defaults";
import type { Scene } from "@/types/scene";
import type { StoryObject } from "@/types/object";
import type { VideoVariant } from "@/types/video";

const LTXV_PATTERNS = ["ltx", "ltxv", "ltx-video", "lightricks"];
const SVD_PATTERNS  = ["svd", "stable-video", "stable_video"];
const WAN_PATTERNS  = ["wan", "wan2", "wanvideo", "wan-video"];

const matchAny = (name: string, pats: string[]) =>
  pats.some((p) => name.toLowerCase().includes(p));

function isLTXVModel(m: string) { return matchAny(m, LTXV_PATTERNS); }
function isSVDModel(m: string)  { return matchAny(m, SVD_PATTERNS); }
function isWanModel(m: string)  { return matchAny(m, WAN_PATTERNS); }

export interface BuildWorkflowParams {
  scene: Scene & {
    objectLinks?: Array<{ role: string; strengthHint?: number; object: StoryObject }>;
  };
  objects: StoryObject[];
  variantId: string;
  filmId: string;
  episodeId: string;
  videoParams: Record<string, unknown>;
  previousVariant?: VideoVariant | null;
}

/** Build enriched prompt by appending linked object descriptions if not already present */
function buildPrompt(basePrompt: string | null | undefined, objectLinks: BuildWorkflowParams["scene"]["objectLinks"]): string {
  const base = (basePrompt ?? "").trim();
  const descs = (objectLinks ?? [])
    .map((l) => l.object?.descriptionEn?.trim())
    .filter((d): d is string => !!d && !base.includes(d));
  return descs.length > 0 ? `${base}. ${descs.join(", ")}` : base;
}

/** Resolve video dimensions from params → scene → aspect ratio → model defaults */
function resolveDimensions(
  videoParams: Record<string, unknown>,
  modelDefaults: { width: number; height: number },
): { width: number; height: number } {
  if (videoParams.width && videoParams.height) {
    return { width: videoParams.width as number, height: videoParams.height as number };
  }
  const ratio = videoParams.aspectRatio as string | undefined;
  if (ratio && ASPECT_RATIOS[ratio]) return ASPECT_RATIOS[ratio];
  return { width: modelDefaults.width, height: modelDefaults.height };
}

export async function buildWorkflow(params: BuildWorkflowParams): Promise<{
  workflow: Record<string, unknown>;
  strategy: string;
  uploadedImages: string[];
}> {
  const { scene, objects, videoParams, previousVariant } = params;
  const strategy = chooseStrategy(scene, objects);

  const qualityPreset = (videoParams.qualityPreset as string) ?? "balanced";
  const quality = QUALITY_STEPS[qualityPreset] ?? QUALITY_STEPS.balanced;

  const videoModel =
    (videoParams.videoModel as string) ||
    scene.videoModel ||
    process.env.DEFAULT_VIDEO_MODEL ||
    "svd_xt.safetensors";

  const promptEn = buildPrompt(
    (videoParams.promptEn as string) || scene.promptEnOverride || scene.promptEn,
    scene.objectLinks,
  );

  const seed = (videoParams.seed as number) ?? -1;
  const steps = (videoParams.steps as number) ?? quality.steps;
  const cfg = (videoParams.cfg as number) ?? (videoParams.guidance as number) ?? LTX_VIDEO_DEFAULTS.cfg;
  const firstFrameStrength = (videoParams.firstFrameStrength as number) ?? LTX_VIDEO_DEFAULTS.firstFrameStrength;
  const lastFrameStrength  = (videoParams.lastFrameStrength  as number) ?? LTX_VIDEO_DEFAULTS.lastFrameStrength;

  const uploadedImages: string[] = [];

  // Primary character ref image (CHARACTER with isMain ref or first ref)
  const characters = (scene.objectLinks ?? [])
    .filter((l) => l.object?.type === "CHARACTER" && l.object != null);

  let firstFrameImage = "";
  if (characters.length > 0) {
    const mainChar = characters[0].object!;
    const mainImg = mainChar.refImages?.find((i) => i.isMain) ?? mainChar.refImages?.[0];
    if (mainImg?.path) {
      firstFrameImage = path.basename(mainImg.path);
      uploadedImages.push(path.resolve(STORAGE_ROOT, mainImg.path));
    }
  }

  // Last frame from previous scene for chaining
  let lastFrameImage: string | undefined;
  if (scene.useLastFrameChaining && previousVariant?.lastFramePath) {
    lastFrameImage = path.basename(previousVariant.lastFramePath);
    uploadedImages.push(path.resolve(STORAGE_ROOT, previousVariant.lastFramePath));
  }

  // ── WAN ─────────────────────────────────────────────────────────────────────
  if (isWanModel(videoModel)) {
    const { width, height } = resolveDimensions(videoParams, WAN_DEFAULTS);
    const numFrames = Math.min(
      (videoParams.numFrames as number) ?? WAN_DEFAULTS.maxNumFrames,
      WAN_DEFAULTS.maxNumFrames,
    );
    const fps = (videoParams.fps as number) ?? WAN_DEFAULTS.fps;

    return {
      workflow: buildWanVideoWorkflow({
        positivePrompt: promptEn,
        negativePrompt: (videoParams.negativePrompt as string) || "",
        model: videoModel,
        width,
        height,
        numFrames,
        fps,
        seed,
        steps,
        cfg: (videoParams.cfg as number) ?? (videoParams.guidance as number) ?? WAN_DEFAULTS.cfg,
        initImageFilename: firstFrameImage || undefined,
        lastFrameFilename: lastFrameImage,
        filenamePrefix: params.variantId,
        samplerDefaults: WAN_SAMPLER_DEFAULTS,
      }),
      strategy: firstFrameImage ? "i2v_single" : "t2v",
      uploadedImages,
    };
  }

  // ── SVD ─────────────────────────────────────────────────────────────────────
  if (isSVDModel(videoModel)) {
    const { width, height } = resolveDimensions(videoParams, SVD_DEFAULTS);
    const numFrames = Math.min(
      (videoParams.numFrames as number) ?? SVD_DEFAULTS.maxNumFrames,
      SVD_DEFAULTS.maxNumFrames,
    );

    return {
      workflow: buildSVDWorkflow({
        model: videoModel,
        initImagePath: firstFrameImage || undefined,
        promptEn,
        width,
        height,
        videoFrames: numFrames,
        motionBucketId: (videoParams.motionBucketId as number) ?? SVD_DEFAULTS.motionBucketId,
        fps: (videoParams.fps as number) ?? SVD_DEFAULTS.fps,
        seed,
        steps,
        cfg: SVD_DEFAULTS.cfg,
        augmentationLevel: SVD_DEFAULTS.augmentationLevel,
        filenamePrefix: params.variantId,
      }),
      strategy: firstFrameImage ? "i2v_single" : "t2v",
      uploadedImages,
    };
  }

  // ── LTX-Video ───────────────────────────────────────────────────────────────
  if (isLTXVModel(videoModel)) {
    const { width, height } = resolveDimensions(videoParams, LTX_VIDEO_DEFAULTS);
    const numFrames = Math.min(
      (videoParams.numFrames as number) ?? LTX_VIDEO_DEFAULTS.numFrames,
      LTX_VIDEO_DEFAULTS.maxNumFrames,
    );
    const fps = (videoParams.fps as number) ?? LTX_VIDEO_DEFAULTS.fps;
    const t5Model = process.env.DEFAULT_T5_MODEL || undefined;

    if (strategy === "T2V") {
      return {
        workflow: buildLTXT2VWorkflow({
          positivePrompt: promptEn,
          negativePrompt: (videoParams.negativePrompt as string) || "",
          width,
          height,
          numFrames,
          fps,
          seed,
          steps,
          cfg,
          videoModel,
          t5Model,
          filenamePrefix: params.variantId,
        }),
        strategy: "t2v",
        uploadedImages: [],
      };
    }

    return {
      workflow: buildLTXI2VWorkflow({
        positivePrompt: promptEn,
        negativePrompt: (videoParams.negativePrompt as string) || "",
        width,
        height,
        numFrames,
        fps,
        seed,
        steps,
        cfg,
        videoModel,
        t5Model,
        firstFrameImage,
        lastFrameImage,
        firstFrameStrength,
        lastFrameStrength,
        filenamePrefix: params.variantId,
      }),
      strategy: strategy.toLowerCase(),
      uploadedImages,
    };
  }

  // ── Fallback: unknown model → treat as SVD ──────────────────────────────────
  const { width, height } = resolveDimensions(videoParams, SVD_DEFAULTS);
  return {
    workflow: buildSVDWorkflow({
      model: videoModel,
      initImagePath: firstFrameImage || undefined,
      promptEn,
      width,
      height,
      videoFrames: SVD_DEFAULTS.maxNumFrames,
      motionBucketId: SVD_DEFAULTS.motionBucketId,
      fps: SVD_DEFAULTS.fps,
      seed,
      steps,
      cfg: SVD_DEFAULTS.cfg,
      augmentationLevel: SVD_DEFAULTS.augmentationLevel,
      filenamePrefix: params.variantId,
    }),
    strategy: firstFrameImage ? "i2v_single" : "t2v",
    uploadedImages,
  };
}
