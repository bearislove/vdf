import fs from "fs";
import path from "path";
import { newClientId, submitPrompt, listenToPrompt, downloadOutput, getHistory } from "@/lib/comfyui/client";
import { buildWorkflow } from "@/lib/comfyui/workflow-builder";
import { toErrorMessage } from "@/lib/utils/errors";
import type {
  RecoverableVariant,
  VideoGenContext,
  VideoGenHooks,
  VideoProvider,
  VideoRecoveryResult,
} from "@/lib/providers/types";

const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://localhost:8188";
const FAST_POLL_INTERVAL_MS = 5000;
const RECOVERY_POLL_INTERVAL_MS = 10_000;
const RECOVERY_MAX_MS = 2 * 60 * 60 * 1000; // Maximum two hours.
const WS_TIMEOUT_MS = parseInt(process.env.COMFYUI_TIMEOUT ?? "300") * 1000;

type OutputImage = { filename: string; subfolder: string; type: string };

function findOutputImages(outputs: Record<string, unknown> | undefined): OutputImage[] {
  for (const nodeOut of Object.values(outputs ?? {}) as Array<{ images?: OutputImage[] }>) {
    if (nodeOut?.images?.length) return nodeOut.images;
  }
  return [];
}

function extractErrorDetail(history: { status?: { messages?: string[][] } }): string {
  const messages = history.status?.messages ?? [];
  const err = messages.find((m) => m[0] === "execution_error");
  return err ? JSON.stringify(err[1]).slice(0, 300) : "ComfyUI execution error";
}

async function uploadImagesToComfyUI(imagePaths: string[]): Promise<void> {
  for (const imgPath of imagePaths) {
    if (!fs.existsSync(imgPath)) continue;
    const formData = new FormData();
    const buffer = fs.readFileSync(imgPath);
    formData.append("image", new Blob([buffer]), path.basename(imgPath));
    await fetch(`${COMFYUI_URL}/upload/image`, { method: "POST", body: formData }).catch(() => {});
  }
}

export class ComfyUIVideoProvider implements VideoProvider {
  readonly name = "comfyui" as const;

  validate(): string | null {
    // workflow-builder selects T2V when no first frame is available.
    return null;
  }

  async runVideoGeneration(ctx: VideoGenContext, hooks: VideoGenHooks): Promise<void> {
    try {
      const { workflow, strategy, uploadedImages } = await buildWorkflow({
        scene: ctx.scene,
        variantId: ctx.variantId,
        firstFrameImagePath: ctx.firstFrameImagePath ?? ctx.inputImagePath,
        videoParams: ctx.videoParams,
      });

      await uploadImagesToComfyUI(uploadedImages);

      const clientId = newClientId();
      const promptId = await submitPrompt(workflow, clientId);

      await hooks.onSubmitted({
        strategy,
        comfyPromptId: promptId,
        comfyClientId: clientId,
        workflowSnapshot: workflow,
      });

      await this.waitAndDeliver(promptId, clientId, hooks);
    } catch (e) {
      await hooks.onError(toErrorMessage(e));
    }
  }

  async recoverVideo(variant: RecoverableVariant, hooks: VideoGenHooks): Promise<VideoRecoveryResult> {
    if (!variant.comfyPromptId) {
      return { status: "no_prompt_id", message: "Variant was never submitted to ComfyUI" };
    }

    let history: Awaited<ReturnType<typeof getHistory>>;
    try {
      history = await getHistory(variant.comfyPromptId);
    } catch (e) {
      return { status: "provider_unreachable", message: toErrorMessage(e), httpStatus: 502 };
    }

    if (!history) {
      return { status: "not_found", message: "Job not found in ComfyUI history (may have been cleared)" };
    }
    if (history.status?.status_str === "error") {
      const message = extractErrorDetail(history);
      await hooks.onError(message);
      return { status: "provider_error", message };
    }
    if (!history.status?.completed) {
      return { status: "still_running", message: "Job is still running in ComfyUI" };
    }

    const image = findOutputImages(history.outputs)[0];
    if (!image) {
      return { status: "no_output", message: "ComfyUI completed but produced no output images" };
    }

    let buffer: Buffer;
    try {
      buffer = await downloadOutput(image.filename, image.subfolder, image.type);
    } catch (e) {
      return { status: "download_failed", message: toErrorMessage(e), httpStatus: 500 };
    }

    await hooks.onComplete(buffer, path.extname(image.filename) || ".webp");
    return { status: "recovered" };
  }

  /** Waits for the prompt via WS + polling fallbacks, then downloads output and reports via hooks. */
  private async waitAndDeliver(promptId: string, clientId: string, hooks: VideoGenHooks): Promise<void> {
    let processed = false;
    let progressDone = false;

    const handleDone = async (eventOutputs?: Record<string, unknown>) => {
      try {
        const image =
          findOutputImages(eventOutputs)[0] ?? findOutputImages((await getHistory(promptId))?.outputs)[0];
        if (!image) {
          await hooks.onError("No output images from ComfyUI");
          return;
        }
        const buffer = await downloadOutput(image.filename, image.subfolder, image.type);
        await hooks.onComplete(buffer, path.extname(image.filename) || ".webp");
      } catch (e) {
        await hooks.onError(toErrorMessage(e));
      }
    };

    // Recovery polling keeps the job alive when the WebSocket disconnects or times out.
    const startRecoveryPolling = async (reason: string) => {
      const start = Date.now();
      while (Date.now() - start < RECOVERY_MAX_MS) {
        await new Promise((r) => setTimeout(r, RECOVERY_POLL_INTERVAL_MS));
        try {
          const history = await getHistory(promptId);
          if (!history) continue; // The job is still queued or running.
          if (history.status?.status_str === "error") {
            await hooks.onError(extractErrorDetail(history));
            return;
          }
          if (history.status?.completed) {
            await handleDone(undefined);
            return;
          }
        } catch { /* network error, retry */ }
      }
      await hooks.onError(`${reason} — timed out after 2h`);
    };

    await new Promise<void>((resolve) => {
      let settled = false;
      let cleanupSocket = () => {};

      const settle = (fn: () => void | Promise<void>) => {
        if (settled) return;
        settled = true;
        clearInterval(pollInterval);
        clearTimeout(timeoutId);
        cleanupSocket();
        void Promise.resolve(fn())
          .catch((error) => hooks.onError(String(error)))
          .finally(resolve);
      };

      cleanupSocket = listenToPrompt(promptId, clientId, async (event) => {
        if (event.type === "progress") {
          if (event.step === event.total && (event.total ?? 0) > 0) progressDone = true;
          await hooks.onProgress({ step: event.step ?? 0, total: event.total ?? 0 });
        } else if (event.type === "node") {
          await hooks.onProgress({ currentNode: event.node ?? "" });
        } else if (event.type === "done") {
          if (processed) return;
          processed = true;
          settle(async () => { await handleDone(event.outputs); });
        } else if (event.type === "error") {
          // Switch to polling instead of failing immediately after a WebSocket disconnect.
          settle(async () => { await startRecoveryPolling("WebSocket disconnected"); });
        }
      });

      // Fast polling fallback for completed progress without a WebSocket done event.
      const pollInterval = setInterval(async () => {
        if (!progressDone || settled) return;
        try {
          const history = await getHistory(promptId);
          if (history?.status?.completed) {
            if (!processed) {
              processed = true;
              settle(async () => { await handleDone(undefined); });
            }
          }
        } catch { /* retry */ }
      }, FAST_POLL_INTERVAL_MS);

      // A WebSocket timeout switches to recovery polling rather than failing the job.
      const timeoutId = setTimeout(() => {
        settle(async () => { await startRecoveryPolling("WebSocket timeout"); });
      }, WS_TIMEOUT_MS);
    });
  }
}
