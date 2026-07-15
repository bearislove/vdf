export const SYSTEM_SCREENWRITER = `You are a professional screenwriter and film director.`;

export const SYSTEM_PRODUCTION = `You are a film production assistant. Return ONLY valid JSON, no markdown fences, no explanation.`;

export function promptTranslateExpand(storyRaw: string, revisionRequest?: string): string {
  const revisionBlock = revisionRequest?.trim()
    ? `\nRevision request from the creator:\n${revisionRequest.trim()}\nApply this request while preserving any story elements it does not ask to change.\n`
    : "";

  return `Translate the following story to English and expand it with cinematic details, character emotions, lighting, atmosphere. Keep the core plot intact unless the revision request explicitly asks for a plot change. Output ONLY the expanded English story text.
${revisionBlock}

Story:
${storyRaw}`;
}

export function promptParseScenes(storyEnriched: string): string {
  return `Break this story into scenes for video generation. Return ONLY valid JSON, no markdown, no explanation.

Schema:
{
  "scenes": [{
    "id": "scene_1",
    "order": 1,
    "title": "short title",
    "prompt_en": "detailed English prompt optimized for video generation",
    "camera_direction": "slow tracking left",
    "shot_type": "medium",
    "mood": "tense",
    "lighting_note": "golden hour",
    "transitions_to": ["scene_2"]
  }]
}

shot_type values: wide | medium | close | aerial | pov

Story:
${storyEnriched}`;
}

export function promptExtractObjects(
  storyEnriched: string,
  scenesJson: string,
  existingObjects: Array<{ name: string; type: string; description_en: string }> = []
): string {
  const existingBlock =
    existingObjects.length > 0
      ? `
IMPORTANT — The following objects already exist in this film. If a character or environment from the story matches any of these, you MUST reuse the EXACT same name (case-sensitive). Only create a new object if it genuinely does not appear in this list.

Existing objects:
${existingObjects.map((o) => `- [${o.type}] "${o.name}": ${o.description_en || "(no description)"}`).join("\n")}
`
      : "";

  return `Extract characters (people) and environments from the story and link them to scenes. Return ONLY valid JSON.

RULES:
- Only extract type "character" (human or humanoid beings) and type "environment" (locations, settings, backgrounds).
- Do NOT extract props, objects, items, weapons, vehicles, or any non-living things.
- Focus on what will be visible as a consistent element across multiple scenes.
${existingBlock}
Schema:
{
  "objects": [{
    "id": "obj_1",
    "type": "character",
    "name": "...",
    "description_en": "detailed English physical description for image generation"
  }],
  "links": [{
    "scene_id": "scene_1",
    "object_ids": ["obj_1", "obj_2"],
    "roles": {"obj_1": "main", "obj_2": "present"}
  }]
}

type values: character | environment
role values: main | present | mentioned

Scenes JSON:
${scenesJson}

Story:
${storyEnriched}`;
}
