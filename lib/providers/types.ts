import type { Scene } from "@/types/scene";
import type { StoryObject } from "@/types/object";

/** Client/server shared provider identifiers. */
export type GenerationProviderName = "comfyui" | "agnes";
export type TextProviderName = "openai" | "ollama" | "agnes";

export interface TextProviderCapabilities {
  chatCompletion: boolean;
}

export interface ImageProviderCapabilities {
  referenceImages: boolean;
  maxReferenceImages: number;
}

export interface VideoProviderCapabilities {
  referenceImages: boolean;
  maxReferenceImages: number;
  recovery: boolean;
}

// ─── LLM ───────────────────────────────────────────────────────────────────────

export interface LLMProvider {
  readonly name: TextProviderName;
  chatComplete(system: string, user: string, opts?: { temperature?: number }): Promise<string>;
}

// ─── Image generation ──────────────────────────────────────────────────────────

export interface ImageGenInput {
  prompt: string;
  width: number;
  height: number;
  seed?: number;
  /** Absolute local paths of reference images guiding the generation (providers may ignore) */
  referenceImagePaths?: string[];
  /** Provider-specific model override (e.g. a ComfyUI checkpoint filename) */
  model?: string;
}

export interface ImageGenHooks {
  onStatus(message: string): void;
  onProgress(step: number, total: number): void;
  onDone(buffer: Buffer): Promise<void>;
  onError(message: string): void;
}

export interface ImageProvider {
  readonly name: GenerationProviderName;
  generateImage(input: ImageGenInput, hooks: ImageGenHooks): Promise<void>;
}

// ─── Video generation ──────────────────────────────────────────────────────────

export type SceneWithLinks = Scene & {
  objectLinks?: Array<{ role: string; strengthHint?: number; object: StoryObject }>;
};

export interface VideoGenContext {
  scene: SceneWithLinks;
  videoParams: Record<string, unknown>;
  variantId: string;
  filmId: string;
  episodeId: string;
  /** Required scene image that drives image-to-video generation. */
  inputImagePath?: string;
  /** Optional provider-level first frame input when a caller explicitly supplies one. */
  firstFrameImagePath?: string;
  firstFrameSource: "none" | "previous_scene";
  /** Visual content references from Initial reference image; never first/last keyframes. */
  contentReferenceImagePaths: string[];
}

export interface VideoSubmittedMeta {
  strategy?: string;
  externalJobId?: string;
  providerCredentialId?: string;
  comfyPromptId?: string;
  comfyClientId?: string;
  workflowSnapshot?: Record<string, unknown>;
  /** Storage-relative paths for all references actually sent to the provider. */
  referenceImagePaths?: string[];
}

export interface VideoProgress {
  step?: number;
  total?: number;
  currentNode?: string;
  statusMessage?: string;
}

export interface VideoGenHooks {
  onSubmitted(meta: VideoSubmittedMeta): Promise<void>;
  onProgress(progress: VideoProgress): Promise<void>;
  onComplete(buffer: Buffer, ext: string): Promise<void>;
  onError(message: string): Promise<void>;
}

export interface VideoRecoveryResult {
  status:
    | "recovered"
    | "still_running"
    | "no_prompt_id"
    | "provider_error"
    | "provider_unreachable"
    | "not_found"
    | "download_failed"
    | "no_output";
  message?: string;
  videoPath?: string;
  httpStatus?: number;
}

/** DB shape the recovery path needs (matches the Prisma VideoVariant row) */
export interface RecoverableVariant {
  id: string;
  sceneId: string;
  comfyPromptId: string | null;
  externalJobId: string | null;
  providerCredentialId: string | null;
}

export interface VideoProvider {
  readonly name: GenerationProviderName;
  /** Synchronous capability check before a variant is created. Returns an error message, or null if OK. */
  validate(ctx: Omit<VideoGenContext, "variantId">): string | null;
  /** Runs the full generation to completion, reporting via hooks. Callers fire-and-forget this. */
  runVideoGeneration(ctx: VideoGenContext, hooks: VideoGenHooks): Promise<void>;
  /** Re-checks a previously submitted job and finalizes it via hooks if it completed. */
  recoverVideo(variant: RecoverableVariant, hooks: VideoGenHooks): Promise<VideoRecoveryResult>;
}
