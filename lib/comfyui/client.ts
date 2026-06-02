import { v4 as uuidv4 } from "uuid";
import WebSocket from "ws";
import type { ComfyUIWSEvent, ComfyUIPromptResponse } from "@/types/comfyui";

const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://localhost:8188";
const COMFYUI_WS_URL = process.env.COMFYUI_WS_URL ?? "ws://localhost:8188/ws";
const TIMEOUT = parseInt(process.env.COMFYUI_TIMEOUT ?? "300") * 1000;

export function newClientId(): string {
  return uuidv4();
}

export async function submitPrompt(
  workflow: Record<string, unknown>,
  clientId: string
): Promise<string> {
  const res = await fetch(`${COMFYUI_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI /prompt failed: ${res.status} ${text}`);
  }
  const data: ComfyUIPromptResponse = await res.json();
  return data.prompt_id;
}

export async function getHistory(promptId: string) {
  const res = await fetch(`${COMFYUI_URL}/history/${promptId}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data[promptId] ?? null;
}

export async function downloadOutput(filename: string, subfolder = "", type = "output"): Promise<Buffer> {
  const url = `${COMFYUI_URL}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${type}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`ComfyUI /view failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer);
}

export type ProgressCallback = (event: {
  type: "progress" | "node" | "done" | "error";
  step?: number;
  total?: number;
  node?: string;
  outputs?: Record<string, unknown>;
  error?: string;
}) => void;

export function listenToPrompt(
  promptId: string,
  clientId: string,
  onProgress: ProgressCallback
): () => void {
  const ws = new WebSocket(`${COMFYUI_WS_URL}?clientId=${clientId}`);
  const timer = setTimeout(() => {
    ws.close();
    onProgress({ type: "error", error: "Timeout" });
  }, TIMEOUT);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ComfyUIWSEvent;
      if (msg.data?.prompt_id && msg.data.prompt_id !== promptId) return;

      if (msg.type === "progress") {
        onProgress({ type: "progress", step: msg.data.value, total: msg.data.max });
      } else if (msg.type === "executing") {
        if (msg.data.node === null) {
          // Workflow complete
          onProgress({ type: "done" });
          clearTimeout(timer);
          ws.close();
        } else {
          onProgress({ type: "node", node: msg.data.node ?? "" });
        }
      } else if (msg.type === "executed") {
        onProgress({ type: "done", outputs: msg.data.output as Record<string, unknown> });
        clearTimeout(timer);
        ws.close();
      }
    } catch {
      // Ignore parse errors
    }
  });

  ws.on("error", (e) => {
    clearTimeout(timer);
    onProgress({ type: "error", error: e.message });
  });

  return () => {
    clearTimeout(timer);
    ws.close();
  };
}
