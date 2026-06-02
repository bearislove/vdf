import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _: NextRequest,
  { params }: { params: { sceneId: string; linkId: string } }
) {
  await prisma.sceneObjectLink.delete({ where: { id: params.linkId } });
  return NextResponse.json({ ok: true });
}
