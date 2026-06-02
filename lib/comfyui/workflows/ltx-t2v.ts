import { LTX_VIDEO_DEFAULTS } from "../defaults";

export const WORKFLOW_VERSION = "1.0.0";
export const REQUIRED_NODES = [
  "LTXVConditioning",
  "EmptyLTXVLatentVideo",
  "LTXVScheduler",
  "SamplerCustomAdvanced",
];

interface LTXT2VParams {
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  numFrames: number;
  fps: number;
  seed: number;
  steps: number;
  cfg: number;
  videoModel: string;
  t5Model?: string;
  filenamePrefix?: string;
}

export function buildLTXT2VWorkflow(params: LTXT2VParams): Record<string, unknown> {
  const seed = params.seed === -1 ? Math.floor(Math.random() * 2 ** 32) : params.seed;
  const clipRef: [string, number] = params.t5Model ? ["0", 0] : ["1", 1];
  const d = LTX_VIDEO_DEFAULTS;

  return {
    ...(params.t5Model ? {
      "0": {
        class_type: "CLIPLoader",
        inputs: { clip_name: params.t5Model, type: "ltxv" },
      },
    } : {}),
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: params.videoModel },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: params.positivePrompt, clip: clipRef },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: params.negativePrompt || "blurry, deformed, ugly, bad quality", clip: clipRef },
    },
    "4": {
      class_type: "LTXVConditioning",
      inputs: { positive: ["2", 0], negative: ["3", 0], frame_rate: params.fps },
    },
    "5": {
      class_type: "EmptyLTXVLatentVideo",
      inputs: { width: params.width, height: params.height, length: params.numFrames, batch_size: 1 },
    },
    "6": {
      class_type: "ModelSamplingLTXV",
      inputs: { model: ["1", 0], max_shift: d.maxShift, base_shift: d.baseShift },
    },
    "7": {
      class_type: "CFGGuider",
      inputs: { model: ["6", 0], positive: ["4", 0], negative: ["4", 1], cfg: params.cfg },
    },
    "8": {
      class_type: "RandomNoise",
      inputs: { noise_seed: seed },
    },
    "9": {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" },
    },
    "10": {
      class_type: "LTXVScheduler",
      inputs: {
        steps: params.steps,
        max_shift: d.maxShift,
        base_shift: d.baseShift,
        stretch: true,
        terminal: 0.1,
        latent: ["5", 0],
      },
    },
    "11": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["8", 0],
        guider: ["7", 0],
        sampler: ["9", 0],
        sigmas: ["10", 0],
        latent_image: ["5", 0],
      },
    },
    "12": {
      class_type: "VAEDecodeTiled",
      inputs: {
        samples: ["11", 0],
        vae: ["1", 2],
        tile_size: d.tileSize,
        overlap: d.tileOverlap,
        temporal_size: d.temporalSize,
        temporal_overlap: d.temporalOverlap,
      },
    },
    "13": {
      class_type: "SaveAnimatedWEBP",
      inputs: {
        images: ["12", 0],
        filename_prefix: params.filenamePrefix ?? "ltx_t2v",
        fps: params.fps,
        lossless: false,
        quality: 85,
        method: "default",
      },
    },
  };
}
