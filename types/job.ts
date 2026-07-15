import type { GenerationProvider } from "./video";

export type JobType = "FLUX2_REF_IMAGE" | "FLUX2_COMPOSITE" | "LTX_VIDEO" | "WAN_VIDEO" | "EXTRACT_LAST_FRAME" | "AGNES_IMAGE" | "AGNES_VIDEO";
export type JobStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";

export interface GenerationJob {
  id: string;
  sceneId: string | null;
  objectId: string | null;
  variantId: string | null;
  jobType: JobType;
  provider: GenerationProvider;
  comfyPromptId: string | null;
  comfyClientId: string | null;
  comfyServerUrl: string | null;
  externalJobId: string | null;
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
