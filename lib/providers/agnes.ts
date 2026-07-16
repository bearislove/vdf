import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import sharp from "sharp";
import { storageRelative } from "@/lib/storage";
import { toErrorMessage } from "@/lib/utils/errors";

const AGNES_BASE_URL = (process.env.AGNES_AI_BASE_URL ?? "https://apihub.agnes-ai.com/v1").replace(/\/+$/, "");
const AGNES_TEXT_MODEL = process.env.AGNES_AI_TEXT_MODEL ?? "agnes-2.0-flash";
const AGNES_IMAGE_MODEL = process.env.AGNES_AI_IMAGE_MODEL ?? "agnes-image-2.1-flash";
const AGNES_VIDEO_MODEL = process.env.AGNES_AI_VIDEO_MODEL ?? "agnes-video-v2.0";
const AGNES_PUBLIC_MEDIA_BASE_URL = (process.env.AGNES_PUBLIC_MEDIA_BASE_URL ?? "").replace(/\/+$/, "");

interface AgnesCredential {
  id: string;
  apiKey: string;
}

function parseAgnesApiKeys(): string[] {
  const configured = process.env.AGNES_AI_API_KEYS?.trim();
  let pooledKeys: string[] = [];
  if (configured) {
    if (configured.startsWith("[")) {
      try {
        const parsed = JSON.parse(configured) as unknown;
        if (Array.isArray(parsed)) {
          pooledKeys = parsed.filter((key): key is string => typeof key === "string");
        }
      } catch {
        throw new Error("AGNES_AI_API_KEYS phải là JSON array hợp lệ hoặc danh sách phân tách bằng dấu phẩy/xuống dòng");
      }
    } else {
      pooledKeys = configured.split(/[\n,]+/);
    }
  }
  const fallbackKey = process.env.AGNES_AI_API_KEY ?? "";
  return Array.from(new Set([
    ...pooledKeys.map((key) => key.trim()),
    fallbackKey.trim(),
  ].filter(Boolean)));
}

const AGNES_CREDENTIALS: AgnesCredential[] = parseAgnesApiKeys().map((apiKey) => ({
  id: createHash("sha256").update(apiKey).digest("hex").slice(0, 16),
  apiKey,
}));
type AgnesCredentialLane = "text" | "image" | "video";
const agnesCredentialCursors: Record<AgnesCredentialLane, number> = {
  text: 0,
  image: 0,
  video: 0,
};

function requireAgnesCredentials(): AgnesCredential[] {
  if (AGNES_CREDENTIALS.length === 0) {
    throw new Error("AGNES_AI_API_KEY hoặc AGNES_AI_API_KEYS chưa được cấu hình trong .env");
  }
  return AGNES_CREDENTIALS;
}

function nextAgnesCredential(lane: AgnesCredentialLane): AgnesCredential {
  const credentials = requireAgnesCredentials();
  const cursor = agnesCredentialCursors[lane];
  const credential = credentials[cursor % credentials.length];
  agnesCredentialCursors[lane] = (cursor + 1) % credentials.length;
  return credential;
}

function resolveAgnesCredential(credentialId?: string): AgnesCredential {
  const credentials = requireAgnesCredentials();
  if (!credentialId) return credentials[0];
  const credential = credentials.find((candidate) => candidate.id === credentialId);
  if (!credential) {
    throw new Error(`Không tìm thấy Agnes credential ${credentialId}; token có thể đã bị xóa khỏi AGNES_AI_API_KEYS`);
  }
  return credential;
}

export function getAgnesPrimaryApiKey(): string {
  return AGNES_CREDENTIALS[0]?.apiKey ?? "";
}

/** Agnes chấp nhận ảnh tham chiếu cạnh dài tối đa ~1536px; ảnh lớn hơn làm phồng payload và có thể bị từ chối */
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
    // .rotate() không tham số = auto-rotate theo EXIF (re-encode sẽ strip EXIF nên bắt buộc phải xoay trước)
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
    return "dịch vụ upload trả về trang lỗi";
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
    throw new Error(`không lấy được URL ảnh trực tiếp (HTTP ${redirect.status})`);
  }
  const parsedUrl = new URL(directUrl);
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "storage.filebin.net") {
    throw new Error("dịch vụ upload trả về URL không hợp lệ");
  }
  return directUrl;
}

/** GET thử URL vừa upload: một số host trả về trang HTML thay vì file ảnh, Agnes fetch về sẽ lỗi */
async function assertUrlServesImage(url: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  void res.body?.cancel().catch(() => {});
  if (!res.ok || !contentType.startsWith("image/")) {
    throw new Error(`URL không trả về ảnh (HTTP ${res.status}, content-type: ${contentType || "không rõ"})`);
  }
}

/**
 * Video API của Agnes chỉ nhận URL http(s) công khai — KHÔNG nhận base64/data-URI như API ảnh.
 * Ảnh local được resize ≤1536px. Production ưu tiên URL public của chính ứng dụng;
 * localhost dùng hosting tạm để Agnes fetch ảnh. Ảnh upload tạm có thể truy cập công khai qua URL đó.
 */
export async function uploadReferenceImageToCloud(absPath: string): Promise<string> {
  const ownPublicUrl = publicStorageUrl(absPath);
  if (ownPublicUrl) {
    try {
      await assertUrlServesImage(ownPublicUrl);
      return ownPublicUrl;
    } catch {
      // Domain có thể chưa public route storage; tiếp tục qua các host tạm.
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
      errors.push(`${name}: ${message === "fetch failed" ? "không thể kết nối" : message}`);
    }
  }
  throw new Error(
    `Không thể chuẩn bị ảnh tham chiếu cho Agnes AI. ${errors.join("; ")}. `
    + "Khi deploy, hãy cấu hình AGNES_PUBLIC_MEDIA_BASE_URL bằng domain public của ứng dụng."
  );
}

function authHeaders(credential: AgnesCredential): Record<string, string> {
  return { Authorization: `Bearer ${credential.apiKey}`, "Content-Type": "application/json" };
}

/** Convert visual content references into a video prompt without treating them as video keyframes. */
export async function agnesGroundVideoPrompt(
  scenePrompt: string,
  referenceImagePaths: string[]
): Promise<string> {
  if (referenceImagePaths.length === 0) return scenePrompt;
  const credential = nextAgnesCredential("text");
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(`${AGNES_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: authHeaders(credential),
        body: requestBody,
        signal: AbortSignal.timeout(120000),
      });
      if (response.ok) break;
      responseDetail = await response.text().catch(() => "");
      if (![500, 502, 503, 504].includes(response.status)) break;
    } catch (error) {
      responseDetail = toErrorMessage(error);
      if (attempt === 2) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  if (!response?.ok) {
    const status = response?.status ? `HTTP ${response.status}` : "network error";
    const upstreamDetail = /cannot connect to host|connection reset/i.test(responseDetail)
      ? "Agnes upstream không thể tải ảnh"
      : compactUploadResponse(responseDetail) || "không có chi tiết";
    throw new Error(`Agnes AI phân tích ảnh tham chiếu thất bại sau 3 lần thử (${status}): ${upstreamDetail}`);
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
  const credential = nextAgnesCredential("image");
  const extraBody: Record<string, unknown> = { response_format: "b64_json" };
  if (params.referenceImagePaths?.length) {
    extraBody.image = await Promise.all(params.referenceImagePaths.map((p) => fileToDataUri(p)));
  }
  const res = await fetch(`${AGNES_BASE_URL}/images/generations`, {
    method: "POST",
    headers: authHeaders(credential),
    body: JSON.stringify({
      model: params.model || AGNES_IMAGE_MODEL,
      prompt: params.prompt,
      size: `${params.width ?? 512}x${params.height ?? 512}`,
      extra_body: extraBody,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    throw new Error(`Agnes AI /images/generations failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = await res.json();
  const item = data?.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) return agnesDownload(item.url);
  throw new Error("Agnes AI response không có ảnh output");
}

export type AgnesVideoImageRole = "first_frame" | "last_frame" | "reference";

export interface AgnesVideoImageRef {
  /** Absolute local file path (sẽ được upload lấy URL public) hoặc URL http(s) sẵn có */
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
   * Ảnh video, tối đa 3. Mapping theo contract:
   * 1 ảnh → body.image (image-to-video); 2-3 ảnh → extra_body.image,
   * và nếu có role first_frame/last_frame → extra_body.mode = "keyframes".
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
  const credential = nextAgnesCredential("video");
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

  // Upload các ảnh độc lập nhau — chạy song song để không cộng dồn độ trễ (mỗi ảnh gồm resize + POST + verify)
  const refs = (params.images ?? [])
    .slice(0, MAX_VIDEO_REFERENCE_IMAGES)
    .flatMap((ref) => {
      const raw = ref.pathOrUrl?.trim();
      return raw ? [{ raw, role: ref.role ?? "" }] : [];
    });
  const roles = refs.map(({ role }) => role);
  const hasKeyframeRole = roles.some((role) => role === "first_frame" || role === "last_frame");
  if (refs.length > 1 && !hasKeyframeRole) {
    throw new Error("Agnes AI chỉ nhận nhiều ảnh khi tạo video ở chế độ keyframes");
  }
  const urls = await Promise.all(refs.map(({ raw }) =>
    /^https?:\/\//i.test(raw) ? Promise.resolve(raw) : uploadReferenceImageToCloud(raw)
  ));
  if (urls.length === 1) {
    body.image = urls[0];
  } else if (urls.length > 1) {
    body.extra_body = { image: urls, mode: "keyframes" };
  }

  const res = await fetch(`${AGNES_BASE_URL}/videos`, {
    method: "POST",
    headers: authHeaders(credential),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`Agnes AI /videos failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = await res.json();
  const taskId = data.task_id ?? data.id ?? data.video_id;
  if (!taskId) throw new Error("Agnes AI không trả về task_id");
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
  const credential = resolveAgnesCredential(job.credentialId);
  // Prefer the video_id-based endpoint per docs (cần kèm model_name); fall back to the legacy task_id path.
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
  // Agnes có thể trả error dạng object {code, message} — ép về string để lưu DB không bị Prisma từ chối
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
  // Backoff 5s → ×1.35 → tối đa 12s, theo hành vi tham chiếu của upstream
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
  return { status: "failed", progress: 0, error: "Timeout khi chờ Agnes AI xử lý video" };
}

export async function agnesTestConnection(): Promise<{ ok: boolean; error?: string }> {
  const credential = AGNES_CREDENTIALS[0];
  if (!credential) return { ok: false, error: "AGNES_AI_API_KEY hoặc AGNES_AI_API_KEYS chưa được cấu hình trong .env" };
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
