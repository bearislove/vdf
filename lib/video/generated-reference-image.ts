import fs from "fs";
import path from "path";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import {
  ensureDir,
  sceneCompositeImagesDir,
  storageRelative,
} from "@/lib/storage";
import type { SceneForVideoGeneration } from "@/lib/video/run-video-generation";

const DEFAULT_IMAGE_MODEL = "cx/gpt-5.5-image";
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

interface GeneratedReferenceImage {
  path: string;
  model: string;
}

interface ImagePayload {
  b64_json?: string;
  url?: string;
}

function buildPhotorealisticPrompt(scene: SceneForVideoGeneration): string {
  const linkedObjects = scene.objectLinks.map((link) => {
    const description = link.object.descriptionEn?.trim();
    return `- ${link.object.name} (${link.object.type.toLowerCase()}): ${description || "preserve as described in the scene"}`;
  });
  const referenceContext = linkedObjects.length > 0
    ? `\nRecurring subjects and environments:\n${linkedObjects.join("\n")}`
    : "";

  return `Create the initial reference frame for a live-action cinematic video.

The image must look like an authentic photograph captured by a real camera, not AI artwork: physically plausible faces and hands, natural skin and material texture, realistic lighting falloff, subtle sensor grain, believable depth, and small real-world imperfections. Preserve the exact visible action, location, subjects, products, time of day, and composition requested below. Do not add captions, logos, watermarks, UI, borders, split screens, fantasy elements, illustration, painting, CGI, 3D-rendered surfaces, or plastic-looking skin.

Scene title: ${scene.title}
Scene direction: ${scene.promptEnOverride ?? scene.promptEn}
Camera: ${scene.shotType.toLowerCase()} shot. ${scene.cameraDirection}
Lighting: ${scene.lightingNote}
Mood: ${scene.mood}${referenceContext}`;
}

async function readLimitedBody(response: Response, limit: number): Promise<Buffer> {
  if (!response.body) throw new Error("Image API returned an empty response");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Image API response is too large");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function findImagePayload(value: unknown): ImagePayload | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.b64_json === "string") return { b64_json: record.b64_json };
  if (typeof record.url === "string" && /^(https?:|\/)/.test(record.url)) {
    return { url: record.url };
  }
  if (typeof record.base64 === "string") return { b64_json: record.base64 };

  const preferredKeys = ["data", "result", "output", "image", "images"];
  for (const key of preferredKeys) {
    const nested = record[key];
    const values = Array.isArray(nested) ? [...nested].reverse() : [nested];
    for (const item of values) {
      const payload = findImagePayload(item);
      if (payload) return payload;
    }
  }
  return null;
}

function parseImageResponse(body: string, contentType: string): ImagePayload | null {
  if (contentType.includes("text/event-stream") || body.trimStart().startsWith("data:")) {
    const events = body
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]");
    for (const event of events.reverse()) {
      try {
        const payload = findImagePayload(JSON.parse(event));
        if (payload) return payload;
      } catch {
        // Ignore non-JSON progress events.
      }
    }
    return null;
  }
  return findImagePayload(JSON.parse(body));
}

async function payloadToBuffer(payload: ImagePayload, baseURL: string): Promise<Buffer | null> {
  if (payload.b64_json) {
    const buffer = Buffer.from(payload.b64_json, "base64");
    return buffer.length > 0 && buffer.length <= MAX_IMAGE_BYTES ? buffer : null;
  }
  if (!payload.url) return null;

  const url = new URL(payload.url, `${baseURL}/`);
  if (!["http:", "https:"].includes(url.protocol)) return null;
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) return null;
  const buffer = await readLimitedBody(response, MAX_IMAGE_BYTES);
  return buffer.length > 0 ? buffer : null;
}

async function saveGeneratedImage(
  scene: SceneForVideoGeneration,
  buffer: Buffer,
  model: string,
  prompt: string
): Promise<GeneratedReferenceImage> {
  const directory = sceneCompositeImagesDir(scene.episode.filmId, scene.episodeId, scene.id);
  ensureDir(directory);
  const timestamp = Date.now();
  const outputPath = path.join(directory, `initial_ai_${timestamp}.jpg`);
  const metadataPath = path.join(directory, `initial_ai_${timestamp}.source.json`);
  const normalized = await sharp(buffer)
    .rotate()
    .resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
  const relativePath = storageRelative(outputPath);

  fs.writeFileSync(outputPath, normalized);
  fs.writeFileSync(metadataPath, JSON.stringify({
    generated: true,
    provider: "AI image generations API",
    model,
    prompt,
    createdAt: new Date().toISOString(),
  }, null, 2));
  await prisma.scene.update({
    where: { id: scene.id },
    data: { compositeImagePath: relativePath },
  });
  return { path: relativePath, model };
}

export async function generateAIReferenceImage(
  scene: SceneForVideoGeneration
): Promise<GeneratedReferenceImage | null> {
  const baseURL = process.env.AI_BASE_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!baseURL || !apiKey) return null;

  const model = process.env.AI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const prompt = buildPhotorealisticPrompt(scene);
  try {
    const response = await fetch(`${baseURL}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: "auto",
        quality: "auto",
        background: "auto",
        image_detail: "high",
        output_format: "png",
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) {
      const detail = (await readLimitedBody(response, 64 * 1024)).toString("utf8").slice(0, 500);
      console.error(`[auto-reference-image] API ${response.status}: ${detail}`);
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = (await readLimitedBody(response, MAX_RESPONSE_BYTES)).toString("utf8");
    const payload = parseImageResponse(body, contentType);
    const buffer = payload && await payloadToBuffer(payload, baseURL);
    if (!buffer) {
      console.error("[auto-reference-image] API response did not contain a usable image");
      return null;
    }
    return saveGeneratedImage(scene, buffer, model, prompt);
  } catch (error) {
    console.error(
      "[auto-reference-image] Generation failed:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}
