import { apiFetch } from "@/lib/utils/api";

export interface SceneReferenceImage {
  path: string;
  createdAt: string;
  kind: "generated" | "initial" | "upload" | "object";
  selected: boolean;
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
