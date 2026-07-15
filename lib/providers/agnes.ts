import fs from "fs";
import path from "path";
import sharp from "sharp";

const AGNES_BASE_URL = (process.env.AGNES_AI_BASE_URL ?? "https://apihub.agnes-ai.com/v1").replace(/\/+$/, "");
const AGNES_API_KEY = process.env.AGNES_AI_API_KEY ?? "";
const AGNES_IMAGE_MODEL = process.env.AGNES_AI_IMAGE_MODEL ?? "agnes-image-2.1-flash";
const AGNES_VIDEO_MODEL = process.env.AGNES_AI_VIDEO_MODEL ?? "agnes-video-v2.0";

/** Agnes chấp nhận ảnh tham chiếu cạnh dài tối đa ~1536px; ảnh lớn hơn làm phồng payload và có thể bị từ chối */
const REFERENCE_MAX_EDGE = 1536;

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
    throw new Error(`litterbox: ${res.status} ${text.slice(0, 200)}`);
  }
  return text;
}

async function uploadToUguu(buffer: Buffer, filename: string, mime: string): Promise<string> {
  const form = new FormData();
  form.append("files[]", new Blob([new Uint8Array(buffer)], { type: mime }), filename);
  const res = await fetch("https://uguu.se/upload", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => null);
  const url = data?.files?.[0]?.url;
  if (!res.ok || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    throw new Error(`uguu: ${res.status} ${JSON.stringify(data ?? "").slice(0, 200)}`);
  }
  return url;
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
 * Ảnh local được resize ≤1536px rồi upload lên hosting tạm (litterbox 24h, fallback uguu ~3h)
 * để lấy URL public cho Agnes fetch về. Lưu ý: ảnh sẽ tạm thời truy cập được công khai qua link đó.
 */
export async function uploadReferenceImageToCloud(absPath: string): Promise<string> {
  const { buffer, mime, ext } = await referenceImageBuffer(absPath);
  const filename = `${path.basename(absPath, path.extname(absPath))}${ext}`;
  const errors: string[] = [];
  for (const [name, upload] of [
    ["litterbox", uploadToLitterbox],
    ["uguu", uploadToUguu],
  ] as const) {
    try {
      const url = await upload(buffer, filename, mime);
      await assertUrlServesImage(url);
      return url;
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`Upload ảnh tham chiếu lên cloud thất bại — ${errors.join("; ")}`);
}

function authHeaders(): Record<string, string> {
  if (!AGNES_API_KEY) throw new Error("AGNES_AI_API_KEY chưa được cấu hình trong .env");
  return { Authorization: `Bearer ${AGNES_API_KEY}`, "Content-Type": "application/json" };
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
  const res = await fetch(`${AGNES_BASE_URL}/images/generations`, {
    method: "POST",
    headers: authHeaders(),
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
   * Ảnh tham chiếu, tối đa 4 (Agnes cắt phần thừa). Mapping theo contract:
   * 1 ảnh → body.image (image-to-video); ≥2 ảnh → extra_body.image,
   * và nếu có role first_frame/last_frame → extra_body.mode = "keyframes".
   */
  images?: AgnesVideoImageRef[];
}

export interface AgnesVideoJob {
  taskId: string;
  videoId?: string;
  model?: string;
}

const MAX_VIDEO_REFERENCE_IMAGES = 4;

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

  const urls: string[] = [];
  const roles: string[] = [];
  for (const ref of (params.images ?? []).slice(0, MAX_VIDEO_REFERENCE_IMAGES)) {
    const raw = ref.pathOrUrl?.trim();
    if (!raw) continue;
    const url = /^https?:\/\//i.test(raw) ? raw : await uploadReferenceImageToCloud(raw);
    urls.push(url);
    roles.push(ref.role ?? "");
  }
  if (urls.length === 1) {
    body.image = urls[0];
  } else if (urls.length > 1) {
    const extraBody: Record<string, unknown> = { image: urls };
    if (roles.some((role) => role === "first_frame" || role === "last_frame")) {
      extraBody.mode = "keyframes";
    }
    body.extra_body = extraBody;
  }

  const res = await fetch(`${AGNES_BASE_URL}/videos`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`Agnes AI /videos failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = await res.json();
  const taskId = data.task_id ?? data.id ?? data.video_id;
  if (!taskId) throw new Error("Agnes AI không trả về task_id");
  return { taskId, videoId: data.video_id, model: String(body.model) };
}

export interface AgnesVideoStatus {
  status: "queued" | "in_progress" | "completed" | "failed";
  progress: number;
  url?: string;
  error?: string;
}

export async function agnesGetVideoStatus(job: AgnesVideoJob): Promise<AgnesVideoStatus> {
  // Prefer the video_id-based endpoint per docs (cần kèm model_name); fall back to the legacy task_id path.
  const url = job.videoId
    ? `${AGNES_BASE_URL.replace(/\/v1$/, "")}/agnesapi?${new URLSearchParams({
        video_id: job.videoId,
        model_name: job.model ?? AGNES_VIDEO_MODEL,
      })}`
    : `${AGNES_BASE_URL}/videos/${encodeURIComponent(job.taskId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AGNES_API_KEY}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Agnes AI status check failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = await res.json();
  // Agnes có thể trả error dạng object {code, message} — ép về string để lưu DB không bị Prisma từ chối
  const rawError = data.error ?? data.message;
  const error = rawError == null
    ? undefined
    : typeof rawError === "string" ? rawError : JSON.stringify(rawError);
  return { status: data.status, progress: data.progress ?? 0, url: data.url, error };
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
  if (!AGNES_API_KEY) return { ok: false, error: "AGNES_AI_API_KEY chưa được cấu hình trong .env" };
  try {
    const res = await fetch(`${AGNES_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ model: "agnes-2.0-flash", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `${res.status} ${await res.text().catch(() => "")}`.slice(0, 300) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
