import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const filmId = req.nextUrl.searchParams.get("filmId");
  if (!filmId) return NextResponse.json({ error: "filmId required" }, { status: 400 });

  const objects = await prisma.storyObject.findMany({
    where: { filmId },
    orderBy: { createdAt: "asc" },
    include: { sceneLinks: { include: { scene: true } } },
  });
  return NextResponse.json(objects);
}

export async function POST(req: NextRequest) {
  const { filmId, type, name, descriptionEn } = await req.json();
  if (!filmId || !type || !name?.trim()) {
    return NextResponse.json({ error: "filmId, type, name required" }, { status: 400 });
  }
  const obj = await prisma.storyObject.create({
    data: {
      filmId,
      type,
      name: name.trim(),
      descriptionEn: descriptionEn?.trim() ?? "",
    },
  });
  return NextResponse.json(obj, { status: 201 });
}
