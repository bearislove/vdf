import { resolveStoragePath } from "@/lib/storage";
import type { Scene } from "@/types/scene";
import type { StoryObject } from "@/types/object";
import type { VideoVariant } from "@/types/video";

type ObjectLinks = Array<{ role: string; strengthHint?: number; object: StoryObject }> | undefined;

/** Build enriched prompt by appending linked object descriptions if not already present */
export function buildPrompt(basePrompt: string | null | undefined, objectLinks: ObjectLinks): string {
  const base = (basePrompt ?? "").trim();
  const descs = (objectLinks ?? [])
    .map((l) => l.object?.descriptionEn?.trim())
    .filter((d): d is string => !!d && !base.includes(d));
  return descs.length > 0 ? `${base}. ${descs.join(", ")}` : base;
}

/**
 * Resolve which local image (absolute path) should drive image-to-video generation:
 * the previous scene's last frame when chaining is on, otherwise the main character's ref image.
 */
export function resolveFirstFrameImage(
  scene: Pick<Scene, "useLastFrameChaining" | "compositeImagePath"> & { objectLinks?: ObjectLinks },
  previousVariant?: Pick<VideoVariant, "lastFramePath"> | null
): string | undefined {
  if (scene.compositeImagePath) {
    return resolveStoragePath(scene.compositeImagePath);
  }
  if (scene.useLastFrameChaining && previousVariant?.lastFramePath) {
    return resolveStoragePath(previousVariant.lastFramePath);
  }
  const mainChar = (scene.objectLinks ?? []).find((l) => l.object?.type === "CHARACTER")?.object;
  const mainImg = mainChar?.refImages?.find((i) => i.isMain) ?? mainChar?.refImages?.[0];
  return mainImg?.path ? resolveStoragePath(mainImg.path) : undefined;
}

const MAX_REFERENCE_IMAGES = 4;

/**
 * Resolve absolute paths of each linked object's main ref image, for use as
 * multi-image references when generating a scene's composite image.
 */
export function resolveReferenceImagePaths(objectLinks: ObjectLinks): string[] {
  const paths: string[] = [];
  for (const link of objectLinks ?? []) {
    const img = link.object?.refImages?.find((i) => i.isMain) ?? link.object?.refImages?.[0];
    if (!img?.path) continue;
    const abs = resolveStoragePath(img.path);
    if (!paths.includes(abs)) paths.push(abs);
  }
  return paths.slice(0, MAX_REFERENCE_IMAGES);
}
