"use client";

import { create } from "zustand";
import type { Scene } from "@/types/scene";
import type { StoryObject } from "@/types/object";

interface CanvasState {
  selectedSceneId: string | null;
  selectedObjectId: string | null;
  objectImageGenerations: Record<string, { progress: string }>;
  selectScene: (id: string | null) => void;
  selectObject: (id: string | null) => void;
  startObjectImageGeneration: (objectId: string, progress: string) => void;
  updateObjectImageGeneration: (objectId: string, progress: string) => void;
  finishObjectImageGeneration: (objectId: string) => void;
}

export const useCanvasStore = create<CanvasState>()((set) => ({
  selectedSceneId: null,
  selectedObjectId: null,
  objectImageGenerations: {},
  selectScene: (selectedSceneId) => set({ selectedSceneId, selectedObjectId: null }),
  selectObject: (selectedObjectId) => set({ selectedObjectId, selectedSceneId: null }),
  startObjectImageGeneration: (objectId, progress) => set((state) => ({
    objectImageGenerations: {
      ...state.objectImageGenerations,
      [objectId]: { progress },
    },
  })),
  updateObjectImageGeneration: (objectId, progress) => set((state) => ({
    objectImageGenerations: {
      ...state.objectImageGenerations,
      [objectId]: { progress },
    },
  })),
  finishObjectImageGeneration: (objectId) => set((state) => {
    const { [objectId]: _finished, ...objectImageGenerations } = state.objectImageGenerations;
    return { objectImageGenerations };
  }),
}));

export type { Scene, StoryObject };
