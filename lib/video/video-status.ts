import type { Scene } from "@/types/scene";
import type { VideoStatus } from "@/types/video";

export const ACTIVE_VIDEO_STATUSES: ReadonlySet<VideoStatus> = new Set<VideoStatus>([
  "QUEUED",
  "GENERATING_IMAGE",
  "GENERATING_VIDEO",
]);

export const TERMINAL_VIDEO_STATUSES: ReadonlySet<VideoStatus> = new Set<VideoStatus>([
  "DONE",
  "FAILED",
]);

type SceneVideoState = Pick<Scene, "selectedVideo" | "videoVariants">;

export function isVideoActive(status: VideoStatus): boolean {
  return ACTIVE_VIDEO_STATUSES.has(status);
}

export function isVideoTerminal(status: VideoStatus): boolean {
  return TERMINAL_VIDEO_STATUSES.has(status);
}

export function sceneHasDoneVideo(scene: SceneVideoState): boolean {
  return scene.selectedVideo?.status === "DONE"
    || scene.videoVariants?.some((variant) => variant.status === "DONE") === true;
}

export function sceneHasActiveVideo(scene: SceneVideoState): boolean {
  return scene.videoVariants?.some((variant) => isVideoActive(variant.status)) === true;
}
