// Stable Video Diffusion workflow — works with svd_xt.safetensors
// Use this when no LTX Video model is available

export const WORKFLOW_VERSION = "1.0.0";
export const REQUIRED_NODES = [
  "ImageOnlyCheckpointLoader",
  "SVD_img2vid_Conditioning",
  "KSampler",
  "VAEDecode",
];

interface SVDParams {
  model: string;
  initImagePath?: string;  // ComfyUI upload filename; falls back to black frame
  promptEn: string;
  width: number;
  height: number;
  videoFrames: number;
  motionBucketId: number; // 1–255, higher = more motion
  fps: number;
  seed: number;
  steps: number;
  cfg: number;
  augmentationLevel: number; // 0.0 = conditioning on image exactly
  filenamePrefix?: string;
}

export function buildSVDWorkflow(params: SVDParams): Record<string, unknown> {
  const seed = params.seed === -1 ? Math.floor(Math.random() * 2 ** 32) : params.seed;
  const hasInitImage = !!params.initImagePath;

  const workflow: Record<string, unknown> = {
    // SVD checkpoint: outputs MODEL, CLIP_VISION, VAE
    "1": {
      class_type: "ImageOnlyCheckpointLoader",
      inputs: { ckpt_name: params.model },
    },
    // VideoLinearCFGGuidance wraps model for video CFG
    "2": {
      class_type: "VideoLinearCFGGuidance",
      inputs: { model: ["1", 0], min_cfg: 1.0 },
    },
  };

  const initImageNodeId = "3";
  if (hasInitImage) {
    workflow["3"] = {
      class_type: "LoadImage",
      inputs: { image: params.initImagePath!, upload: "image" },
    };
  } else {
    // Black/empty init image
    workflow["3"] = {
      class_type: "EmptyImage",
      inputs: { width: params.width, height: params.height, batch_size: 1, color: 0 },
    };
  }

  // SVD conditioning
  workflow["4"] = {
    class_type: "SVD_img2vid_Conditioning",
    inputs: {
      clip_vision: ["1", 1],
      init_image: [initImageNodeId, 0],
      vae: ["1", 2],
      width: params.width,
      height: params.height,
      video_frames: params.videoFrames,
      motion_bucket_id: params.motionBucketId,
      fps: params.fps,
      augmentation_level: params.augmentationLevel,
    },
  };

  // KSampler
  workflow["5"] = {
    class_type: "KSampler",
    inputs: {
      model: ["2", 0],
      positive: ["4", 0],
      negative: ["4", 1],
      latent_image: ["4", 2],
      seed,
      steps: params.steps,
      cfg: params.cfg,
      sampler_name: "euler",
      scheduler: "karras",
      denoise: 1.0,
    },
  };

  // VAE Decode
  workflow["6"] = {
    class_type: "VAEDecodeTiled",
    inputs: {
      samples: ["5", 0],
      vae: ["1", 2],
      tile_size: 512,
      overlap: 64,
      temporal_size: 64,
      temporal_overlap: 8,
    },
  };

  // Save as WEBP animation
  workflow["7"] = {
    class_type: "SaveAnimatedWEBP",
    inputs: {
      images: ["6", 0],
      filename_prefix: params.filenamePrefix ?? "svd_video",
      fps: params.fps,
      lossless: false,
      quality: 85,
      method: "default",
    },
  };

  return workflow;
}
