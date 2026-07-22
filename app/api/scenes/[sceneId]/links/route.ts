import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cloneLinkedObjectReferences } from "@/lib/scene-reference-clones";

const LINK_ROLES = new Set(["main", "present", "mentioned"]);

export async function POST(
  req: NextRequest,
  { params }: { params: { sceneId: string } }
) {
  const body = await req.json().catch(() => ({}));
  const objectId = typeof body.objectId === "string" ? body.objectId : "";
  const role = typeof body.role === "string" && LINK_ROLES.has(body.role)
    ? body.role
    : "present";

  if (!objectId) {
    return NextResponse.json({ error: "objectId required" }, { status: 400 });
  }

  try {
    const [scene, object] = await Promise.all([
      prisma.scene.findUnique({
        where: { id: params.sceneId },
        select: { episode: { select: { filmId: true } } },
      }),
      prisma.storyObject.findUnique({
        where: { id: objectId },
        select: { filmId: true },
      }),
    ]);
    if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    if (!object) return NextResponse.json({ error: "Object not found" }, { status: 404 });
    if (scene.episode.filmId !== object.filmId) {
      return NextResponse.json({ error: "Object and scene must belong to the same film" }, { status: 400 });
    }

    const link = await prisma.sceneObjectLink.upsert({
      where: { sceneId_objectId: { sceneId: params.sceneId, objectId } },
      create: { sceneId: params.sceneId, objectId, role },
      update: { role },
    });
    await cloneLinkedObjectReferences(params.sceneId, { forceObjectIds: [objectId] });
    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
