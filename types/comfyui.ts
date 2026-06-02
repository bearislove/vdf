export interface ComfyUIStatus {
  connected: boolean;
  queueSize?: number;
  version?: string;
}

export interface ComfyUIModels {
  checkpoints: string[];
  loras: string[];
  vae: string[];
  controlnet: string[];
  diffusion_models: string[];
}

export interface ComfyUIPromptResponse {
  prompt_id: string;
  number: number;
  node_errors: Record<string, unknown>;
}

export interface ComfyUIWSEvent {
  type: "status" | "execution_start" | "executing" | "progress" | "executed";
  data: {
    prompt_id?: string;
    node?: string | null;
    value?: number;
    max?: number;
    output?: Record<string, unknown>;
  };
}

export interface ComfyUIHistoryItem {
  prompt: unknown[];
  outputs: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>;
  status: { status_str: string; completed: boolean };
}
