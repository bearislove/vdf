import fs from "fs";
import { resolveStoragePath } from "@/lib/storage";
import type { StoryObject } from "@/types/object";

type ObjectLinks = Array<{ role: string; strengthHint?: number; object: StoryObject }> | undefined;

/** Keep scene text independent from linked object identity sheets. */
export function buildPrompt(basePrompt: string | null | undefined): string {
  return (basePrompt ?? "").trim();
}

const MAX_REFERENCE_IMAGES = 4;

/**
 * Resolve absolute, existing paths of each linked object's main (else first) ref image —
 * The single source of truth for object identity images, shared by scene image
 * generation and video-provider reference preparation.
 */
export function resolveObjectReferenceImagePaths(
  objectLinks: ObjectLinks,
  opts: {
    /** Restrict references to these objects. Defaults to all linked objects. */
    objectIds?: ReadonlySet<string>;
    /** Prioritize characters when the provider limits reference image count. */
    characterFirst?: boolean;
    limit?: number;
  } = {}
): string[] {
  let links = (objectLinks ?? []).filter(
    (link) => !opts.objectIds || (link.object && opts.objectIds.has(link.object.id))
  );
  if (opts.characterFirst) {
    links = [...links].sort(
      (a, b) => Number(b.object?.type === "CHARACTER") - Number(a.object?.type === "CHARACTER")
    );
  }
  const paths: string[] = [];
  for (const link of links) {
    const img = link.object?.refImages?.find((i) => i.isMain) ?? link.object?.refImages?.[0];
    if (!img?.path) continue;
    try {
      const abs = resolveStoragePath(img.path);
      if (fs.existsSync(abs) && !paths.includes(abs)) paths.push(abs);
    } catch {
      // Ignore invalid or traversal paths.
    }
  }
  return paths.slice(0, opts.limit ?? MAX_REFERENCE_IMAGES);
}
