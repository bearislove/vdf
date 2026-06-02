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
  const { episodeId, title, promptEn, order } = await req.json();
  if (!episodeId) return NextResponse.json({ error: "episodeId required" }, { status: 400 });

  const count = await prisma.scene.count({ where: { episodeId } });
  const scene = await prisma.scene.create({
    data: {
      episodeId,
      title: title?.trim() ?? "",
      promptEn: promptEn?.trim() ?? "",
      order: order ?? count,
    },
  });
  return NextResponse.json(scene, { status: 201 });
}
