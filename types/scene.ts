export type ShotType = "WIDE" | "MEDIUM" | "CLOSE" | "AERIAL" | "POV";
export type GenerationStrategy = "T2V" | "I2V_SINGLE" | "I2V_COMPOSITE" | "IC_LORA";

export interface Scene {
  id: string;
  episodeId: string;
  order: number;
  title: string;
  promptEn: string;
  promptEnOverride: string | null;
  cameraDirection: string;
  shotType: ShotType;
  mood: string;
  lightingNote: string;
  transitionsTo: string[];
  compositeImagePath: string | null;
  selectedVideoId: string | null;
  videoParams: Record<string, unknown>;
  useLastFrameChaining: boolean;
  canvasX: number;
  canvasY: number;
  createdAt: string;
  updatedAt: string;
  objectLinks?: import("./object").SceneObjectLink[];
  videoVariants?: import("./video").VideoVariant[];
  selectedVideo?: import("./video").VideoVariant | null;
}
