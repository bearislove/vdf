import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import {
  getAgnesCredential,
  getAgnesCredentialCount,
  getAgnesPrimaryCredential,
  getNextAgnesCredential,
} from "@/lib/providers/agnes-credentials";
import type { AgnesCredential } from "@/lib/providers/agnes-credentials";
import { storageRelative } from "@/lib/storage";
import { toErrorMessage } from "@/lib/utils/errors";

const AGNES_BASE_URL = (process.env.AGNES_AI_BASE_URL ?? "https://apihub.agnes-ai.com/v1").replace(/\/+$/, "");
const AGNES_TEXT_MODEL = process.env.AGNES_AI_TEXT_MODEL ?? "agnes-2.0-flash";
const AGNES_IMAGE_MODEL = process.env.AGNES_AI_IMAGE_MODEL ?? "agnes-image-2.1-flash";
const AGNES_VIDEO_MODEL = process.env.AGNES_AI_VIDEO_MODEL ?? "agnes-video-v2.0";
const AGNES_PUBLIC_MEDIA_BASE_URL = (process.env.AGNES_PUBLIC_MEDIA_BASE_URL ?? "").replace(/\/+$/, "");

/** Agnes accepts reference images up to roughly 1536 px on the longest edge. */
const REFERENCE_MAX_EDGE = 1536;
const VISION_MAX_EDGE = 1024;

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

async function referenceImageBuffer(absPath: string): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  const ext = path.extname(absPath).toLowerCase();
  try {
    // An argument-less rotate applies EXIF orientation before re-encoding strips the metadata.
    const image = sharp(absPath)
      .rotate()
      .resize({
        width: REFERENCE_MAX_EDGE,
        height: REFERENCE_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      });
    if (ext === ".png") {
      return { buffer: await image.png().toBuffer(), mime: "image/png", ext: ".png" };
    }
    if (ext === ".webp") {
      return { buffer: await image.webp({ quality: 92 }).toBuffer(), mime: "image/webp", ext: ".webp" };
    }
    return { buffer: await image.jpeg({ quality: 92 }).toBuffer(), mime: "image/jpeg", ext: ".jpg" };
  } catch {
    return { buffer: fs.readFileSync(absPath), mime: MIME_BY_EXT[ext] ?? "image/jpeg", ext: ext || ".jpg" };
  }
}

async function fileToDataUri(absPath: string): Promise<string> {
  const { buffer, mime } = await referenceImageBuffer(absPath);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function fileToVisionDataUri(absPath: string): Promise<string> {
  try {
    const buffer = await sharp(absPath)
      .rotate()
      .resize({
        width: VISION_MAX_EDGE,
        height: VISION_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return fileToDataUri(absPath);
  }
}

function compactUploadResponse(text: string): string {
  if (/<!doctype|<html|<style|:root\s*\{/i.test(text)) {
    return "the upload service returned an error page";
  }
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function publicStorageUrl(absPath: string): string | null {
  if (!AGNES_PUBLIC_MEDIA_BASE_URL) return null;
  try {
    const baseUrl = new URL(AGNES_PUBLIC_MEDIA_BASE_URL);
    if (!["http:", "https:"].includes(baseUrl.protocol)) return null;
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(baseUrl.hostname)) return null;
    const encodedPath = storageRelative(absPath)
      .split(path.sep)
      .map(encodeURIComponent)
      .join("/");
    return `${baseUrl.origin}${baseUrl.pathname.replace(/\/$/, "")}/api/files/${encodedPath}`;
  } catch {
    return null;
  }
}

async function retryUpload(upload: () => Promise<string>): Promise<string> {
  let firstError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await upload();
    } catch (error) {
      firstError ??= error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  throw firstError;
}

async function uploadToLitterbox(buffer: Buffer, filename: string, mime: string): Promise<string> {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("time", "24h");
  form.append("fileToUpload", new Blob([new Uint8Array(buffer)], { type: mime }), filename);
  const res = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const text = (await res.text().catch(() => "")).trim();
  if (!res.ok || !/^https?:\/\//i.test(text)) {
    throw new Error(`HTTP ${res.status}${compactUploadResponse(text) ? `: ${compactUploadResponse(text)}` : ""}`);
  }
  return text;
}

async function uploadToUguu(buffer: Buffer, filename: string, mime: string): Promise<string> {
  const form = new FormData();
  form.append("files[]", new Blob([new Uint8Array(buffer)], { type: mime }), filename);
  const res = await fetch("https://uguu.se/upload.php", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => null);
  const url = data?.files?.[0]?.url;
  if (!res.ok || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    const detail = typeof data?.description === "string"
      ? data.description
      : JSON.stringify(data ?? "").slice(0, 160);
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return url;
}

async function uploadToFilebin(buffer: Buffer, filename: string, mime: string): Promise<string> {
  const binId = `story-forge-${randomUUID()}`;
  const fileUrl = `https://filebin.net/${encodeURIComponent(binId)}/${encodeURIComponent(filename)}`;
  const res = await fetch(fileUrl, {
    method: "POST",
    headers: { "Content-Type": mime, Accept: "application/json" },
    body: new Uint8Array(buffer),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${compactUploadResponse(await res.text().catch(() => ""))}`);
  }

  // Filebin's public URL redirects to a short-lived S3 URL. Agnes does not reliably follow
  // hosting-page redirects, so resolve it here and submit the direct image URL.
  const redirect = await fetch(fileUrl, {
    redirect: "manual",
    headers: { Accept: "image/*", "User-Agent": "curl/8.0" },
    signal: AbortSignal.timeout(30000),
  });
  const directUrl = redirect.headers.get("location");
  if (redirect.status < 300 || redirect.status >= 400 || !directUrl) {
    throw new Error(`Could not resolve a direct image URL (HTTP ${redirect.status})`);
  }
  const parsedUrl = new URL(directUrl);
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "storage.filebin.net") {
    throw new Error("The upload service returned an invalid URL");
  }
  return directUrl;
}

/** Verifies that an uploaded URL serves an image rather than an HTML hosting page. */
async function assertUrlServesImage(url: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  void res.body?.cancel().catch(() => {});
  if (!res.ok || !contentType.startsWith("image/")) {
    throw new Error(`URL did not return an image (HTTP ${res.status}, content-type: ${contentType || "unknown"})`);
  }
}

/**
 * Agnes video accepts public HTTP(S) URLs, not base64/data URIs. Local images
 * are resized to 1536 px and exposed through the app URL or a temporary host.
 */
export async function uploadReferenceImageToCloud(absPath: string): Promise<string> {
  const ownPublicUrl = publicStorageUrl(absPath);
  if (ownPublicUrl) {
    try {
      await assertUrlServesImage(ownPublicUrl);
      return ownPublicUrl;
    } catch {
      // The app storage route may not be public; continue with temporary hosts.
    }
  }

  const { buffer, mime, ext } = await referenceImageBuffer(absPath);
  const filename = `${path.basename(absPath, path.extname(absPath))}${ext}`;
  const errors: string[] = [];
  for (const [name, upload] of [
    ["filebin", uploadToFilebin],
    ["uguu", uploadToUguu],
    ["litterbox", uploadToLitterbox],
  ] as const) {
    try {
      const url = await retryUpload(() => upload(buffer, filename, mime));
      await assertUrlServesImage(url);
      return url;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push(`${name}: ${message === "fetch failed" ? "connection failed" : message}`);
    }
  }
  throw new Error(
    `Could not prepare the reference image for Agnes AI. ${errors.join("; ")}. `
    + "In production, configure AGNES_PUBLIC_MEDIA_BASE_URL with the application's public domain."
  );
}

function authHeaders(credential: AgnesCredential): Record<string, string> {
  return { Authorization: `Bearer ${credential.apiKey}`, "Content-Type": "application/json" };
}

function shouldRetryAgnesStatus(status: number): boolean {
  return [429, 500, 502, 503, 504].includes(status);
}

/** Convert visual content references into a video prompt without treating them as video keyframes. */
export async function agnesGroundVideoPrompt(
  scenePrompt: string,
  referenceImagePaths: string[]
): Promise<string> {
  if (referenceImagePaths.length === 0) return scenePrompt;
  const imageDataUris = await Promise.all(
    referenceImagePaths.slice(0, 4).map((imagePath) => fileToVisionDataUri(imagePath))
  );
  const content = [
    {
      type: "text",
      text: `Write one production-ready English video-generation prompt grounded in the supplied reference images.

The images are visual source material, not chronological keyframes. Preserve their subjects, identities, environment, architecture, objects, materials, colors, and recognizable details. Build the requested action naturally around that visual content. Do not introduce a different location or replace the referenced subjects. Resolve conflicts by treating the images as visual truth while keeping compatible actions and camera direction from the scene request.

Return only the final prompt as one paragraph, with no heading or explanation.

Scene request:
${scenePrompt}`,
    },
    ...imageDataUris.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
  const requestBody = JSON.stringify({
    model: AGNES_TEXT_MODEL,
    messages: [
      { role: "system", content: "You are a visual continuity director for AI video production." },
      { role: "user", content },
    ],
    temperature: 0.2,
    max_tokens: 900,
  });
  let response: Response | undefined;
  let responseDetail = "";
  const maxAttempts = Math.max(3, getAgnesCredentialCount());
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const credential = getNextAgnesCredential("text");
    try {
      response = await fetch(`${AGNES_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: authHeaders(credential),
        body: requestBody,
        signal: AbortSignal.timeout(120000),
      });
      if (response.ok) break;
      responseDetail = await response.text().catch(() => "");
      if (![429, 500, 502, 503, 504].includes(response.status)) break;
    } catch (error) {
      responseDetail = toErrorMessage(error);
      if (attempt === maxAttempts - 1) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  if (!response?.ok) {
    const status = response?.status ? `HTTP ${response.status}` : "network error";
    const upstreamDetail = /cannot connect to host|connection reset/i.test(responseDetail)
      ? "Agnes upstream could not download the image"
      : compactUploadResponse(responseDetail) || "no details";
    throw new Error(`Agnes AI reference analysis failed after ${maxAttempts} attempts (${status}): ${upstreamDetail}`);
  }
  const data = await response.json();
  const groundedPrompt = data?.choices?.[0]?.message?.content;
  if (typeof groundedPrompt !== "string" || !groundedPrompt.trim()) {
    throw new Error("Agnes AI reference analysis returned no prompt");
  }
  return groundedPrompt.trim();
}

export interface AgnesImageParams {
  prompt: string;
  width?: number;
  height?: number;
  model?: string;
  /** Absolute local file paths, sent as Data URI base64 for image-to-image / reference-guided generation */
  referenceImagePaths?: string[];
}

export async function agnesGenerateImage(params: AgnesImageParams): Promise<Buffer> {
  const extraBody: Record<string, unknown> = { response_format: "b64_json" };
  if (params.referenceImagePaths?.length) {
    extraBody.image = await Promise.all(params.referenceImagePaths.map((p) => fileToDataUri(p)));
  }
  const requestBody = JSON.stringify({
    model: params.model || AGNES_IMAGE_MODEL,
    prompt: params.prompt,
    size: `${params.width ?? 512}x${params.height ?? 512}`,
    extra_body: extraBody,
  });
  let res: Response | undefined;
  let responseText = "";
  const maxAttempts = Math.max(1, getAgnesCredentialCount());
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const credential = getNextAgnesCredential("image");
    res = await fetch(`${AGNES_BASE_URL}/images/generations`, {
      method: "POST",
      headers: authHeaders(credential),
      body: requestBody,
      signal: AbortSignal.timeout(120000),
    });
    if (res.ok) break;
    responseText = await res.text().catch(() => "");
    if (!shouldRetryAgnesStatus(res.status)) break;
  }
  if (!res?.ok) {
    throw new Error(`Agnes AI /images/generations failed: ${res?.status ?? "network"} ${responseText}`);
  }
  const data = await res.json();
  const item = data?.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) return agnesDownload(item.url);
  throw new Error("Agnes AI returned no output image");
}

export type AgnesVideoImageRole = "first_frame" | "last_frame" | "reference";

export interface AgnesVideoImageRef {
  /** Absolute local path to upload, or an existing HTTP(S) URL. */
  pathOrUrl: string;
  role?: AgnesVideoImageRole;
}

export interface AgnesVideoParams {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  numFrames?: number;
  frameRate?: number;
  seed?: number;
  /**
   * Up to three video images. One image maps to body.image; two or three map
   * to extra_body.image, with keyframe mode for first/last-frame roles.
   */
  images?: AgnesVideoImageRef[];
}

export interface AgnesVideoJob {
  taskId: string;
  videoId?: string;
  model?: string;
  credentialId?: string;
}

const MAX_VIDEO_REFERENCE_IMAGES = 3;

export async function agnesSubmitVideo(params: AgnesVideoParams): Promise<AgnesVideoJob> {
  const body: Record<string, unknown> = {
    model: AGNES_VIDEO_MODEL,
    prompt: params.prompt,
    width: params.width ?? 1152,
    height: params.height ?? 768,
    num_frames: params.numFrames ?? 121,
    frame_rate: params.frameRate ?? 24,
  };
  if (params.negativePrompt) body.negative_prompt = params.negativePrompt;
  if (params.seed !== undefined && params.seed >= 0) body.seed = params.seed;

  // Upload independent images concurrently to avoid accumulating upload latency.
  const refs = (params.images ?? [])
    .slice(0, MAX_VIDEO_REFERENCE_IMAGES)
    .flatMap((ref) => {
      const raw = ref.pathOrUrl?.trim();
      return raw ? [{ raw, role: ref.role ?? "" }] : [];
    });
  const roles = refs.map(({ role }) => role);
  const hasKeyframeRole = roles.some((role) => role === "first_frame" || role === "last_frame");
  if (refs.length > 1 && !hasKeyframeRole) {
    throw new Error("Agnes AI accepts multiple video images only in keyframe mode");
  }
  const urls = await Promise.all(refs.map(({ raw }) =>
    /^https?:\/\//i.test(raw) ? Promise.resolve(raw) : uploadReferenceImageToCloud(raw)
  ));
  if (urls.length === 1) {
    body.image = urls[0];
  } else if (urls.length > 1) {
    body.extra_body = { image: urls, mode: "keyframes" };
  }

  const requestBody = JSON.stringify(body);
  let res: Response | undefined;
  let responseText = "";
  let credential: AgnesCredential | undefined;
  const maxAttempts = Math.max(1, getAgnesCredentialCount());
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    credential = getNextAgnesCredential("video");
    res = await fetch(`${AGNES_BASE_URL}/videos`, {
      method: "POST",
      headers: authHeaders(credential),
      body: requestBody,
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) break;
    responseText = await res.text().catch(() => "");
    if (!shouldRetryAgnesStatus(res.status)) break;
  }
  if (!res?.ok || !credential) {
    throw new Error(`Agnes AI /videos failed: ${res?.status ?? "network"} ${responseText}`);
  }
  const data = await res.json();
  const taskId = data.task_id ?? data.id ?? data.video_id;
  if (!taskId) throw new Error("Agnes AI returned no task_id");
  return {
    taskId,
    videoId: data.video_id,
    model: String(body.model),
    credentialId: credential.id,
  };
}

export interface AgnesVideoStatus {
  status: "queued" | "in_progress" | "completed" | "failed";
  progress: number;
  url?: string;
  error?: string;
}

export async function agnesGetVideoStatus(job: AgnesVideoJob): Promise<AgnesVideoStatus> {
  const credential = getAgnesCredential(job.credentialId);
  // Prefer the documented video_id endpoint with model_name, then fall back to task_id.
  const url = job.videoId
    ? `${AGNES_BASE_URL.replace(/\/v1$/, "")}/agnesapi?${new URLSearchParams({
        video_id: job.videoId,
        model_name: job.model ?? AGNES_VIDEO_MODEL,
      })}`
    : `${AGNES_BASE_URL}/videos/${encodeURIComponent(job.taskId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${credential.apiKey}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Agnes AI status check failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = await res.json();
  // Agnes may return {code, message}; normalize it before persisting through Prisma.
  const rawError = data.error ?? data.message;
  return {
    status: data.status,
    progress: data.progress ?? 0,
    url: data.url,
    error: rawError == null ? undefined : toErrorMessage(rawError),
  };
}

export async function agnesDownload(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`Agnes AI download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function agnesPollVideo(
  job: AgnesVideoJob,
  onProgress?: (s: AgnesVideoStatus) => void,
  opts: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<AgnesVideoStatus> {
  // Back off from 5 seconds by 1.35x, capped at 12 seconds.
  let interval = opts.intervalMs ?? 5000;
  const timeout = opts.timeoutMs ?? 20 * 60 * 1000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const status = await agnesGetVideoStatus(job);
    onProgress?.(status);
    if (status.status === "completed" || status.status === "failed") return status;
    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(interval * 1.35, 12000);
  }
  return { status: "failed", progress: 0, error: "Timed out waiting for Agnes AI video generation" };
}

export async function agnesTestConnection(): Promise<{ ok: boolean; error?: string }> {
  const credential = getAgnesPrimaryCredential();
  if (!credential) return { ok: false, error: "AGNES_AI_API_KEY or AGNES_AI_API_KEYS is not configured in .env" };
  try {
    const res = await fetch(`${AGNES_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: authHeaders(credential),
      body: JSON.stringify({ model: "agnes-2.0-flash", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `${res.status} ${await res.text().catch(() => "")}`.slice(0, 300) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
