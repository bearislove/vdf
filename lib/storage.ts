import path from "path";
import fs from "fs";

export const STORAGE_ROOT = path.resolve(
  process.env.STORAGE_PATH ?? "./storage"
);

export function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true });
  }
}

export function filmDir(filmId: string) {
  return path.join(STORAGE_ROOT, "films", filmId);
}

export function episodeDir(filmId: string, episodeId: string) {
  return path.join(filmDir(filmId), "episodes", episodeId);
}

export function objectDir(filmId: string, objectId: string) {
  return path.join(filmDir(filmId), "objects", objectId);
}

export function objectRefImagesDir(filmId: string, objectId: string) {
  return path.join(objectDir(filmId, objectId), "ref_images");
}

export function sceneDir(filmId: string, episodeId: string, sceneId: string) {
  return path.join(episodeDir(filmId, episodeId), "scenes", sceneId);
}

export function sceneCompositeImagesDir(filmId: string, episodeId: string, sceneId: string) {
  return path.join(sceneDir(filmId, episodeId, sceneId), "composite_images");
}

const SCENE_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/** Ảnh mới nhất trong thư mục Initial reference image của scene (đường dẫn tuyệt đối), hoặc null nếu trống */
export function newestSceneCompositeImage(filmId: string, episodeId: string, sceneId: string): string | null {
  const dir = sceneCompositeImagesDir(filmId, episodeId, sceneId);
  if (!fs.existsSync(dir)) return null;
  const newest = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && SCENE_IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => {
      const absPath = path.join(dir, entry.name);
      return { absPath, mtimeMs: fs.statSync(absPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  return newest?.absPath ?? null;
}

export function variantDir(filmId: string, episodeId: string, sceneId: string, variantId: string) {
  return path.join(sceneDir(filmId, episodeId, sceneId), "variants", variantId);
}

export function exportsDir() {
  return path.join(STORAGE_ROOT, "exports");
}

export function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function storageRelative(absPath: string): string {
  return path.relative(STORAGE_ROOT, absPath);
}

export function storageUrl(relPath: string): string {
  return `/api/files/${relPath.replace(/\\/g, "/")}`;
}

export function resolveStoragePath(relPath: string): string {
  const resolved = path.resolve(STORAGE_ROOT, relPath);
  if (!isPathInsideDirectory(resolved, STORAGE_ROOT, true)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

export function isPathInsideDirectory(
  filePath: string,
  directory: string,
  allowDirectory = false
): boolean {
  const relative = path.relative(directory, filePath);
  if (!relative) return allowDirectory;
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function resolveStoragePathInside(
  relativePath: unknown,
  directory: string
): string | null {
  if (typeof relativePath !== "string" || !relativePath) return null;
  try {
    const absolutePath = resolveStoragePath(relativePath);
    return isPathInsideDirectory(absolutePath, directory) ? absolutePath : null;
  } catch {
    return null;
  }
}
