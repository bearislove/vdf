export type EpisodeStatus = "DRAFT" | "ENRICHING" | "READY" | "GENERATING" | "DONE";

export interface Episode {
  id: string;
  filmId: string;
  order: number;
  title: string;
  storyRaw: string;
  storyEnriched: string;
  canvasState: Record<string, unknown>;
  imageModel: string;
  videoModel: string;
  status: EpisodeStatus;
  targetDurationSeconds: number | null;
  sceneCountHint: number | null;
  createdAt: string;
  updatedAt: string;
  scenes?: import("./scene").Scene[];
  _count?: { scenes: number };
}
