// FLUX2 — Composite 2+ character reference images into one scene image
// Used for i2v_composite strategy: generate composite → LTX I2V

export const WORKFLOW_VERSION = "1.0.0";
export const REQUIRED_NODES = [
  "UNETLoader",
  "DualCLIPLoader",
  "VAELoader",
  "FluxGuidance",
  "IPAdapterModelLoader",
  "IPAdapterAdvanced",
  "SamplerCustomAdvanced",
];

export interface Flux2CompositeParams {
  positivePrompt: string;
  unetModel: string;
  clipL: string;
  clipT5: string;
  vaeModel: string;
  width: number;
  height: number;
  steps: number;
  fluxGuidance: number;
  seed: number;
  // Reference images to composite (uploaded to ComfyUI)
  refImages: Array<{
    filename: string;   // uploaded filename in ComfyUI input/
    weight: number;     // 0.0–1.0
  }>;
  precision?: "bf16" | "fp8" | "fp16";
}

export function buildFlux2CompositeWorkflow(
  params: Flux2CompositeParams
): Record<string, unknown> {
  const seed = params.seed === -1 ? Math.floor(Math.random() * 2 ** 32) : params.seed;
  const precision = params.precision ?? "bf16";

  // Base nodes
  const workflow: Record<string, unknown> = {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: params.unetModel, weight_dtype: precision },
    },
    "2": {
      class_type: "DualCLIPLoader",
      inputs: { clip_name1: params.clipL, clip_name2: params.clipT5, type: "flux" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: params.vaeModel },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: params.positivePrompt, clip: ["2", 0] },
    },
    "5": {
      class_type: "FluxGuidance",
      inputs: { conditioning: ["4", 0], guidance: params.fluxGuidance },
    },
    "6": {
      class_type: "EmptyLatentImage",
      inputs: { width: params.width, height: params.height, batch_size: 1 },
    },
  };

  // Load each reference image and apply IPAdapter
  let modelRef: [string, number] = ["1", 0];
  let nextId = 7;

  for (const img of params.refImages) {
    const loadId = String(nextId++);
    const ipId = String(nextId++);
    workflow[loadId] = {
      class_type: "LoadImage",
      inputs: { image: img.filename, upload: "image" },
    };
    workflow[ipId] = {
      class_type: "IPAdapterAdvanced",
      inputs: {
        model: modelRef,
        ipadapter: { class_type: "IPAdapterModelLoader", inputs: { ipadapter_file: "ip-adapter_flux_plus.safetensors" } },
        image: [loadId, 0],
        clip_vision: { class_type: "CLIPVisionLoader", inputs: { clip_name: "clip_vision_h.safetensors" } },
        weight: img.weight,
        start_at: 0.0,
        end_at: 1.0,
        weight_type: "style transfer",
      },
    };
    modelRef = [ipId, 0];
  }

  const samplerBase = nextId;
  workflow[String(samplerBase)] = {
    class_type: "RandomNoise",
    inputs: { noise_seed: seed },
  };
  workflow[String(samplerBase + 1)] = {
    class_type: "CFGGuider",
    inputs: {
      model: modelRef,
      positive: ["5", 0],
      negative: { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 0] } },
      cfg: 1.0,
    },
  };
  workflow[String(samplerBase + 2)] = {
    class_type: "KSamplerSelect",
    inputs: { sampler_name: "euler" },
  };
  workflow[String(samplerBase + 3)] = {
    class_type: "BasicScheduler",
    inputs: { model: modelRef, scheduler: "beta", steps: params.steps, denoise: 1.0 },
  };
  workflow[String(samplerBase + 4)] = {
    class_type: "SamplerCustomAdvanced",
    inputs: {
      noise: [String(samplerBase), 0],
      guider: [String(samplerBase + 1), 0],
      sampler: [String(samplerBase + 2), 0],
      sigmas: [String(samplerBase + 3), 0],
      latent_image: ["6", 0],
    },
  };
  workflow[String(samplerBase + 5)] = {
    class_type: "VAEDecode",
    inputs: { samples: [String(samplerBase + 4), 0], vae: ["3", 0] },
  };
  workflow[String(samplerBase + 6)] = {
    class_type: "SaveImage",
    inputs: { images: [String(samplerBase + 5), 0], filename_prefix: "flux2_composite" },
  };

  return workflow;
}
