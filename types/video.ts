export type VideoStatus = "QUEUED" | "GENERATING_IMAGE" | "GENERATING_VIDEO" | "DONE" | "FAILED";
export type GenerationProvider = "COMFYUI" | "AGNES";

export interface VideoVariant {
  id: string;
  sceneId: string;
  paramsSnapshot: Record<string, unknown>;
  workflowSnapshot: Record<string, unknown>;
  comfyPromptId: string | null;
  comfyClientId: string | null;
  provider: GenerationProvider;
  externalJobId: string | null;
  status: VideoStatus;
  statusMessage: string;
  errorDetail: string | null;
  currentNode: string | null;
  progressStep: number;
  progressTotal: number;
  compositeImagePath: string | null;
  /** Toàn bộ ảnh tham chiếu thực tế đã gửi cho provider (storage-relative), theo thứ tự gửi */
  referenceImagePaths: string[];
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
