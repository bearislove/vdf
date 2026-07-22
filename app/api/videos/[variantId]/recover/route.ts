import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recoverVideoVariant } from "@/lib/video/recover-video-variant";

export async function POST(
  _: NextRequest,
  { params }: { params: { variantId: string } }
) {
  try {
    const variant = await prisma.videoVariant.findUnique({
      where: { id: params.variantId },
      include: { scene: { include: { episode: { include: { film: true } } } } },
    });

    if (!variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    if (!variant.scene) return NextResponse.json({ error: "Scene not found (may have been deleted)" }, { status: 404 });

    const result = await recoverVideoVariant(variant);

    const body =
      result.status === "recovered" && result.videoPath
        ? { status: "recovered", videoPath: result.videoPath }
        : { status: result.status, message: result.message };

    return NextResponse.json(body, result.httpStatus ? { status: result.httpStatus } : undefined);
  } catch (e) {
    console.error("[recover]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
