// Quick test workflow using standard SD1.5 KSampler + SaveImage
// Used to validate the full pipeline (submit → WS → download → save) without needing video models

export function buildTestImgWorkflow(params: {
  prompt: string;
  model: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
}): Record<string, unknown> {
  const seed = (params.seed ?? -1) === -1 ? Math.floor(Math.random() * 2 ** 32) : params.seed!;
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: params.model },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: params.prompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: "blurry, deformed", clip: ["1", 1] },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: params.width ?? 512, height: params.height ?? 512, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
        seed,
        steps: params.steps ?? 10,
        cfg: params.cfg ?? 7.0,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1.0,
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
    },
    "7": {
      class_type: "SaveImage",
      inputs: { images: ["6", 0], filename_prefix: "test_img" },
    },
  };
}
