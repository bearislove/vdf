export type VideoStatus = "QUEUED" | "GENERATING_IMAGE" | "GENERATING_VIDEO" | "DONE" | "FAILED";

export interface VideoVariant {
  id: string;
  sceneId: string;
  paramsSnapshot: Record<string, unknown>;
  workflowSnapshot: Record<string, unknown>;
  comfyPromptId: string | null;
  comfyClientId: string | null;
  status: VideoStatus;
  statusMessage: string;
  errorDetail: string | null;
  currentNode: string | null;
  progressStep: number;
  progressTotal: number;
  compositeImagePath: string | null;
  videoPath: string | null;
  lastFramePath: string | null;
  thumbnailPath: string | null;
  durationSeconds: number | null;
  modelUsed: string;
  strategy: string;
  canvasX: number;
  canvasY: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface VideoParams {
  // Simple mode
  promptEn: string;
  negativePrompt: string;
  numFrames: number;
  seed: number;
  firstFrameStrength: number;
  lastFrameStrength: number;
  qualityPreset: "fast" | "balanced" | "high";
  aspectRatio: "1:1" | "2:3" | "3:2" | "16:9" | "9:16";
  // Pro mode
  steps?: number;
  cfg?: number;
  crossModalSync?: number;
  width?: number;
  height?: number;
  fps?: number;
  icLoraStrength?: number;
  audioRef?: string;
}
