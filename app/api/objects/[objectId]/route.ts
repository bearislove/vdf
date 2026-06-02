import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { objectId: string } }) {
  const obj = await prisma.storyObject.findUnique({
    where: { id: params.objectId },
    include: { sceneLinks: { include: { scene: true } } },
  });
  if (!obj) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(obj);
}

export async function PUT(req: NextRequest, { params }: { params: { objectId: string } }) {
  const body = await req.json();
  const obj = await prisma.storyObject.update({
    where: { id: params.objectId },
    data: {
      name: body.name,
      type: body.type,
      descriptionEn: body.descriptionEn,
      refImages: body.refImages,
      audioRefPath: body.audioRefPath,
      loraPath: body.loraPath,
      flux2Params: body.flux2Params,
      canvasX: body.canvasX,
      canvasY: body.canvasY,
    },
  });
  return NextResponse.json(obj);
}

export async function DELETE(_: NextRequest, { params }: { params: { objectId: string } }) {
  await prisma.storyObject.delete({ where: { id: params.objectId } });
  return NextResponse.json({ ok: true });
}
