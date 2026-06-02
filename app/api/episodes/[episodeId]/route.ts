import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { episodeId: string } }) {
  const episode = await prisma.episode.findUnique({
    where: { id: params.episodeId },
    include: {
      scenes: {
        orderBy: { order: "asc" },
        include: {
          objectLinks: { include: { object: true } },
          videoVariants: { orderBy: { createdAt: "asc" } },
          selectedVideo: true,
        },
      },
    },
  });
  if (!episode) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(episode);
}

export async function PUT(req: NextRequest, { params }: { params: { episodeId: string } }) {
  const body = await req.json();
  const episode = await prisma.episode.update({
    where: { id: params.episodeId },
    data: {
      title: body.title,
      storyRaw: body.storyRaw,
      canvasState: body.canvasState,
      imageModel: body.imageModel,
      videoModel: body.videoModel,
      status: body.status,
      targetDurationSeconds: body.targetDurationSeconds,
      sceneCountHint: body.sceneCountHint,
    },
  });
  return NextResponse.json(episode);
}

export async function DELETE(_: NextRequest, { params }: { params: { episodeId: string } }) {
  await prisma.episode.delete({ where: { id: params.episodeId } });
  return NextResponse.json({ ok: true });
}
