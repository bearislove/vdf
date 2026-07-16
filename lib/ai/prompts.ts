export const SYSTEM_SCREENWRITER = `You are a professional screenwriter and film director.`;

export const SYSTEM_PRODUCTION = `You are a film production assistant. Return ONLY valid JSON, no markdown fences, no explanation.`;

export const SYSTEM_COMMERCIAL_SCENE_DIRECTOR = `You are a senior commercial film director and AI-video prompt writer. Enhance scene descriptions with precise, shootable visual direction while preserving the original story beat, subjects, products, and continuity. Return only one polished English paragraph with no heading, markdown, notes, or quotation marks.`;

export function promptEnhanceCommercialScene(input: {
  description: string;
  title: string;
  shotType: string;
  mood: string;
  cameraDirection: string;
  lightingNote: string;
  objects: Array<{ name: string; type: string; role: string; description: string }>;
}): string {
  const objectContext = input.objects.length > 0
    ? input.objects
        .map((object) => `- ${object.name} [${object.type}, ${object.role}]: ${object.description || "no additional description"}`)
        .join("\n")
    : "- No linked character or environment references.";

  return `Rewrite the scene description as a vivid 90-150 word prompt for a premium commercial video shoot.

Requirements:
- Preserve the exact action, intent, people, products, and location from the source. Do not invent a new plot, dialogue, logos, on-screen text, or unsupported props.
- Add coherent advertising-film direction: shot size and lens character, camera angle and motivated movement, foreground/midground/background composition, subject blocking, lighting quality and direction, color palette, atmosphere, material detail, depth, pacing, and the intended final impression.
- Use concrete visible language suitable for text-to-video generation. Avoid vague praise, keyword lists, and conflicting camera instructions.
- Keep linked subjects visually consistent with their descriptions.
- Return only the enhanced English scene paragraph.

Scene metadata:
- Title: ${input.title || "Untitled scene"}
- Shot type: ${input.shotType || "unspecified"}
- Mood: ${input.mood || "unspecified"}
- Existing camera direction: ${input.cameraDirection || "unspecified"}
- Existing lighting note: ${input.lightingNote || "unspecified"}

Linked references:
${objectContext}

Source description:
${input.description}`;
}

export const SYSTEM_SCENE_SIMPLIFIER = `You are an AI-video prompt editor. You rewrite overly complex scene descriptions into short, plain, concrete sentences that text-to-video models follow reliably. Return only one plain English paragraph with no heading, markdown, notes, or quotation marks.`;

export function promptSimplifySceneDescription(description: string): string {
  return `Rewrite the scene description below so it is much simpler and easier for a text-to-video model to follow.

Requirements:
- Keep the same subjects, action, setting, and story beat. Do not add new elements, props, or plot.
- Use short, direct sentences. Describe only what is concretely visible.
- Remove flowery adjectives, abstract mood words, redundant style keywords, and stacked or conflicting camera and lighting instructions. Keep at most one simple camera note and one simple lighting note if the source has them.
- Target 40-80 words.
- Return only the simplified English paragraph.

Source description:
${description}`;
}

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
    "negative_prompt": "concise English negative prompt tailored to likely visual and motion artifacts in this scene",
    "camera_direction": "slow tracking left",
    "shot_type": "medium",
    "mood": "tense",
    "lighting_note": "golden hour",
    "transitions_to": ["scene_2"]
  }]
}

shot_type values: wide | medium | close | aerial | pov

For every scene, write a specific negative_prompt as a concise comma-separated English list. Exclude likely generation failures such as anatomy errors, identity drift, unwanted subjects or text, continuity errors, camera artifacts, and motion defects. Do not negate anything required by prompt_en.

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
