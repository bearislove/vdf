import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EnrichmentSchema } from "@/lib/ai/enrichment";
import { importEnrichment } from "@/lib/ai/import-enrichment";

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
  const { filmId, title, storyRaw, targetDurationSeconds, sceneCountHint, analysis } = await req.json();
  if (!filmId || !title?.trim()) {
    return NextResponse.json({ error: "filmId and title required" }, { status: 400 });
  }

  const parsedAnalysis = analysis === undefined
    ? null
    : EnrichmentSchema.safeParse(analysis);
  if (parsedAnalysis && !parsedAnalysis.success) {
    return NextResponse.json(
      { error: "Invalid episode analysis", details: parsedAnalysis.error.flatten() },
      { status: 400 }
    );
  }

  const episode = await prisma.$transaction(async (tx) => {
    const count = await tx.episode.count({ where: { filmId } });
    const created = await tx.episode.create({
      data: {
        filmId,
        title: title.trim(),
        order: count,
        storyRaw: storyRaw?.trim() ?? "",
        targetDurationSeconds: targetDurationSeconds ?? null,
        sceneCountHint: parsedAnalysis?.success
          ? parsedAnalysis.data.scenes.length
          : sceneCountHint ?? null,
      },
    });

    if (parsedAnalysis?.success) {
      await importEnrichment(tx, created.id, filmId, parsedAnalysis.data);
    }
    return created;
  });

  return NextResponse.json(episode, { status: 201 });
}
