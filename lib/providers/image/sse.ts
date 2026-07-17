import type { ImageGenInput, ImageProvider } from "@/lib/providers/types";

/**
 * Runs an image generation and streams progress as an SSE Response.
 * Events: {type:"status",message} | {type:"progress",step,total} | {type:"done",path} | {type:"error",message}.
 * `saveImage` persists the generated buffer and returns the storage-relative path emitted in the "done" event.
 */
export function imageGenerationSSEResponse(
  provider: ImageProvider,
  input: ImageGenInput,
  saveImage: (buffer: Buffer) => Promise<string>
): Response {
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (cancelled) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* ignore */ }
      };

      await provider.generateImage(input, {
        onStatus: (message) => send({ type: "status", message }),
        onProgress: (step, total) => send({ type: "progress", step, total }),
        onDone: async (buffer) => {
          if (cancelled) return;
          try {
            const path = await saveImage(buffer);
            send({ type: "done", path });
          } catch (e) {
            send({ type: "error", message: String(e) });
          }
        },
        onError: (message) => send({ type: "error", message }),
      });

      try { controller.close(); } catch { /* ignore */ }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
