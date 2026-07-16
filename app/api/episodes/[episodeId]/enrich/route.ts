import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runEnrichment } from "@/lib/ai/enrichment";
import { importEnrichment } from "@/lib/ai/import-enrichment";

export async function POST(
  req: NextRequest,
  { params }: { params: { episodeId: string } }
) {
  const episode = await prisma.episode.findUnique({
    where: { id: params.episodeId },
  });
  if (!episode) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const storyRaw = typeof body.storyRaw === "string" ? body.storyRaw : episode.storyRaw;
  if (!storyRaw.trim()) {
    return NextResponse.json({ error: "No story text" }, { status: 400 });
  }

  await prisma.episode.update({
    where: { id: params.episodeId },
    data: { status: "ENRICHING", storyRaw },
  });

  const existingObjects = await prisma.storyObject.findMany({
    where: { filmId: episode.filmId },
    select: { name: true, type: true, descriptionEn: true },
  });

  try {
    const analysis = await runEnrichment(
      storyRaw,
      existingObjects.map((object) => ({
        name: object.name,
        type: object.type.toLowerCase(),
        description_en: object.descriptionEn,
      })),
      { provider: body.provider }
    );
    const counts = await prisma.$transaction((tx) =>
      importEnrichment(tx, params.episodeId, episode.filmId, analysis)
    );
    return NextResponse.json({ ok: true, ...counts });
  } catch (error) {
    await prisma.episode.update({
      where: { id: params.episodeId },
      data: { status: "DRAFT" },
    });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
