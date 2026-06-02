// FLUX2 — Generate a single reference image for a character/object
// Uses FluxGuidance instead of CFG, requires a FLUX2 model (unet + dual CLIP + VAE)

export const WORKFLOW_VERSION = "1.0.0";
export const REQUIRED_NODES = [
  "UNETLoader",
  "DualCLIPLoader",
  "VAELoader",
  "FluxGuidance",
  "RandomNoise",
  "SamplerCustomAdvanced",
  "KSamplerSelect",
  "BasicScheduler",
];

export interface Flux2RefImageParams {
  positivePrompt: string;
  negativePrompt?: string;
  unetModel: string;        // e.g. "flux1-dev.safetensors"
  clipL: string;            // CLIP-L model
  clipT5: string;           // T5XXL model
  vaeModel: string;         // VAE model
  width: number;
  height: number;
  steps: number;
  fluxGuidance: number;     // FluxGuidance value (replaces CFG), default 3.5
  seed: number;
  precision?: "bf16" | "fp8" | "fp16";
  loraName?: string;
  loraStrength?: number;
}

export function buildFlux2RefImageWorkflow(params: Flux2RefImageParams): Record<string, unknown> {
  const seed = params.seed === -1 ? Math.floor(Math.random() * 2 ** 32) : params.seed;
  const precision = params.precision ?? "bf16";

  const workflow: Record<string, unknown> = {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: params.unetModel, weight_dtype: precision },
    },
    "2": {
      class_type: "DualCLIPLoader",
      inputs: {
        clip_name1: params.clipL,
        clip_name2: params.clipT5,
        type: "flux",
      },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: params.vaeModel },
    },
  };

  // Optional LoRA
  let modelRef = ["1", 0];
  let clipRef = ["2", 0];
  if (params.loraName) {
    workflow["4"] = {
      class_type: "LoraLoader",
      inputs: {
        model: ["1", 0],
        clip: ["2", 0],
        lora_name: params.loraName,
        strength_model: params.loraStrength ?? 1.0,
        strength_clip: params.loraStrength ?? 1.0,
      },
    };
    modelRef = ["4", 0];
    clipRef = ["4", 1];
  }

  const base = params.loraName ? 5 : 4;

  workflow[String(base)] = {
    class_type: "CLIPTextEncode",
    inputs: { text: params.positivePrompt, clip: clipRef },
  };
  workflow[String(base + 1)] = {
    class_type: "CLIPTextEncode",
    inputs: {
      text: params.negativePrompt ?? "",
      clip: clipRef,
    },
  };
  // FluxGuidance wraps positive conditioning
  workflow[String(base + 2)] = {
    class_type: "FluxGuidance",
    inputs: {
      conditioning: [String(base), 0],
      guidance: params.fluxGuidance,
    },
  };
  workflow[String(base + 3)] = {
    class_type: "EmptyLatentImage",
    inputs: { width: params.width, height: params.height, batch_size: 1 },
  };
  // RandomNoise
  workflow[String(base + 4)] = {
    class_type: "RandomNoise",
    inputs: { noise_seed: seed },
  };
  // CFGGuider with FluxGuidance conditioning
  workflow[String(base + 5)] = {
    class_type: "CFGGuider",
    inputs: {
      model: modelRef,
      positive: [String(base + 2), 0],
      negative: [String(base + 1), 0],
      cfg: 1.0, // FLUX2 uses FluxGuidance instead of CFG
    },
  };
  workflow[String(base + 6)] = {
    class_type: "KSamplerSelect",
    inputs: { sampler_name: "euler" },
  };
  workflow[String(base + 7)] = {
    class_type: "BasicScheduler",
    inputs: {
      model: modelRef,
      scheduler: "beta",
      steps: params.steps,
      denoise: 1.0,
    },
  };
  workflow[String(base + 8)] = {
    class_type: "SamplerCustomAdvanced",
    inputs: {
      noise: [String(base + 4), 0],
      guider: [String(base + 5), 0],
      sampler: [String(base + 6), 0],
      sigmas: [String(base + 7), 0],
      latent_image: [String(base + 3), 0],
    },
  };
  workflow[String(base + 9)] = {
    class_type: "VAEDecode",
    inputs: { samples: [String(base + 8), 0], vae: ["3", 0] },
  };
  workflow[String(base + 10)] = {
    class_type: "SaveImage",
    inputs: {
      images: [String(base + 9), 0],
      filename_prefix: "flux2_ref",
    },
  };

  return workflow;
}
