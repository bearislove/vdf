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
  seed: number;
  steps: number;
  cfg: number;
  videoModel: string;
  filenamePrefix?: string;
}

export function buildLTXT2VWorkflow(params: LTXT2VParams): Record<string, unknown> {
  const seed = params.seed === -1 ? Math.floor(Math.random() * 2 ** 32) : params.seed;

  // LTXVConditioning: inputs=(positive, negative, frame_rate), outputs=(CONDITIONING, CONDITIONING)
  // EmptyLTXVLatentVideo: outputs=(LATENT,)
  // LTXVScheduler: inputs=(steps, latent, ...), outputs=(SIGMAS,)
  // SamplerCustomAdvanced: inputs=(noise, guider, sampler, sigmas, latent_image), outputs=(LATENT, LATENT)
  // CFGGuider: inputs=(model, positive, negative, cfg), outputs=(GUIDER,)

  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: params.videoModel },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: params.positivePrompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: params.negativePrompt || "blurry, deformed, ugly, bad quality",
        clip: ["1", 1],
      },
    },
    // LTXVConditioning: (positive, negative, frame_rate) → (pos_cond, neg_cond)
    "4": {
      class_type: "LTXVConditioning",
      inputs: {
        positive: ["2", 0],
        negative: ["3", 0],
        frame_rate: 24,
      },
    },
    // EmptyLTXVLatentVideo → latent
    "5": {
      class_type: "EmptyLTXVLatentVideo",
      inputs: {
        width: params.width,
        height: params.height,
        length: params.numFrames,
        batch_size: 1,
      },
    },
    // ModelSamplingLTXV adjusts sigma schedule
    "6": {
      class_type: "ModelSamplingLTXV",
      inputs: { model: ["1", 0], max_shift: 2.05, base_shift: 0.95 },
    },
    // CFGGuider
    "7": {
      class_type: "CFGGuider",
      inputs: {
        model: ["6", 0],
        positive: ["4", 0],
        negative: ["4", 1],
        cfg: params.cfg,
      },
    },
    // RandomNoise
    "8": {
      class_type: "RandomNoise",
      inputs: { noise_seed: seed },
    },
    // KSamplerSelect
    "9": {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" },
    },
    // LTXVScheduler: latent from EmptyLTXVLatentVideo
    "10": {
      class_type: "LTXVScheduler",
      inputs: {
        steps: params.steps,
        max_shift: 2.05,
        base_shift: 0.95,
        stretch: true,
        terminal: 0.1,
        latent: ["5", 0],
      },
    },
    // SamplerCustomAdvanced: latent_image from EmptyLTXVLatentVideo
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
    // VAEDecodeTiled
    "12": {
      class_type: "VAEDecodeTiled",
      inputs: { samples: ["11", 0], vae: ["1", 2], tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 8 },
    },
    // Save
    "13": {
      class_type: "SaveAnimatedWEBP",
      inputs: {
        images: ["12", 0],
        filename_prefix: params.filenamePrefix ?? "ltx_t2v",
        fps: 24,
        lossless: false,
        quality: 85,
        method: "default",
      },
    },
  };
}
