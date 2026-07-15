import { apiFetch, apiPost } from "@/lib/utils/api";

export interface SceneReferenceImage {
  path: string;
  createdAt: string;
  selected: boolean;
}

interface SceneReferenceImagesResponse {
  images: SceneReferenceImage[];
  selectedPath: string | null;
}

function endpoint(sceneId: string): string {
  return `/api/scenes/${sceneId}/reference-images`;
}

export function listSceneReferenceImages(sceneId: string): Promise<SceneReferenceImagesResponse> {
  return apiFetch<SceneReferenceImagesResponse>(endpoint(sceneId));
}

export function selectSceneReferenceImage(sceneId: string, path: string): Promise<{ selectedPath: string }> {
  return apiPost(endpoint(sceneId), { path });
}

export function deleteSceneReferenceImage(sceneId: string, path: string): Promise<{ ok: boolean }> {
  return apiFetch(endpoint(sceneId), {
    method: "DELETE",
    body: JSON.stringify({ path }),
  });
}

export async function uploadSceneReferenceImage(sceneId: string, image: File): Promise<{ path: string }> {
  const formData = new FormData();
  formData.append("image", image);
  const response = await fetch(endpoint(sceneId), { method: "POST", body: formData });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.path !== "string") {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  return { path: payload.path };
}
