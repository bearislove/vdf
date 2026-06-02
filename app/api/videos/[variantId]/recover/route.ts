import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHistory, downloadOutput } from "@/lib/comfyui/client";
import { variantDir, ensureDir, storageRelative, STORAGE_ROOT } from "@/lib/storage";
import { extractFirstFrame, extractLastFrame, getVideoDuration } from "@/lib/ffmpeg";
import fs from "fs";
import path from "path";

export async function POST(
  _: NextRequest,
  { params }: { params: { variantId: string } }
) {
  try {
    const variant = await prisma.videoVariant.findUnique({
      where: { id: params.variantId },
      include: { scene: { include: { episode: { include: { film: true } } } } },
    });

    if (!variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    if (!variant.scene) return NextResponse.json({ error: "Scene not found (may have been deleted)" }, { status: 404 });
    if (!variant.comfyPromptId) {
      return NextResponse.json({ status: "no_prompt_id", message: "Variant was never submitted to ComfyUI" });
    }

    // Query ComfyUI history
    let history: Awaited<ReturnType<typeof getHistory>>;
    try {
      history = await getHistory(variant.comfyPromptId);
    } catch (e) {
      return NextResponse.json({ status: "comfyui_unreachable", message: String(e) }, { status: 502 });
    }

    if (!history) {
      // ComfyUI doesn't know this job — could be cleared from history
      return NextResponse.json({ status: "not_found_in_comfyui", message: "Job not found in ComfyUI history (may have been cleared)" });
    }

    // Still running
    if (!history.status?.completed) {
      await prisma.videoVariant.update({
        where: { id: variant.id },
        data: { status: "GENERATING_VIDEO", errorDetail: null },
      });
      return NextResponse.json({ status: "still_running", message: "Job is still running in ComfyUI" });
    }

    // ComfyUI reported error
    if (history.status?.status_str === "error") {
      const msgs: string[][] = history.status?.messages ?? [];
      const errMsg = msgs.find((m: string[]) => m[0] === "execution_error");
      const detail = errMsg ? JSON.stringify(errMsg[1]).slice(0, 300) : "ComfyUI execution error";
      await prisma.videoVariant.update({
        where: { id: variant.id },
        data: { status: "FAILED", errorDetail: detail },
      });
      return NextResponse.json({ status: "comfyui_error", message: detail });
    }

    // Completed — download output
    const filmId = variant.scene.episode.filmId;
    const episodeId = variant.scene.episodeId;
    const sceneId = variant.sceneId;
    const vDir = variantDir(filmId, episodeId, sceneId, variant.id);
    ensureDir(vDir);

    let videoPath: string | null = null;
    if (history.outputs) {
      for (const nodeOut of Object.values(history.outputs) as Array<{ images?: Array<{ filename: string; subfolder: string; type: string }> }>) {
        if (nodeOut?.images?.length) {
          const img = nodeOut.images[0];
          try {
            const buf = await downloadOutput(img.filename, img.subfolder, img.type);
            const ext = path.extname(img.filename) || ".webp";
            const outPath = path.join(vDir, `video${ext}`);
            fs.writeFileSync(outPath, buf);
            videoPath = storageRelative(outPath);
          } catch (e) {
            return NextResponse.json({ status: "download_failed", message: String(e) }, { status: 500 });
          }
          break;
        }
      }
    }

    if (!videoPath) {
      return NextResponse.json({ status: "no_output", message: "ComfyUI completed but produced no output images" });
    }

    // Extract thumbnail + last frame + duration
    let thumbnailPath: string | null = null;
    let lastFramePath: string | null = null;
    let durationSeconds: number | null = null;

    const abs = path.resolve(STORAGE_ROOT, videoPath);
    if (fs.existsSync(abs)) {
      try { const t = path.join(vDir, "thumbnail.png"); await extractFirstFrame(abs, t); thumbnailPath = storageRelative(t); } catch { /**/ }
      try { const l = path.join(vDir, "last_frame.png"); await extractLastFrame(abs, l); lastFramePath = storageRelative(l); } catch { /**/ }
      try {
        const dur = await getVideoDuration(abs);
        durationSeconds = typeof dur === "number" && isFinite(dur) ? dur : null;
      } catch { /**/ }
    }

    await prisma.videoVariant.update({
      where: { id: variant.id },
      data: {
        status: "DONE",
        videoPath,
        thumbnailPath,
        lastFramePath,
        durationSeconds,
        completedAt: new Date(),
        errorDetail: null,
      },
    });

    return NextResponse.json({ status: "recovered", videoPath });
  } catch (e) {
    console.error("[recover]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
