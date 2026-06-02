import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { sceneId: string } }) {
  const scene = await prisma.scene.findUnique({
    where: { id: params.sceneId },
    include: {
      objectLinks: { include: { object: true } },
      videoVariants: { orderBy: { createdAt: "asc" } },
      selectedVideo: true,
    },
  });
  if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(scene);
}

export async function PUT(req: NextRequest, { params }: { params: { sceneId: string } }) {
  const body = await req.json();
  const scene = await prisma.scene.update({
    where: { id: params.sceneId },
    data: {
      title: body.title,
      promptEn: body.promptEn,
      promptEnOverride: body.promptEnOverride,
      cameraDirection: body.cameraDirection,
      shotType: body.shotType,
      mood: body.mood,
      lightingNote: body.lightingNote,
      transitionsTo: body.transitionsTo,
      selectedVideoId: body.selectedVideoId,
      videoModel: body.videoModel,
      videoParams: body.videoParams,
      useLastFrameChaining: body.useLastFrameChaining,
      strategyOverride: body.strategyOverride,
      canvasX: body.canvasX,
      canvasY: body.canvasY,
    },
  });
  return NextResponse.json(scene);
}

export async function DELETE(_: NextRequest, { params }: { params: { sceneId: string } }) {
  await prisma.scene.delete({ where: { id: params.sceneId } });
  return NextResponse.json({ ok: true });
}
