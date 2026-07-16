import crypto from "crypto";
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { resolveStoragePath } from "@/lib/storage";

interface VariantWithReferenceImages {
  id: string;
  referenceImagePaths: string[];
}

function fileFingerprint(filePath: string, cache: Map<string, string>): string {
  const cached = cache.get(filePath);
  if (cached) return cached;
  try {
    const stat = fs.statSync(filePath);
    const fingerprint = `${stat.size}:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
    cache.set(filePath, fingerprint);
    return fingerprint;
  } catch {
    return `path:${filePath}`;
  }
}

function dedupeByContent(
  paths: readonly string[],
  resolvePath: (path: string) => string,
  fingerprintCache = new Map<string, string>()
): string[] {
  const seenPaths = new Set<string>();
  const seenContent = new Set<string>();
  const unique: string[] = [];

  for (const imagePath of paths) {
    if (!imagePath || seenPaths.has(imagePath)) continue;
    seenPaths.add(imagePath);
    let resolvedPath: string;
    try {
      resolvedPath = resolvePath(imagePath);
    } catch {
      continue;
    }
    const fingerprint = fileFingerprint(resolvedPath, fingerprintCache);
    if (seenContent.has(fingerprint)) continue;
    seenContent.add(fingerprint);
    unique.push(imagePath);
  }
  return unique;
}

export function dedupeAbsoluteImagePaths(paths: readonly string[]): string[] {
  return dedupeByContent(paths, (imagePath) => imagePath);
}

export function dedupeStorageImagePaths(
  paths: readonly string[],
  fingerprintCache?: Map<string, string>
): string[] {
  return dedupeByContent(paths, resolveStoragePath, fingerprintCache);
}

export async function normalizeStoredVariantReferenceImages(
  variants: VariantWithReferenceImages[]
): Promise<void> {
  const fingerprintCache = new Map<string, string>();
  const updates = new Map<string, string[]>();

  for (const variant of variants) {
    const uniquePaths = dedupeStorageImagePaths(variant.referenceImagePaths, fingerprintCache);
    if (uniquePaths.length === variant.referenceImagePaths.length) continue;
    variant.referenceImagePaths = uniquePaths;
    updates.set(variant.id, uniquePaths);
  }

  await Promise.all(Array.from(updates, ([id, referenceImagePaths]) =>
    prisma.videoVariant.update({
      where: { id },
      data: { referenceImagePaths },
    })
  ));
}
