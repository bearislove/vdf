import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeStoredVariantReferenceImages } from "@/lib/video/reference-image-dedup";

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
  await normalizeStoredVariantReferenceImages([
    ...scene.videoVariants,
    ...(scene.selectedVideo ? [scene.selectedVideo] : []),
  ]);
  return NextResponse.json(scene);
}

export async function PUT(req: NextRequest, { params }: { params: { sceneId: string } }) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const currentScene = await prisma.scene.findUnique({
    where: { id: params.sceneId },
    select: { episodeId: true },
  });
  if (!currentScene) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let transitionsTo: string[] | undefined;
  if (body.transitionsTo !== undefined) {
    if (!Array.isArray(body.transitionsTo) || body.transitionsTo.some((id: unknown) => typeof id !== "string")) {
      return NextResponse.json({ error: "transitionsTo must be an array of scene IDs" }, { status: 400 });
    }
    transitionsTo = Array.from(new Set(body.transitionsTo as string[]));
    if (transitionsTo.includes(params.sceneId)) {
      return NextResponse.json({ error: "A scene cannot transition to itself" }, { status: 400 });
    }
    const validTargetCount = await prisma.scene.count({
      where: { id: { in: transitionsTo }, episodeId: currentScene.episodeId },
    });
    if (validTargetCount !== transitionsTo.length) {
      return NextResponse.json(
        { error: "Transition targets must belong to the same episode" },
        { status: 400 }
      );
    }
  }

  if (body.selectedVideoId !== undefined && body.selectedVideoId !== null) {
    if (typeof body.selectedVideoId !== "string") {
      return NextResponse.json({ error: "selectedVideoId must be a string or null" }, { status: 400 });
    }
    const selectedVariant = await prisma.videoVariant.findFirst({
      where: { id: body.selectedVideoId, sceneId: params.sceneId },
      select: { id: true },
    });
    if (!selectedVariant) {
      return NextResponse.json({ error: "Selected video must belong to the scene" }, { status: 400 });
    }
  }

  const scene = await prisma.scene.update({
    where: { id: params.sceneId },
    data: {
      title: body.title,
      promptEn: body.promptEn,
      promptEnOverride: body.promptEnOverride,
      targetImagePrompt: body.targetImagePrompt,
      negativePrompt: body.negativePrompt,
      cameraDirection: body.cameraDirection,
      shotType: body.shotType,
      mood: body.mood,
      lightingNote: body.lightingNote,
      transitionsTo,
      selectedVideoId: body.selectedVideoId,
      videoParams: body.videoParams,
      canvasX: body.canvasX,
      canvasY: body.canvasY,
    },
  });
  return NextResponse.json(scene);
}

export async function DELETE(_: NextRequest, { params }: { params: { sceneId: string } }) {
  const scene = await prisma.scene.findUnique({
    where: { id: params.sceneId },
    select: { episodeId: true },
  });
  if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const episodeScenes = await prisma.scene.findMany({
    where: { episodeId: scene.episodeId },
    select: { id: true, transitionsTo: true },
  });
  const referencingScenes = episodeScenes.flatMap((candidate) => {
    const transitions = Array.isArray(candidate.transitionsTo)
      ? candidate.transitionsTo.filter((id): id is string => typeof id === "string")
      : [];
    return transitions.includes(params.sceneId)
      ? [{ id: candidate.id, transitionsTo: transitions.filter((id) => id !== params.sceneId) }]
      : [];
  });

  await prisma.$transaction([
    ...referencingScenes.map((candidate) => prisma.scene.update({
      where: { id: candidate.id },
      data: { transitionsTo: candidate.transitionsTo },
    })),
    prisma.scene.delete({ where: { id: params.sceneId } }),
  ]);
  return NextResponse.json({ ok: true });
}
