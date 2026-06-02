import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { newClientId, submitPrompt, listenToPrompt, downloadOutput } from "@/lib/comfyui/client";
import { buildTestImgWorkflow } from "@/lib/comfyui/workflows/test-img";
import { objectRefImagesDir, ensureDir, storageRelative } from "@/lib/storage";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { objectId: string } }
) {
  const obj = await prisma.storyObject.findUnique({
    where: { id: params.objectId },
  });
  if (!obj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const prompt = (body.prompt as string) || obj.descriptionEn || obj.name;
  const model =
    (body.model as string) ||
    process.env.DEFAULT_IMAGE_MODEL ||
    "realisticVisionV51.safetensors";
  const width = (body.width as number) || 512;
  const height = (body.height as number) || 512;
  const seed = (body.seed as number) ?? -1;

  const workflow = buildTestImgWorkflow({ prompt, model, width, height, steps: 15, seed });
  const clientId = newClientId();

  let promptId: string;
  try {
    promptId = await submitPrompt(workflow, clientId);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }

  // Capture obj fields needed inside stream (obj could be GC'd)
  const objId = obj.id;
  const objFilmId = obj.filmId;
  const getRefImages = () =>
    prisma.storyObject.findUnique({ where: { id: objId } }).then((o) =>
      (o?.refImages as Array<{ path: string; isMain: boolean; label: string }>) ?? []
    );

  // Stream SSE progress while waiting
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (data: object) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* ignore */ }
      };
      const closeStream = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* ignore */ }
      };

      send({ type: "status", message: "Đã gửi tới ComfyUI..." });
      let progressDone = false;
      let downloaded = false; // guard: chỉ cho phép downloadAndSave chạy đúng 1 lần

      async function downloadAndSave(): Promise<boolean> {
        if (downloaded) return true;
        downloaded = true;

        const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://localhost:8188";
        const history = await fetch(`${COMFYUI_URL}/history/${promptId}`).then((r) => r.json());
        const item = history[promptId];
        if (!item?.status?.completed) { downloaded = false; return false; }
        if (item?.status?.status_str === "error") {
          const msgs: string[][] = item?.status?.messages ?? [];
          const errMsg = msgs.find((m) => m[0] === "execution_error");
          send({ type: "error", message: errMsg ? JSON.stringify(errMsg[1]).slice(0, 200) : "ComfyUI error" });
          return true;
        }
        for (const [, out] of Object.entries(item.outputs ?? {}) as [string, { images?: Array<{ filename: string; subfolder: string; type: string }> }][]) {
          if (out?.images?.length) {
            const imgFile = out.images[0];
            const buf = await downloadOutput(imgFile.filename, imgFile.subfolder, imgFile.type);
            const dir = objectRefImagesDir(objFilmId, objId);
            ensureDir(dir);
            const filename = `gen_${Date.now()}.png`;
            const outPath = path.join(dir, filename);
            fs.writeFileSync(outPath, buf);
            const relPath = storageRelative(outPath);
            const existing = await getRefImages();
            const isFirstImage = existing.length === 0;
            await prisma.storyObject.update({
              where: { id: objId },
              data: { refImages: [...existing, { path: relPath, isMain: isFirstImage, label: "AI generated" }] },
            });
            send({ type: "done", path: relPath });
            return true;
          }
        }
        send({ type: "error", message: "Không tìm thấy ảnh output" });
        return true;
      }

      await new Promise<void>((resolve) => {
        let settled = false;
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          fn();
          resolve();
        };

        const cleanup = listenToPrompt(promptId, clientId, async (event) => {
          if (event.type === "progress") {
            send({ type: "progress", step: event.step, total: event.total });
            if (event.step === event.total && event.total! > 0) progressDone = true;
          } else if (event.type === "node") {
            send({ type: "status", message: event.node });
          } else if (event.type === "done") {
            settle(async () => {
              try { await downloadAndSave(); } catch (e) { send({ type: "error", message: String(e) }); }
            });
          } else if (event.type === "error") {
            settle(() => send({ type: "error", message: event.error ?? "Unknown error" }));
          }
        });

        // Polling fallback: dùng khi WS không gửi done sau khi progress xong
        const pollInterval = setInterval(async () => {
          if (!progressDone || settled) return;
          try {
            const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://localhost:8188";
            const history = await fetch(`${COMFYUI_URL}/history/${promptId}`).then((r) => r.json());
            const item = history[promptId];
            if (item?.status?.completed) {
              clearInterval(pollInterval);
              cleanup();
              settle(async () => {
                try { await downloadAndSave(); } catch (e) { send({ type: "error", message: String(e) }); }
              });
            }
          } catch { /* retry */ }
        }, 3000);

        setTimeout(() => {
          clearInterval(pollInterval);
          cleanup();
          send({ type: "error", message: "Timeout sau 5 phút" });
          resolve();
        }, 300000);
      });

      closeStream();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
