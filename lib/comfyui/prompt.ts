import fs from "fs";
import { resolveStoragePath } from "@/lib/storage";
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

function existingStorageImage(relativePath: string | null | undefined): string | undefined {
  if (!relativePath) return undefined;
  try {
    const absolutePath = resolveStoragePath(relativePath);
    return fs.existsSync(absolutePath) ? absolutePath : undefined;
  } catch {
    return undefined;
  }
}

/** The only video start image is the previous scene's final frame. */
export function resolvePreviousSceneFirstFrame(
  previousVariant?: Pick<VideoVariant, "lastFramePath"> | null
): string | undefined {
  return existingStorageImage(previousVariant?.lastFramePath);
}

const MAX_REFERENCE_IMAGES = 4;

/**
 * Resolve absolute, existing paths of each linked object's main (else first) ref image —
 * the single source of truth for "ảnh nhận dạng của object", dùng chung cho cả luồng
 * tạo ảnh scene lẫn ảnh tham chiếu gửi provider video.
 */
export function resolveObjectReferenceImagePaths(
  objectLinks: ObjectLinks,
  opts: {
    /** Chỉ lấy các object này (mặc định: tất cả) */
    objectIds?: ReadonlySet<string>;
    /** Xếp CHARACTER lên trước — dùng khi số ảnh bị giới hạn và nhân vật cần ưu tiên */
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
      // path không hợp lệ (traversal) → bỏ qua ảnh này
    }
  }
  return paths.slice(0, opts.limit ?? MAX_REFERENCE_IMAGES);
}
