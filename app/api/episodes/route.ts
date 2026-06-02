import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const filmId = req.nextUrl.searchParams.get("filmId");
  if (!filmId) return NextResponse.json({ error: "filmId required" }, { status: 400 });

  const episodes = await prisma.episode.findMany({
    where: { filmId },
    orderBy: { order: "asc" },
    include: {
      _count: { select: { scenes: true } },
    },
  });
  return NextResponse.json(episodes);
}

export async function POST(req: NextRequest) {
  const { filmId, title, storyRaw, targetDurationSeconds, sceneCountHint } = await req.json();
  if (!filmId || !title?.trim()) {
    return NextResponse.json({ error: "filmId and title required" }, { status: 400 });
  }
  const count = await prisma.episode.count({ where: { filmId } });
  const episode = await prisma.episode.create({
    data: {
      filmId,
      title: title.trim(),
      order: count,
      storyRaw: storyRaw?.trim() ?? "",
      targetDurationSeconds: targetDurationSeconds ?? null,
      sceneCountHint: sceneCountHint ?? null,
    },
  });
  return NextResponse.json(episode, { status: 201 });
}
