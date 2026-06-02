import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { filmId: string } }) {
  const film = await prisma.film.findUnique({
    where: { id: params.filmId },
    include: { episodes: { orderBy: { order: "asc" } } },
  });
  if (!film) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(film);
}

export async function PUT(req: NextRequest, { params }: { params: { filmId: string } }) {
  const body = await req.json();
  const film = await prisma.film.update({
    where: { id: params.filmId },
    data: { title: body.title, description: body.description },
  });
  return NextResponse.json(film);
}

export async function DELETE(_: NextRequest, { params }: { params: { filmId: string } }) {
  await prisma.film.delete({ where: { id: params.filmId } });
  return NextResponse.json({ ok: true });
}
