import { z } from "zod";
import { getAIClient, getAIModel } from "./provider";
import {
  SYSTEM_SCREENWRITER,
  SYSTEM_PRODUCTION,
  promptTranslateExpand,
  promptParseScenes,
  promptExtractObjects,
} from "./prompts";

const ShotTypeEnum = z.enum(["wide", "medium", "close", "aerial", "pov"]);

const SceneSchema = z.object({
  scenes: z.array(
    z.object({
      id: z.string(),
      order: z.number().int().positive(),
      title: z.string(),
      prompt_en: z.string().min(10),
      camera_direction: z.string(),
      shot_type: ShotTypeEnum,
      mood: z.string(),
      lighting_note: z.string(),
      transitions_to: z.array(z.string()),
    })
  ),
});

const ObjectsSchema = z.object({
  objects: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["character", "prop", "environment"]),
      name: z.string(),
      description_en: z.string(),
    })
  ),
  links: z.array(
    z.object({
      scene_id: z.string(),
      object_ids: z.array(z.string()),
      roles: z.record(z.string(), z.enum(["main", "present", "mentioned"])).optional(),
    })
  ),
});

export type ParsedScenes = z.infer<typeof SceneSchema>;
export type ParsedObjects = z.infer<typeof ObjectsSchema>;

async function callWithRetry<T>(
  fn: () => Promise<string>,
  schema: z.ZodSchema<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const raw = await fn();
      const cleaned = raw
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      lastError = result.error;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`AI validation failed after ${maxRetries} retries: ${lastError}`);
}

async function callAI(system: string, user: string): Promise<string> {
  const client = getAIClient();
  const res = await client.chat.completions.create({
    model: getAIModel(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.7,
  });
  return res.choices[0]?.message?.content ?? "";
}

export async function runEnrichment(
  storyRaw: string,
  existingObjects: Array<{ name: string; type: string; description_en: string }> = []
): Promise<{
  storyEnriched: string;
  scenes: ParsedScenes["scenes"];
  objects: ParsedObjects["objects"];
  links: ParsedObjects["links"];
}> {
  // Call 1: Translate + expand
  const storyEnriched = await callAI(
    SYSTEM_SCREENWRITER,
    promptTranslateExpand(storyRaw)
  );

  // Call 2: Parse scenes
  const { scenes } = await callWithRetry(
    () => callAI(SYSTEM_PRODUCTION, promptParseScenes(storyEnriched)),
    SceneSchema
  );

  // Call 3: Extract objects + links — pass existing objects so AI reuses exact names
  const { objects, links } = await callWithRetry(
    () =>
      callAI(
        SYSTEM_PRODUCTION,
        promptExtractObjects(storyEnriched, JSON.stringify({ scenes }), existingObjects)
      ),
    ObjectsSchema
  );

  return { storyEnriched, scenes, objects, links };
}
