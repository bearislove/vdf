import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { newClientId, submitPrompt, listenToPrompt, downloadOutput, getHistory } from "@/lib/comfyui/client";
import { buildWorkflow } from "@/lib/comfyui/workflow-builder";
import { variantDir, ensureDir, storageRelative, STORAGE_ROOT } from "@/lib/storage";
import { extractLastFrame, extractFirstFrame, getVideoDuration } from "@/lib/ffmpeg";
import fs from "fs";
import path from "path";

const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://localhost:8188";
const TIMEOUT = parseInt(process.env.COMFYUI_TIMEOUT ?? "300") * 1000;

export async function POST(req: NextRequest) {
  const { sceneId, params: videoParams } = await req.json();
  if (!sceneId) return NextResponse.json({ error: "sceneId required" }, { status: 400 });

  // Load scene with all relations
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      episode: { include: { film: true } },
      objectLinks: { include: { object: true } },
      videoVariants: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });

  const filmId = scene.episode.filmId;
  const episodeId = scene.episodeId;

  // Get previous scene's last variant for chaining
  const prevScene = await prisma.scene.findFirst({
    where: { episodeId, order: scene.order - 1 },
    include: { selectedVideo: true, videoVariants: { orderBy: { completedAt: "desc" }, take: 1 } },
  });
  const previousVariant = prevScene?.selectedVideo ?? prevScene?.videoVariants?.[0] ?? null;

  // Build workflow
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { workflow, strategy, uploadedImages } = await buildWorkflow({
    scene: scene as unknown as Parameters<typeof buildWorkflow>[0]["scene"],
    objects: scene.objectLinks.map((l) => l.object) as unknown as Parameters<typeof buildWorkflow>[0]["objects"],
    variantId: "temp",
    filmId,
    episodeId,
    videoParams: videoParams ?? {},
    previousVariant: previousVariant as unknown as Parameters<typeof buildWorkflow>[0]["previousVariant"],
  });

  // Create variant record
  const variant = await prisma.videoVariant.create({
    data: {
      sceneId,
      paramsSnapshot: videoParams ?? {},
      workflowSnapshot: workflow as import("@prisma/client").Prisma.InputJsonValue,
      status: "QUEUED",
      strategy,
    },
  });

  const vDir = variantDir(filmId, episodeId, sceneId, variant.id);
  ensureDir(vDir);

  // Upload reference images to ComfyUI
  for (const imgPath of uploadedImages) {
    if (fs.existsSync(imgPath)) {
      const formData = new FormData();
      const buffer = fs.readFileSync(imgPath);
      const blob = new Blob([buffer]);
      formData.append("image", blob, path.basename(imgPath));
      await fetch(`${COMFYUI_URL}/upload/image`, {
        method: "POST",
        body: formData,
      }).catch(() => {});
    }
  }

  // Submit to ComfyUI and listen async
  const clientId = newClientId();

  // Fire-and-forget generation
  (async () => {
    try {
      const promptId = await submitPrompt(workflow, clientId);

      await prisma.videoVariant.update({
        where: { id: variant.id },
        data: { status: "GENERATING_VIDEO", comfyPromptId: promptId, comfyClientId: clientId },
      });

      type OutputImage = { filename: string; subfolder: string; type: string };

      // Extract output images from event.outputs or ComfyUI history
      const resolveOutputImages = async (eventOutputs?: Record<string, unknown>): Promise<OutputImage[]> => {
        if (eventOutputs) {
          const imgs = (eventOutputs as { images?: OutputImage[] }).images;
          if (imgs?.length) return imgs;
        }
        const history = await getHistory(promptId);
        if (history?.outputs) {
          for (const nodeOut of Object.values(history.outputs) as Array<{ images?: OutputImage[] }>) {
            if (nodeOut?.images?.length) return nodeOut.images;
          }
        }
        return [];
      };

      const handleDone = async (eventOutputs?: Record<string, unknown>) => {
        let savedPath: string | null = null;
        let errorDetail: string | null = null;
        try {
          const outputImages = await resolveOutputImages(eventOutputs);
          if (outputImages.length) {
            const img = outputImages[0];
            const buffer = await downloadOutput(img.filename, img.subfolder, img.type);
            const ext = path.extname(img.filename) || ".webp";
            const outPath = path.join(vDir, `video${ext}`);
            fs.writeFileSync(outPath, buffer);
            savedPath = storageRelative(outPath);
          } else {
            errorDetail = "No output images from ComfyUI";
          }
        } catch (e) {
          errorDetail = String(e);
        }

        if (errorDetail) {
          await prisma.videoVariant.update({
            where: { id: variant.id },
            data: { status: "FAILED", errorDetail, completedAt: new Date() },
          });
          return;
        }

        let thumbnailPath: string | null = null;
        let lastFramePath: string | null = null;
        let durationSeconds: number | null = null;

        if (savedPath) {
          const absVideo = path.resolve(STORAGE_ROOT, savedPath);
          if (fs.existsSync(absVideo)) {
            try {
              const thumbOut = path.join(vDir, "thumbnail.png");
              await extractFirstFrame(absVideo, thumbOut);
              thumbnailPath = storageRelative(thumbOut);
            } catch { /* ignore */ }
            try {
              const lastFrameOut = path.join(vDir, "last_frame.png");
              await extractLastFrame(absVideo, lastFrameOut);
              lastFramePath = storageRelative(lastFrameOut);
            } catch { /* ignore */ }
            try {
              const dur = await getVideoDuration(absVideo);
              durationSeconds = typeof dur === "number" && isFinite(dur) ? dur : null;
            } catch { /* ignore */ }
          }
        }

        await prisma.videoVariant.update({
          where: { id: variant.id },
          data: {
            status: "DONE",
            videoPath: savedPath,
            thumbnailPath,
            lastFramePath,
            durationSeconds,
            completedAt: new Date(),
          },
        });
      };

      let processed = false;
      let progressDone = false;

      // Recovery polling: dùng khi WS drop hoặc timeout — không mark FAILED ngay
      const startRecoveryPolling = async (reason: string) => {
        const INTERVAL = 10_000;   // poll 10s
        const MAX = 2 * 60 * 60 * 1000; // tối đa 2 giờ
        const start = Date.now();
        while (Date.now() - start < MAX) {
          await new Promise((r) => setTimeout(r, INTERVAL));
          try {
            const history = await getHistory(promptId);
            // null = job vẫn đang chạy hoặc queued (chưa có trong history) → tiếp tục chờ
            if (!history) continue;
            if (history.status?.status_str === "error") break;
            if (history.status?.completed) {
              await handleDone(undefined);
              return;
            }
            // history tồn tại nhưng chưa completed → còn chạy
          } catch { /* network error, retry */ }
        }
        await prisma.videoVariant.update({
          where: { id: variant.id },
          data: { status: "FAILED", errorDetail: `${reason} — timed out after 2h` },
        }).catch(() => {});
      };

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
            if (event.step === event.total && (event.total ?? 0) > 0) progressDone = true;
            await prisma.videoVariant.update({
              where: { id: variant.id },
              data: { progressStep: event.step ?? 0, progressTotal: event.total ?? 0 },
            }).catch(() => {});
          } else if (event.type === "node") {
            await prisma.videoVariant.update({
              where: { id: variant.id },
              data: { currentNode: event.node ?? "" },
            }).catch(() => {});
          } else if (event.type === "done") {
            if (processed) return;
            processed = true;
            settle(async () => { await handleDone(event.outputs); });
          } else if (event.type === "error") {
            // WS bị ngắt — KHÔNG mark FAILED ngay, chuyển sang polling
            settle(async () => {
              await startRecoveryPolling("WebSocket disconnected");
            });
          }
        });

        // Fast polling fallback (5s) — dùng khi progress done nhưng WS chưa báo done
        const pollInterval = setInterval(async () => {
          if (!progressDone || settled) return;
          try {
            const history = await getHistory(promptId);
            if (history?.status?.completed) {
              clearInterval(pollInterval);
              cleanup();
              if (!processed) {
                processed = true;
                settle(async () => { await handleDone(undefined); });
              }
            }
          } catch { /* retry */ }
        }, 5000);

        // WS timeout — chuyển sang recovery polling, không mark FAILED
        setTimeout(() => {
          clearInterval(pollInterval);
          cleanup();
          if (settled) return;
          settle(async () => {
            await startRecoveryPolling("WebSocket timeout");
          });
        }, TIMEOUT);
      });
    } catch (e) {
      await prisma.videoVariant.update({
        where: { id: variant.id },
        data: { status: "FAILED", errorDetail: String(e) },
      }).catch(() => {});
    }
  })();

  return NextResponse.json({ variantId: variant.id }, { status: 202 });
}
