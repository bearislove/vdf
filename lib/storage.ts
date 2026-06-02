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
  if (!resolved.startsWith(STORAGE_ROOT)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}
