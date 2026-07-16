import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const episodeId = req.nextUrl.searchParams.get("episodeId");
  if (!episodeId) return NextResponse.json({ error: "episodeId required" }, { status: 400 });

  const scenes = await prisma.scene.findMany({
    where: { episodeId },
    orderBy: { order: "asc" },
    include: {
      objectLinks: { include: { object: true } },
      videoVariants: { orderBy: { createdAt: "asc" } },
    },
  });
  return NextResponse.json(scenes);
}

export async function POST(req: NextRequest) {
  const { episodeId, title, promptEn, targetImagePrompt, negativePrompt, order, canvasX, canvasY, connectPrevious } = await req.json();
  if (!episodeId) return NextResponse.json({ error: "episodeId required" }, { status: 400 });

  const scene = await prisma.$transaction(async (tx) => {
    const highestOrder = await tx.scene.aggregate({
      where: { episodeId },
      _max: { order: true },
    });
    const sceneOrder = Number.isInteger(order) && order >= 0
      ? order
      : (highestOrder._max.order ?? -1) + 1;
    const previousScene = connectPrevious === true
      ? await tx.scene.findFirst({
          where: { episodeId, order: { lt: sceneOrder } },
          orderBy: { order: "desc" },
          select: { id: true, transitionsTo: true },
        })
      : null;

    const created = await tx.scene.create({
      data: {
        episodeId,
        title: title?.trim() ?? "",
        promptEn: promptEn?.trim() ?? "",
        targetImagePrompt: targetImagePrompt?.trim() ?? promptEn?.trim() ?? "",
        negativePrompt: negativePrompt?.trim() ?? "",
        order: sceneOrder,
        ...(typeof canvasX === "number" && { canvasX }),
        ...(typeof canvasY === "number" && { canvasY }),
      },
    });

    if (previousScene) {
      const existingTransitions = Array.isArray(previousScene.transitionsTo)
        ? previousScene.transitionsTo.filter((id): id is string => typeof id === "string")
        : [];
      await tx.scene.update({
        where: { id: previousScene.id },
        data: { transitionsTo: Array.from(new Set([...existingTransitions, created.id])) },
      });
    }

    return created;
  });
  return NextResponse.json(scene, { status: 201 });
}
