import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _: NextRequest,
  { params }: { params: { sceneId: string; linkId: string } }
) {
  const result = await prisma.sceneObjectLink.deleteMany({
    where: { id: params.linkId, sceneId: params.sceneId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Scene object link not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
