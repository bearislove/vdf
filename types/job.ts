export type JobType = "FLUX2_REF_IMAGE" | "FLUX2_COMPOSITE" | "LTX_VIDEO" | "WAN_VIDEO" | "EXTRACT_LAST_FRAME";
export type JobStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";

export interface GenerationJob {
  id: string;
  sceneId: string | null;
  objectId: string | null;
  variantId: string | null;
  jobType: JobType;
  comfyPromptId: string | null;
  comfyClientId: string | null;
  comfyServerUrl: string;
  status: JobStatus;
  currentNode: string | null;
  progressStep: number;
  progressTotal: number;
  statusMessage: string;
  errorDetail: string | null;
  inputSnapshot: Record<string, unknown>;
  outputPath: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface SSEProgressEvent {
  type: "progress" | "status" | "done" | "error";
  step?: number;
  total?: number;
  pct?: number;
  node?: string;
  message?: string;
  videoPath?: string;
  thumbnailPath?: string;
  lastFramePath?: string;
  detail?: string;
}
