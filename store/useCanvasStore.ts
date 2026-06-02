"use client";

import { create } from "zustand";
import type { Scene } from "@/types/scene";
import type { StoryObject } from "@/types/object";

interface CanvasState {
  selectedSceneId: string | null;
  selectedObjectId: string | null;
  draggingObjectId: string | null;
  selectScene: (id: string | null) => void;
  selectObject: (id: string | null) => void;
  setDraggingObject: (id: string | null) => void;
}

export const useCanvasStore = create<CanvasState>()((set) => ({
  selectedSceneId: null,
  selectedObjectId: null,
  draggingObjectId: null,
  selectScene: (selectedSceneId) => set({ selectedSceneId, selectedObjectId: null }),
  selectObject: (selectedObjectId) => set({ selectedObjectId, selectedSceneId: null }),
  setDraggingObject: (draggingObjectId) => set({ draggingObjectId }),
}));

export type { Scene, StoryObject };
