import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  promptSimplifySceneDescription,
  SYSTEM_SCENE_SIMPLIFIER,
} from "@/lib/ai/prompts";
import { getLLMProvider } from "@/lib/providers/registry";

const MAX_DESCRIPTION_LENGTH = 5000;

export async function POST(
  req: NextRequest,
  { params }: { params: { sceneId: string } }
) {
  const scene = await prisma.scene.findUnique({ where: { id: params.sceneId } });
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
    const simplifiedDescription = (await getLLMProvider(body.provider).chatComplete(
      SYSTEM_SCENE_SIMPLIFIER,
      promptSimplifySceneDescription(description),
      { temperature: 0.3 }
    )).trim();
    if (!simplifiedDescription) throw new Error("AI returned an empty scene description");
    return NextResponse.json({ description: simplifiedDescription });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
