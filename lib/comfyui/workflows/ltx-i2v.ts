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
  seed: number;
  steps: number;
  cfg: number;
  videoModel: string;
  firstFrameImage: string;
  lastFrameImage?: string;
  firstFrameStrength: number;
  lastFrameStrength: number;
  filenamePrefix?: string;
}

export function buildLTXI2VWorkflow(params: LTXI2VParams): Record<string, unknown> {
  const seed = params.seed === -1 ? Math.floor(Math.random() * 2 ** 32) : params.seed;

  // LTXVConditioning: (positive, negative, frame_rate) → (pos_cond, neg_cond)
  // LTXVAddGuide: (positive, negative, vae, latent, image, frame_idx, strength) → (pos_cond, neg_cond, LATENT)

  const workflow: Record<string, unknown> = {
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
        text: params.negativePrompt || "blurry, deformed",
        clip: ["1", 1],
      },
    },
    "4": {
      class_type: "LTXVConditioning",
      inputs: {
        positive: ["2", 0],
        negative: ["3", 0],
        frame_rate: 24,
      },
    },
    "5": {
      class_type: "EmptyLTXVLatentVideo",
      inputs: {
        width: params.width,
        height: params.height,
        length: params.numFrames,
        batch_size: 1,
      },
    },
    "6": {
      class_type: "ModelSamplingLTXV",
      inputs: { model: ["1", 0], max_shift: 2.05, base_shift: 0.95 },
    },
  };

  // Current conditioning source (pos@0, neg@1, latent@2 for LTXVAddGuide outputs)
  // For base LTXVConditioning: pos@0, neg@1 — latent stays from EmptyLTXVLatentVideo
  let condNodeId = "4";
  let latentNodeId = "5";
  let latentSlot = 0;
  let nextId = 7;

  // First frame guide: LTXVAddGuide outputs pos, neg, latent
  if (params.firstFrameImage) {
    workflow[String(nextId)] = {
      class_type: "LoadImage",
      inputs: { image: params.firstFrameImage, upload: "image" },
    };
    const loadId = String(nextId++);
    workflow[String(nextId)] = {
      class_type: "LTXVAddGuide",
      inputs: {
        positive: [condNodeId, 0],
        negative: [condNodeId, 1],
        vae: ["1", 2],
        latent: [latentNodeId, latentSlot],
        image: [loadId, 0],
        frame_idx: 0,
        strength: params.firstFrameStrength,
      },
    };
    condNodeId = String(nextId);
    latentNodeId = String(nextId);
    latentSlot = 2;
    nextId++;
  }

  // Last frame guide (chaining from previous scene)
  if (params.lastFrameImage) {
    workflow[String(nextId)] = {
      class_type: "LoadImage",
      inputs: { image: params.lastFrameImage, upload: "image" },
    };
    const loadLastId = String(nextId++);
    // Use numFrames - 1 as last frame index
    workflow[String(nextId)] = {
      class_type: "LTXVAddGuide",
      inputs: {
        positive: [condNodeId, 0],
        negative: [condNodeId, 1],
        vae: ["1", 2],
        latent: [latentNodeId, latentSlot],
        image: [loadLastId, 0],
        frame_idx: params.numFrames - 1,
        strength: params.lastFrameStrength,
      },
    };
    condNodeId = String(nextId);
    latentNodeId = String(nextId);
    latentSlot = 2;
    nextId++;
  }

  const guiderId = String(nextId++);
  const noiseId = String(nextId++);
  const samplerId = String(nextId++);
  const schedulerId = String(nextId++);
  const samplerAdvId = String(nextId++);
  const vaeDecodeId = String(nextId++);
  const saveId = String(nextId++);

  workflow[guiderId] = {
    class_type: "CFGGuider",
    inputs: {
      model: ["6", 0],
      positive: [condNodeId, 0],
      negative: [condNodeId, 1],
      cfg: params.cfg,
    },
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
      max_shift: 2.05,
      base_shift: 0.95,
      stretch: true,
      terminal: 0.1,
      latent: [latentNodeId, latentSlot],
    },
  };
  workflow[samplerAdvId] = {
    class_type: "SamplerCustomAdvanced",
    inputs: {
      noise: [noiseId, 0],
      guider: [guiderId, 0],
      sampler: [samplerId, 0],
      sigmas: [schedulerId, 0],
      latent_image: [latentNodeId, latentSlot],
    },
  };
  workflow[vaeDecodeId] = {
    class_type: "VAEDecodeTiled",
    inputs: { samples: [samplerAdvId, 0], vae: ["1", 2], tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 8 },
  };
  workflow[saveId] = {
    class_type: "SaveAnimatedWEBP",
    inputs: {
      images: [vaeDecodeId, 0],
      filename_prefix: params.filenamePrefix ?? "ltx_i2v",
      fps: 24,
      lossless: false,
      quality: 85,
      method: "default",
    },
  };

  return workflow;
}
