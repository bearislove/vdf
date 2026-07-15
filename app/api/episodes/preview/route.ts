import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runEnrichment } from "@/lib/ai/enrichment";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const filmId = typeof body.filmId === "string" ? body.filmId : "";
  const storyRaw = typeof body.storyRaw === "string" ? body.storyRaw.trim() : "";
  const revisionRequest = typeof body.revisionRequest === "string"
    ? body.revisionRequest.trim()
    : undefined;

  if (!filmId || !storyRaw) {
    return NextResponse.json({ error: "filmId and storyRaw required" }, { status: 400 });
  }

  const film = await prisma.film.findUnique({
    where: { id: filmId },
    select: { id: true },
  });
  if (!film) return NextResponse.json({ error: "Film not found" }, { status: 404 });

  const existingObjects = await prisma.storyObject.findMany({
    where: { filmId },
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
      revisionRequest
    );
    return NextResponse.json(analysis);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
