import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVideoProvider } from "@/lib/providers/registry";
import { finalizeVideoFile } from "@/lib/video/finalize-video-file";
import type { VideoGenHooks } from "@/lib/providers/types";

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

    const provider = getVideoProvider(variant.provider === "AGNES" ? "agnes" : "comfyui");

    let recoveredVideoPath: string | undefined;
    const hooks: VideoGenHooks = {
      async onSubmitted() { /* recovery never re-submits */ },
      async onProgress() { /* recovery is a one-shot check */ },
      async onComplete(buffer, ext) {
        recoveredVideoPath = await finalizeVideoFile({
          variantId: variant.id,
          filmId: variant.scene!.episode.filmId,
          episodeId: variant.scene!.episodeId,
          sceneId: variant.sceneId,
          buffer,
          ext,
        });
      },
      async onError(message) {
        await prisma.videoVariant.update({
          where: { id: variant.id },
          data: { status: "FAILED", errorDetail: typeof message === "string" ? message : JSON.stringify(message) },
        });
      },
    };

    const result = await provider.recoverVideo(variant, hooks);

    if (result.status === "still_running") {
      await prisma.videoVariant.update({
        where: { id: variant.id },
        data: { status: "GENERATING_VIDEO", errorDetail: null },
      });
    }

    const body =
      result.status === "recovered"
        ? { status: "recovered", videoPath: recoveredVideoPath }
        : { status: result.status, message: result.message };

    return NextResponse.json(body, result.httpStatus ? { status: result.httpStatus } : undefined);
  } catch (e) {
    console.error("[recover]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
