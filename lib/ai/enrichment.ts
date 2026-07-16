import { z } from "zod";
import { getLLMProvider, resolveTextProviderName } from "@/lib/providers/registry";
import type { TextProviderName } from "@/lib/providers/types";
import {
  SYSTEM_SCREENWRITER,
  SYSTEM_PRODUCTION,
  promptTranslateExpand,
  promptParseScenes,
  promptExtractObjects,
} from "./prompts";

const ShotTypeEnum = z.enum(["wide", "medium", "close", "aerial", "pov"]);

export const SceneSchema = z.object({
  scenes: z.array(
    z.object({
      id: z.string(),
      order: z.number().int().positive(),
      title: z.string(),
      prompt_en: z.string().min(10),
      negative_prompt: z.string().min(3),
      camera_direction: z.string(),
      shot_type: ShotTypeEnum,
      mood: z.string(),
      lighting_note: z.string(),
      transitions_to: z.array(z.string()),
    })
  ),
});

export const ObjectsSchema = z.object({
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

export const EnrichmentSchema = z.object({
  storyEnriched: z.string().min(1),
  scenes: SceneSchema.shape.scenes.min(1),
  objects: ObjectsSchema.shape.objects,
  links: ObjectsSchema.shape.links,
});

export type EnrichmentResult = z.infer<typeof EnrichmentSchema>;

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

function callAI(provider: TextProviderName, system: string, user: string): Promise<string> {
  return getLLMProvider(provider).chatComplete(system, user, { temperature: 0.7 });
}

interface EnrichmentOptions {
  revisionRequest?: string;
  provider?: unknown;
}

export async function runEnrichment(
  storyRaw: string,
  existingObjects: Array<{ name: string; type: string; description_en: string }> = [],
  options: EnrichmentOptions = {}
): Promise<EnrichmentResult> {
  const provider = resolveTextProviderName(options.provider);
  // Call 1: Translate + expand
  const storyEnriched = await callAI(
    provider,
    SYSTEM_SCREENWRITER,
    promptTranslateExpand(storyRaw, options.revisionRequest)
  );

  // Call 2: Parse scenes
  const { scenes } = await callWithRetry(
    () => callAI(provider, SYSTEM_PRODUCTION, promptParseScenes(storyEnriched)),
    SceneSchema
  );

  // Call 3: Extract objects + links — pass existing objects so AI reuses exact names
  const { objects, links } = await callWithRetry(
    () =>
      callAI(
        provider,
        SYSTEM_PRODUCTION,
        promptExtractObjects(storyEnriched, JSON.stringify({ scenes }), existingObjects)
      ),
    ObjectsSchema
  );

  return { storyEnriched, scenes, objects, links };
}
