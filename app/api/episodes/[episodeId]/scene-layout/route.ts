import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSceneCanvasPosition } from "@/lib/canvas/scene-layout";

export async function PUT(
  _req: NextRequest,
  { params }: { params: { episodeId: string } }
) {
  const scenes = await prisma.scene.findMany({
    where: { episodeId: params.episodeId },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });

  const arrangedScenes = scenes.map((scene) => ({
    id: scene.id,
    ...getSceneCanvasPosition(scene.order),
  }));

  await prisma.$transaction(
    arrangedScenes.map((scene) =>
      prisma.scene.update({
        where: { id: scene.id },
        data: { canvasX: scene.x, canvasY: scene.y },
      })
    )
  );

  return NextResponse.json({ scenes: arrangedScenes });
}

