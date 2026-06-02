export type ObjectType = "CHARACTER" | "PROP" | "ENVIRONMENT";

export interface RefImage {
  path: string;
  isMain: boolean;
  label: string;
}

export interface StoryObject {
  id: string;
  filmId: string;
  type: ObjectType;
  name: string;
  descriptionEn: string;
  refImages: RefImage[];
  audioRefPath: string | null;
  loraPath: string | null;
  flux2Params: Record<string, unknown>;
  canvasX: number;
  canvasY: number;
  createdAt: string;
  updatedAt: string;
  sceneLinks?: SceneObjectLink[];
}

export interface SceneObjectLink {
  id: string;
  sceneId: string;
  objectId: string;
  role: "main" | "present" | "mentioned";
  strengthHint: number;
  object?: StoryObject;
  scene?: import("./scene").Scene;
}
