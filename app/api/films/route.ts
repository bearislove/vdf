import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureStorageDir } from "@/lib/storage";

ensureStorageDir();

export async function GET() {
  const films = await prisma.film.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { episodes: true } },
      episodes: {
        select: { _count: { select: { scenes: true } }, status: true },
      },
    },
  });
  return NextResponse.json(films);
}

export async function POST(req: NextRequest) {
  const { title, description } = await req.json();
  if (!title?.trim()) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }
  const film = await prisma.film.create({
    data: { title: title.trim(), description: description?.trim() ?? "" },
  });
  return NextResponse.json(film, { status: 201 });
}
