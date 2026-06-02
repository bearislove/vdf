export const LTX_VIDEO_DEFAULTS = {
  width: 1280,
  height: 720,
  fps: 24,
  numFrames: 97,
  maxNumFrames: 257,
  steps: 25,
  cfg: 3.0,
  firstFrameStrength: 0.95,
  lastFrameStrength: 0.70,
  seed: -1,
  // LTXVScheduler / ModelSamplingLTXV
  maxShift: 2.05,
  baseShift: 0.95,
  // VAEDecodeTiled
  tileSize: 512,
  tileOverlap: 64,
  temporalSize: 64,
  temporalOverlap: 8,
};

export const WAN_DEFAULTS = {
  width: 1280,
  height: 720,
  fps: 16,
  maxNumFrames: 81,
  steps: 20,
  cfg: 6.0,
  seed: -1,
  tileSize: 512,
  tileOverlap: 64,
  temporalSize: 64,
  temporalOverlap: 8,
};

export const SVD_DEFAULTS = {
  width: 1024,
  height: 576,
  fps: 6,
  maxNumFrames: 25,
  steps: 25,
  cfg: 2.5,
  motionBucketId: 127,
  augmentationLevel: 0.0,
  seed: -1,
};

export const FLUX2_DEFAULTS = {
  width: 1024,
  height: 1024,
  steps: 25,
  fluxGuidance: 3.5,
  seed: -1,
  batchSize: 1,
  denoise: 1.0,
  sampler: "euler",
  scheduler: "normal",
};

export const QUALITY_STEPS: Record<string, { steps: number; guidance: number }> = {
  fast:     { steps: 15, guidance: 3.0 },
  balanced: { steps: 25, guidance: 3.5 },
  high:     { steps: 40, guidance: 3.5 },
};

export const ASPECT_RATIOS: Record<string, { width: number; height: number }> = {
  "1:1":  { width: 1024, height: 1024 },
  "2:3":  { width: 768,  height: 1152 },
  "3:2":  { width: 1152, height: 768  },
  "16:9": { width: 1280, height: 720  },
  "9:16": { width: 720,  height: 1280 },
};

export interface WanSamplerDefaults {
  name: string;
  scheduler: string;
}

export const WAN_SAMPLER_DEFAULTS: WanSamplerDefaults = {
  name: "euler_ancestral",
  scheduler: "karras",
};
