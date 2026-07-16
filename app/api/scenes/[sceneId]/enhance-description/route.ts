import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  promptEnhanceCommercialScene,
  SYSTEM_COMMERCIAL_SCENE_DIRECTOR,
} from "@/lib/ai/prompts";
import { getLLMProvider } from "@/lib/providers/registry";

const MAX_DESCRIPTION_LENGTH = 5000;

export async function POST(
  req: NextRequest,
  { params }: { params: { sceneId: string } }
) {
  const scene = await prisma.scene.findUnique({
    where: { id: params.sceneId },
    include: { objectLinks: { include: { object: true } } },
  });
  if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const requestedDescription = typeof body.description === "string"
    ? body.description.trim()
    : "";
  const description = requestedDescription || scene.promptEnOverride || scene.promptEn;
  if (!description) {
    return NextResponse.json({ error: "Scene description is required" }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json({ error: "Scene description is too long" }, { status: 400 });
  }

  try {
    const prompt = promptEnhanceCommercialScene({
      description,
      title: scene.title,
      shotType: scene.shotType,
      mood: scene.mood,
      cameraDirection: scene.cameraDirection,
      lightingNote: scene.lightingNote,
      objects: scene.objectLinks.map((link) => ({
        name: link.object.name,
        type: link.object.type.toLowerCase(),
        role: link.role,
        description: link.object.descriptionEn,
      })),
    });
    const enhancedDescription = (await getLLMProvider(body.provider).chatComplete(
      SYSTEM_COMMERCIAL_SCENE_DIRECTOR,
      prompt,
      { temperature: 0.65 }
    )).trim();
    if (!enhancedDescription) throw new Error("AI returned an empty scene description");
    return NextResponse.json({ description: enhancedDescription });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
