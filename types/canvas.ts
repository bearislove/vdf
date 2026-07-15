import type { Scene } from "./scene";
import type { StoryObject } from "./object";
import type { VideoVariant } from "./video";

export type SceneWithMedia = Omit<Scene, "objectLinks"> & {
  objectLinks?: Array<{ id: string; role: string; object: StoryObject }>;
  videoVariants?: VideoVariant[];
  selectedVideo?: VideoVariant | null;
};
