import type { WanSamplerDefaults } from "../defaults";

export const WORKFLOW_VERSION = "1.0.0";
export const REQUIRED_NODES = [
  "CheckpointLoaderSimple",
  "WanImageToVideo",
  "KSampler",
  "VAEDecodeTiled",
  "CLIPTextEncode",
];

export interface WanVideoParams {
  positivePrompt: string;
  negativePrompt?: string;
  model: string;
  width: number;
  height: number;
  numFrames: number;
  fps: number;
  seed: number;
  steps: number;
  cfg: number;
  initImageFilename?: string;
  lastFrameFilename?: string;
  filenamePrefix?: string;
  samplerDefaults?: WanSamplerDefaults;
}

export function buildWanVideoWorkflow(params: WanVideoParams): Record<string, unknown> {
  const seed = params.seed === -1 ? Math.floor(Math.random() * 2 ** 32) : params.seed;
  const sampler = params.samplerDefaults ?? { name: "euler_ancestral", scheduler: "karras" };

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
      inputs: { text: params.negativePrompt ?? "bad quality, deformed, ugly", clip: ["1", 1] },
    },
    "4": {
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
    },
  };

  // Image conditioning: prefer initImage as start, lastFrame as end.
  // If only lastFrame (no character ref) → use it as start for seamless continuation.
  const hasInit = !!params.initImageFilename;
  const hasLast = !!params.lastFrameFilename;

  if (hasInit || hasLast) {
    const startImage = params.initImageFilename ?? params.lastFrameFilename!;
    workflow["5"] = {
      class_type: "LoadImage",
      inputs: { image: startImage, upload: "image" },
    };

    const firstLastInputs: Record<string, unknown> = {
      positive: ["4", 0],
      negative: ["4", 1],
      vae: ["1", 2],
      latent: ["4", 2],
      start_image: ["5", 0],
    };

    // end_image: previous scene's last frame (only when we also have an init image)
    if (hasInit && hasLast) {
      workflow["7"] = {
        class_type: "LoadImage",
        inputs: { image: params.lastFrameFilename!, upload: "image" },
      };
      firstLastInputs.end_image = ["7", 0];
    }

    workflow["6"] = {
      class_type: "WanFirstLastFrameToVideo",
      inputs: firstLastInputs,
    };
  }

  const condNode = (hasInit || hasLast) ? "6" : "4";

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
      sampler_name: sampler.name,
      scheduler: sampler.scheduler,
      denoise: 1.0,
    },
  };
  workflow["9"] = {
    class_type: "VAEDecodeTiled",
    inputs: {
      samples: ["8", 0],
      vae: ["1", 2],
      tile_size: 512,
      overlap: 64,
      temporal_size: 64,
      temporal_overlap: 8,
    },
  };
  workflow["10"] = {
    class_type: "SaveAnimatedWEBP",
    inputs: {
      images: ["9", 0],
      filename_prefix: params.filenamePrefix ?? "wan_video",
      fps: params.fps,
      lossless: false,
      quality: 85,
      method: "default",
    },
  };

  return workflow;
}
