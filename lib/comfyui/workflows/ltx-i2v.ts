import { LTX_VIDEO_DEFAULTS } from "../defaults";

export const WORKFLOW_VERSION = "1.0.0";
export const REQUIRED_NODES = [
  "LTXVConditioning",
  "LTXVAddGuide",
  "EmptyLTXVLatentVideo",
  "LTXVScheduler",
  "SamplerCustomAdvanced",
];

interface LTXI2VParams {
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
  firstFrameImage: string;
  lastFrameImage?: string;
  firstFrameStrength: number;
  lastFrameStrength: number;
  filenamePrefix?: string;
}

export function buildLTXI2VWorkflow(params: LTXI2VParams): Record<string, unknown> {
  const seed = params.seed === -1 ? Math.floor(Math.random() * 2 ** 32) : params.seed;
  const clipRef: [string, number] = params.t5Model ? ["0", 0] : ["1", 1];
  const d = LTX_VIDEO_DEFAULTS;

  const workflow: Record<string, unknown> = {
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
      inputs: { text: params.negativePrompt || "blurry, deformed", clip: clipRef },
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
  };

  // Track conditioning/latent chain through LTXVAddGuide nodes
  let condRef: [string, number] = ["4", 0];
  let negRef:  [string, number] = ["4", 1];
  let latentRef: [string, number] = ["5", 0];
  let nextId = 7;

  const addGuide = (imgFilename: string, frameIdx: number, strength: number) => {
    const loadId = String(nextId++);
    const guideId = String(nextId++);
    workflow[loadId] = {
      class_type: "LoadImage",
      inputs: { image: imgFilename, upload: "image" },
    };
    workflow[guideId] = {
      class_type: "LTXVAddGuide",
      inputs: {
        positive: condRef,
        negative: negRef,
        vae: ["1", 2],
        latent: latentRef,
        image: [loadId, 0],
        frame_idx: frameIdx,
        strength,
      },
    };
    condRef   = [guideId, 0];
    negRef    = [guideId, 1];
    latentRef = [guideId, 2];
  };

  if (params.firstFrameImage) {
    addGuide(params.firstFrameImage, 0, params.firstFrameStrength);
  }
  if (params.lastFrameImage) {
    addGuide(params.lastFrameImage, params.numFrames - 1, params.lastFrameStrength);
  }

  const guiderId     = String(nextId++);
  const noiseId      = String(nextId++);
  const samplerId    = String(nextId++);
  const schedulerId  = String(nextId++);
  const samplerAdvId = String(nextId++);
  const vaeDecodeId  = String(nextId++);
  const saveId       = String(nextId++);

  workflow[guiderId] = {
    class_type: "CFGGuider",
    inputs: { model: ["6", 0], positive: condRef, negative: negRef, cfg: params.cfg },
  };
  workflow[noiseId] = {
    class_type: "RandomNoise",
    inputs: { noise_seed: seed },
  };
  workflow[samplerId] = {
    class_type: "KSamplerSelect",
    inputs: { sampler_name: "euler" },
  };
  workflow[schedulerId] = {
    class_type: "LTXVScheduler",
    inputs: {
      steps: params.steps,
      max_shift: d.maxShift,
      base_shift: d.baseShift,
      stretch: true,
      terminal: 0.1,
      latent: latentRef,
    },
  };
  workflow[samplerAdvId] = {
    class_type: "SamplerCustomAdvanced",
    inputs: {
      noise: [noiseId, 0],
      guider: [guiderId, 0],
      sampler: [samplerId, 0],
      sigmas: [schedulerId, 0],
      latent_image: latentRef,
    },
  };
  workflow[vaeDecodeId] = {
    class_type: "VAEDecodeTiled",
    inputs: {
      samples: [samplerAdvId, 0],
      vae: ["1", 2],
      tile_size: d.tileSize,
      overlap: d.tileOverlap,
      temporal_size: d.temporalSize,
      temporal_overlap: d.temporalOverlap,
    },
  };
  workflow[saveId] = {
    class_type: "SaveAnimatedWEBP",
    inputs: {
      images: [vaeDecodeId, 0],
      filename_prefix: params.filenamePrefix ?? "ltx_i2v",
      fps: params.fps,
      lossless: false,
      quality: 85,
      method: "default",
    },
  };

  return workflow;
}
