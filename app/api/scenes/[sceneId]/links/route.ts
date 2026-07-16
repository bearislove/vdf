import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cloneLinkedObjectReferences } from "@/lib/scene-reference-clones";

export async function POST(
  req: NextRequest,
  { params }: { params: { sceneId: string } }
) {
  const { objectId, role } = await req.json();
  try {
    const link = await prisma.sceneObjectLink.upsert({
      where: { sceneId_objectId: { sceneId: params.sceneId, objectId } },
      create: { sceneId: params.sceneId, objectId, role: role ?? "present" },
      update: { role: role ?? "present" },
    });
    await cloneLinkedObjectReferences(params.sceneId, { forceObjectIds: [objectId] });
    return NextResponse.json(link, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
