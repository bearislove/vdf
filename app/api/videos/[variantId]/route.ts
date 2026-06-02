import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _: NextRequest,
  { params }: { params: { variantId: string } }
) {
  const variant = await prisma.videoVariant.findUnique({
    where: { id: params.variantId },
  });
  if (!variant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(variant);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { variantId: string } }
) {
  const body = await req.json();
  const variant = await prisma.videoVariant.update({
    where: { id: params.variantId },
    data: {
      ...(body.canvasX !== undefined && { canvasX: body.canvasX }),
      ...(body.canvasY !== undefined && { canvasY: body.canvasY }),
    },
  });
  return NextResponse.json(variant);
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: { variantId: string } }
) {
  await prisma.videoVariant.delete({ where: { id: params.variantId } });
  return NextResponse.json({ ok: true });
}
