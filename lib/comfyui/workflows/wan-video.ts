// Wan2.2 Image-to-Video workflow
// Better than LTX for: 3+ characters, close-up emotion shots
// Uses WanImageToVideo node (available in ComfyUI-WanVideoWrapper)

export const WORKFLOW_VERSION = "1.0.0";
export const REQUIRED_NODES = [
  "CheckpointLoaderSimple",
  "WanImageToVideo",
  "KSampler",
  "VAEDecode",
  "CLIPTextEncode",
];

export interface WanVideoParams {
  positivePrompt: string;
  negativePrompt?: string;
  model: string;         // e.g. "wan2.2-i2v.safetensors"
  width: number;
  height: number;
  numFrames: number;     // 1–81, typically 25 (~1s@25fps)
  seed: number;
  steps: number;
  cfg: number;
  initImageFilename?: string;   // ComfyUI uploaded image filename
  lastFrameFilename?: string;   // Optional last frame for chaining
  filenamePrefix?: string;
}

export function buildWanVideoWorkflow(params: WanVideoParams): Record<string, unknown> {
  const seed = params.seed === -1 ? Math.floor(Math.random() * 2 ** 32) : params.seed;

  const workflow: Record<string, unknown> = {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: params.model },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: params.positivePrompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: params.negativePrompt ?? "bad quality, deformed, ugly",
        clip: ["1", 1],
      },
    },
  };

  // WanImageToVideo conditioning
  // WanImageToVideo: (positive, negative, vae, width, height, length, batch_size)
  // → (positive, negative, latent)
  workflow["4"] = {
    class_type: "WanImageToVideo",
    inputs: {
      positive: ["2", 0],
      negative: ["3", 0],
      vae: ["1", 2],
      width: params.width,
      height: params.height,
      length: params.numFrames,
      batch_size: 1,
    },
  };

  // If we have an init image, load it and apply as image guide
  if (params.initImageFilename) {
    workflow["5"] = {
      class_type: "LoadImage",
      inputs: { image: params.initImageFilename, upload: "image" },
    };
    // WanFirstLastFrameToVideo for image conditioning
    workflow["6"] = {
      class_type: "WanFirstLastFrameToVideo",
      inputs: {
        positive: ["4", 0],
        negative: ["4", 1],
        vae: ["1", 2],
        latent: ["4", 2],
        start_image: ["5", 0],
        ...(params.lastFrameFilename
          ? {}
          : {}),
      },
    };
    // Add last frame if chaining
    if (params.lastFrameFilename) {
      workflow["7"] = {
        class_type: "LoadImage",
        inputs: { image: params.lastFrameFilename, upload: "image" },
      };
      // Override with both frames
      workflow["6"] = {
        class_type: "WanFirstLastFrameToVideo",
        inputs: {
          positive: ["4", 0],
          negative: ["4", 1],
          vae: ["1", 2],
          latent: ["4", 2],
          start_image: ["5", 0],
          end_image: ["7", 0],
        },
      };
    }
  }

  const condNode = params.initImageFilename ? "6" : "4";

  workflow["8"] = {
    class_type: "KSampler",
    inputs: {
      model: ["1", 0],
      positive: [condNode, 0],
      negative: [condNode, 1],
      latent_image: [condNode, 2],
      seed,
      steps: params.steps,
      cfg: params.cfg,
      sampler_name: "euler_ancestral",
      scheduler: "karras",
      denoise: 1.0,
    },
  };
  workflow["9"] = {
    class_type: "VAEDecodeTiled",
    inputs: { samples: ["8", 0], vae: ["1", 2], tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 8 },
  };
  workflow["10"] = {
    class_type: "SaveAnimatedWEBP",
    inputs: {
      images: ["9", 0],
      filename_prefix: params.filenamePrefix ?? "wan_video",
      fps: 16,
      lossless: false,
      quality: 85,
      method: "default",
    },
  };

  return workflow;
}
