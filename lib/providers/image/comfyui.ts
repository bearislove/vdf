import { newClientId, submitPrompt, listenToPrompt, downloadOutput, getHistory } from "@/lib/comfyui/client";
import { buildTestImgWorkflow } from "@/lib/comfyui/workflows/test-img";
import type { ImageGenHooks, ImageGenInput, ImageProvider } from "@/lib/providers/types";

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 300000;

type OutputImage = { filename: string; subfolder: string; type: string };

function resolveModel(input: ImageGenInput): string {
  return input.model || process.env.DEFAULT_IMAGE_MODEL || "realisticVisionV51.safetensors";
}

function extractErrorDetail(history: { status?: { messages?: string[][] } }): string {
  const messages = history.status?.messages ?? [];
  const err = messages.find((m) => m[0] === "execution_error");
  return err ? JSON.stringify(err[1]).slice(0, 200) : "ComfyUI error";
}

function findOutputImage(outputs: Record<string, unknown> | undefined): OutputImage | null {
  for (const nodeOut of Object.values(outputs ?? {}) as Array<{ images?: OutputImage[] }>) {
    if (nodeOut?.images?.length) return nodeOut.images[0];
  }
  return null;
}

export class ComfyUIImageProvider implements ImageProvider {
  readonly name = "comfyui" as const;

  async generateImage(input: ImageGenInput, hooks: ImageGenHooks): Promise<void> {
    if (input.referenceImagePaths?.length) {
      hooks.onStatus("ComfyUI does not support reference images; uploads will be ignored. Use Agnes to preserve subjects.");
    }
    const workflow = buildTestImgWorkflow({
      prompt: input.prompt,
      model: resolveModel(input),
      width: input.width,
      height: input.height,
      steps: 15,
      seed: input.seed ?? -1,
    });
    const clientId = newClientId();

    let promptId: string;
    try {
      promptId = await submitPrompt(workflow, clientId);
    } catch (e) {
      hooks.onError(String(e));
      return;
    }

    hooks.onStatus("Submitted to ComfyUI...");
    await this.waitAndDeliver(promptId, clientId, hooks);
  }

  /** Waits for the prompt to finish (WS events + polling fallback), then downloads and delivers the image. */
  private waitAndDeliver(promptId: string, clientId: string, hooks: ImageGenHooks): Promise<void> {
    let progressDone = false;
    let delivered = false; // guard: deliver output exactly once

    const deliverOutput = async (): Promise<boolean> => {
      if (delivered) return true;
      delivered = true;

      const history = await getHistory(promptId);
      if (!history?.status?.completed) {
        delivered = false;
        return false;
      }
      if (history.status.status_str === "error") {
        hooks.onError(extractErrorDetail(history));
        return true;
      }
      const image = findOutputImage(history.outputs);
      if (!image) {
        hooks.onError("No output image was found");
        return true;
      }
      const buffer = await downloadOutput(image.filename, image.subfolder, image.type);
      await hooks.onDone(buffer);
      return true;
    };

    return new Promise<void>((resolve) => {
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
          hooks.onProgress(event.step ?? 0, event.total ?? 0);
          if (event.step === event.total && (event.total ?? 0) > 0) progressDone = true;
        } else if (event.type === "node") {
          hooks.onStatus(event.node ?? "");
        } else if (event.type === "done") {
          settle(async () => {
            try { await deliverOutput(); } catch (e) { hooks.onError(String(e)); }
          });
        } else if (event.type === "error") {
          settle(() => hooks.onError(event.error ?? "Unknown error"));
        }
      });

      // Poll when the WebSocket does not emit done after progress completes.
      const pollInterval = setInterval(async () => {
        if (!progressDone || settled) return;
        try {
          const history = await getHistory(promptId);
          if (history?.status?.completed) {
            settle(async () => {
              try { await deliverOutput(); } catch (e) { hooks.onError(String(e)); }
            });
          }
        } catch { /* retry */ }
      }, POLL_INTERVAL_MS);

      const timeoutId = setTimeout(() => {
        settle(() => hooks.onError("Timed out after 5 minutes"));
      }, TIMEOUT_MS);
    });
  }
}
