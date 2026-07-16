import crypto from "crypto";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import {
  SCENE_IMAGE_EXTENSIONS,
  ensureDir,
  objectRefImagesDir,
  resolveStoragePathInside,
  sceneCompositeImagesDir,
} from "@/lib/storage";

const MANIFEST_FILE = ".object-reference-clones.json";

interface CloneManifest {
  processedSourcePaths: string[];
  linkedObjectIds: string[];
}

interface CloneLinkedObjectReferencesOptions {
  forceObjectIds?: readonly string[];
}

function readManifest(filePath: string): CloneManifest {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<CloneManifest>;
    return {
      processedSourcePaths: Array.isArray(parsed.processedSourcePaths)
        ? parsed.processedSourcePaths.filter((item): item is string => typeof item === "string")
        : [],
      linkedObjectIds: Array.isArray(parsed.linkedObjectIds)
        ? parsed.linkedObjectIds.filter((item): item is string => typeof item === "string")
        : [],
    };
  } catch {
    return { processedSourcePaths: [], linkedObjectIds: [] };
  }
}

function cloneFilename(objectId: string, sourcePath: string): string {
  const hash = crypto.createHash("sha1").update(sourcePath).digest("hex").slice(0, 12);
  const extension = path.extname(sourcePath).toLowerCase() || ".png";
  return `object_${objectId}_${hash}${extension}`;
}

export async function cloneLinkedObjectReferences(
  sceneId: string,
  options: CloneLinkedObjectReferencesOptions = {}
): Promise<number> {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      episode: true,
      objectLinks: { include: { object: true } },
    },
  });
  if (!scene) return 0;

  const targetDirectory = sceneCompositeImagesDir(scene.episode.filmId, scene.episodeId, scene.id);
  ensureDir(targetDirectory);
  const manifestPath = path.join(targetDirectory, MANIFEST_FILE);
  const manifest = readManifest(manifestPath);
  const processed = new Set(manifest.processedSourcePaths);
  const linkedObjectIds = scene.objectLinks.map((link) => link.objectId);
  const previouslyLinkedObjectIds = new Set(manifest.linkedObjectIds);
  const forcedObjectIds = new Set([
    ...(options.forceObjectIds ?? []),
    ...linkedObjectIds.filter((objectId) => !previouslyLinkedObjectIds.has(objectId)),
  ]);
  let clonedCount = 0;

  for (const link of scene.objectLinks) {
    const sourceDirectory = objectRefImagesDir(scene.episode.filmId, link.objectId);
    const images = (link.object.refImages ?? []) as Array<{ path?: unknown }>;
    for (const image of images) {
      if (typeof image.path !== "string") continue;
      if (processed.has(image.path) && !forcedObjectIds.has(link.objectId)) continue;
      if (!SCENE_IMAGE_EXTENSIONS.has(path.extname(image.path).toLowerCase())) continue;
      const sourcePath = resolveStoragePathInside(image.path, sourceDirectory);
      if (!sourcePath || !fs.existsSync(sourcePath)) continue;

      const destination = path.join(targetDirectory, cloneFilename(link.objectId, image.path));
      if (!fs.existsSync(destination)) {
        fs.copyFileSync(sourcePath, destination);
        clonedCount += 1;
      }
      processed.add(image.path);
    }
  }

  const nextManifest: CloneManifest = {
    processedSourcePaths: Array.from(processed),
    linkedObjectIds,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(nextManifest, null, 2));
  return clonedCount;
}
