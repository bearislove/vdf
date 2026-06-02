"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  comfyuiUrl: string;
  comfyuiTimeout: number;
  aiProvider: "openai" | "ollama";
  aiBaseUrl: string;
  aiModel: string;
  defaultImageModel: string;
  defaultVideoModel: string;
  defaultLoraDistilled: string;
  setComfyuiUrl: (url: string) => void;
  setComfyuiTimeout: (t: number) => void;
  setAiProvider: (p: "openai" | "ollama") => void;
  setAiBaseUrl: (url: string) => void;
  setAiModel: (m: string) => void;
  setDefaultImageModel: (m: string) => void;
  setDefaultVideoModel: (m: string) => void;
  setDefaultLoraDistilled: (m: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      comfyuiUrl: "http://localhost:8188",
      comfyuiTimeout: 300,
      aiProvider: "openai",
      aiBaseUrl: "https://api.openai.com/v1",
      aiModel: "gpt-4o",
      defaultImageModel: "",
      defaultVideoModel: "",
      defaultLoraDistilled: "",
      setComfyuiUrl: (comfyuiUrl) => set({ comfyuiUrl }),
      setComfyuiTimeout: (comfyuiTimeout) => set({ comfyuiTimeout }),
      setAiProvider: (aiProvider) => set({ aiProvider }),
      setAiBaseUrl: (aiBaseUrl) => set({ aiBaseUrl }),
      setAiModel: (aiModel) => set({ aiModel }),
      setDefaultImageModel: (defaultImageModel) => set({ defaultImageModel }),
      setDefaultVideoModel: (defaultVideoModel) => set({ defaultVideoModel }),
      setDefaultLoraDistilled: (defaultLoraDistilled) => set({ defaultLoraDistilled }),
    }),
    { name: "storyforge_settings" }
  )
);
