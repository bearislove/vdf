import { apiFetch } from "@/lib/utils/api";

export interface SceneReferenceImage {
  path: string;
  createdAt: string;
  kind: "generated" | "initial" | "upload" | "object";
  selected: boolean;
}

interface LastFrameVariantLike {
  status: string;
  lastFramePath?: string | null;
  completedAt?: string | Date | null;
}

/**
 * Quy tắc duy nhất chọn variant cung cấp last frame của scene trước:
 * ưu tiên selectedVideo nếu có frame, ngược lại variant DONE mới nhất có frame.
 * Dùng chung cho cả client (preview) lẫn server (tạo ảnh/video) để không lệch nhau.
 */
export function pickLastFrameVariant<T extends LastFrameVariantLike>(
  selectedVideo: T | null | undefined,
  videoVariants: readonly T[] | null | undefined
): T | null {
  if (selectedVideo?.lastFramePath) return selectedVideo;
  const candidates = (videoVariants ?? []).filter(
    (variant) => variant.status === "DONE" && variant.lastFramePath
  );
  return [...candidates].sort(
    (a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime()
  )[0] ?? null;
}

interface SceneReferenceImagesResponse {
  images: SceneReferenceImage[];
}

function endpoint(sceneId: string): string {
  return `/api/scenes/${sceneId}/reference-images`;
}

export function listSceneReferenceImages(sceneId: string): Promise<SceneReferenceImagesResponse> {
  return apiFetch<SceneReferenceImagesResponse>(endpoint(sceneId));
}

export function deleteSceneReferenceImage(sceneId: string, path: string): Promise<{ ok: boolean }> {
  return apiFetch(endpoint(sceneId), {
    method: "DELETE",
    body: JSON.stringify({ path }),
  });
}

export function importSceneReferenceImage(sceneId: string, path: string): Promise<{ path: string }> {
  return apiFetch(endpoint(sceneId), {
    method: "PUT",
    body: JSON.stringify({ path }),
  });
}

export async function uploadSceneReferenceImage(
  sceneId: string,
  image: File,
  options: { useAsInitial?: boolean } = {}
): Promise<{ path: string }> {
  const formData = new FormData();
  formData.append("image", image);
  if (options.useAsInitial) formData.append("purpose", "initial");
  const response = await fetch(endpoint(sceneId), { method: "POST", body: formData });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.path !== "string") {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  return { path: payload.path };
}
