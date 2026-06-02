import path from "path";
import { STORAGE_ROOT } from "@/lib/storage";
import { chooseStrategy } from "./strategy";
import { buildLTXT2VWorkflow } from "./workflows/ltx-t2v";
import { buildLTXI2VWorkflow } from "./workflows/ltx-i2v";
import { buildSVDWorkflow } from "./workflows/svd";
import { buildWanVideoWorkflow } from "./workflows/wan-video";
import { LTX_VIDEO_DEFAULTS, QUALITY_STEPS } from "./defaults";
import type { Scene } from "@/types/scene";
import type { StoryObject } from "@/types/object";
import type { VideoVariant } from "@/types/video";

const LTXV_PATTERNS  = ["ltx", "ltxv", "ltx-video", "lightricks"];
const SVD_PATTERNS   = ["svd", "stable-video", "stable_video"];
const WAN_PATTERNS   = ["wan", "wan2", "wanvideo", "wan-video"];

const matchAny = (name: string, pats: string[]) =>
  pats.some((p) => name.toLowerCase().includes(p));

function isLTXVModel(m: string)  { return matchAny(m, LTXV_PATTERNS); }
function isSVDModel(m: string)   { return matchAny(m, SVD_PATTERNS); }
function isWanModel(m: string)   { return matchAny(m, WAN_PATTERNS); }

export interface BuildWorkflowParams {
  scene: Scene & {
    objectLinks?: Array<{ role: string; object: StoryObject }>;
  };
  objects: StoryObject[];
  variantId: string;
  filmId: string;
  episodeId: string;
  videoParams: Record<string, unknown>;
  previousVariant?: VideoVariant | null;
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

  const promptEn = (videoParams.promptEn as string) || scene.promptEnOverride || scene.promptEn;
  const numFrames = (videoParams.numFrames as number) ?? LTX_VIDEO_DEFAULTS.numFrames;
  const seed = (videoParams.seed as number) ?? -1;
  const steps = (videoParams.steps as number) ?? quality.steps;
  const cfg = (videoParams.cfg as number) ?? LTX_VIDEO_DEFAULTS.cfg;
  const firstFrameStrength = (videoParams.firstFrameStrength as number) ?? LTX_VIDEO_DEFAULTS.firstFrameStrength;
  const lastFrameStrength = (videoParams.lastFrameStrength as number) ?? LTX_VIDEO_DEFAULTS.lastFrameStrength;

  const uploadedImages: string[] = [];

  // Get character reference images
  const characters = (scene.objectLinks ?? [])
    .filter((l) => l.object?.type === "CHARACTER")
    .map((l) => l.object)
    .filter((o): o is NonNullable<typeof o> => o != null);

  let firstFrameImage = "";
  if (characters.length > 0 && characters[0].refImages?.length) {
    const mainImg = characters[0].refImages.find((i) => i.isMain) ?? characters[0].refImages[0];
    if (mainImg?.path) {
      firstFrameImage = path.basename(mainImg.path);
      uploadedImages.push(path.resolve(STORAGE_ROOT, mainImg.path));
    }
  }

  let lastFrameImage: string | undefined;
  if (scene.useLastFrameChaining && previousVariant?.lastFramePath) {
    lastFrameImage = path.basename(previousVariant.lastFramePath);
    uploadedImages.push(path.resolve(STORAGE_ROOT, previousVariant.lastFramePath));
  }

  // Route to correct workflow based on model type
  if (isWanModel(videoModel)) {
    return {
      workflow: buildWanVideoWorkflow({
        positivePrompt: promptEn,
        negativePrompt: "",
        model: videoModel,
        width: 1280,
        height: 720,
        numFrames: Math.min(numFrames, 81),
        seed,
        steps,
        cfg,
        initImageFilename: firstFrameImage || undefined,
        lastFrameFilename: lastFrameImage,
        filenamePrefix: params.variantId,
      }),
      strategy: firstFrameImage ? "i2v_single" : "t2v",
      uploadedImages,
    };
  }

  if (isSVDModel(videoModel)) {
    return {
      workflow: buildSVDWorkflow({
        model: videoModel,
        initImagePath: firstFrameImage || undefined,
        promptEn,
        width: 1024,
        height: 576,
        videoFrames: Math.min(numFrames, 25),
        motionBucketId: 127,
        fps: 6,
        seed,
        steps,
        cfg: 2.5,
        augmentationLevel: 0.0,
        filenamePrefix: params.variantId,
      }),
      strategy: firstFrameImage ? "i2v_single" : "t2v",
      uploadedImages,
    };
  }

  if (isLTXVModel(videoModel)) {
    if (strategy === "T2V") {
      return {
        workflow: buildLTXT2VWorkflow({
          positivePrompt: promptEn,
          negativePrompt: "",
          width: 1280,
          height: 720,
          numFrames,
          seed,
          steps,
          cfg,
          videoModel,
          filenamePrefix: params.variantId,
        }),
        strategy: "t2v",
        uploadedImages: [],
      };
    }

    return {
      workflow: buildLTXI2VWorkflow({
        positivePrompt: promptEn,
        negativePrompt: "",
        width: 1280,
        height: 720,
        numFrames,
        seed,
        steps,
        cfg,
        videoModel,
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

  // Unknown model type → fallback to SVD if available, else LTXV T2V
  return {
    workflow: buildSVDWorkflow({
      model: "svd_xt.safetensors",
      initImagePath: firstFrameImage || undefined,
      promptEn,
      width: 1024,
      height: 576,
      videoFrames: 14,
      motionBucketId: 127,
      fps: 6,
      seed,
      steps,
      cfg: 2.5,
      augmentationLevel: 0.0,
      filenamePrefix: params.variantId,
    }),
    strategy: firstFrameImage ? "i2v_single" : "t2v",
    uploadedImages,
  };
}
