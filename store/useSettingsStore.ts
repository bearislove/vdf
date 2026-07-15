"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GenerationProviderName } from "@/lib/providers/types";

export type { GenerationProviderName };

interface SettingsState {
  comfyuiUrl: string;
  comfyuiTimeout: number;
  aiProvider: "openai" | "ollama";
  aiBaseUrl: string;
  aiModel: string;
  defaultImageModel: string;
  defaultVideoModel: string;
  defaultLoraDistilled: string;
  // AD-16: provider-agnostic generation — defaults used to pre-fill the per-Scene/Object picker
  imageProvider: GenerationProviderName;
  videoProvider: GenerationProviderName;
  agnesImageModel: string;
  agnesVideoModel: string;
  setComfyuiUrl: (url: string) => void;
  setComfyuiTimeout: (t: number) => void;
  setAiProvider: (p: "openai" | "ollama") => void;
  setAiBaseUrl: (url: string) => void;
  setAiModel: (m: string) => void;
  setDefaultImageModel: (m: string) => void;
  setDefaultVideoModel: (m: string) => void;
  setDefaultLoraDistilled: (m: string) => void;
  setImageProvider: (p: GenerationProviderName) => void;
  setVideoProvider: (p: GenerationProviderName) => void;
  setAgnesImageModel: (m: string) => void;
  setAgnesVideoModel: (m: string) => void;
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
      imageProvider: "agnes",
      videoProvider: "agnes",
      agnesImageModel: "agnes-image-2.1-flash",
      agnesVideoModel: "agnes-video-v2.0",
      setComfyuiUrl: (comfyuiUrl) => set({ comfyuiUrl }),
      setComfyuiTimeout: (comfyuiTimeout) => set({ comfyuiTimeout }),
      setAiProvider: (aiProvider) => set({ aiProvider }),
      setAiBaseUrl: (aiBaseUrl) => set({ aiBaseUrl }),
      setAiModel: (aiModel) => set({ aiModel }),
      setDefaultImageModel: (defaultImageModel) => set({ defaultImageModel }),
      setDefaultVideoModel: (defaultVideoModel) => set({ defaultVideoModel }),
      setDefaultLoraDistilled: (defaultLoraDistilled) => set({ defaultLoraDistilled }),
      setImageProvider: (imageProvider) => set({ imageProvider }),
      setVideoProvider: (videoProvider) => set({ videoProvider }),
      setAgnesImageModel: (agnesImageModel) => set({ agnesImageModel }),
      setAgnesVideoModel: (agnesVideoModel) => set({ agnesVideoModel }),
    }),
    {
      name: "vdf_settings",
      version: 1,
      // v1: agnes trở thành provider mặc định — ghi đè giá trị comfyui đã persist từ trước
      migrate: (state, version) => {
        const s = state as SettingsState;
        if (version < 1) {
          s.imageProvider = "agnes";
          s.videoProvider = "agnes";
        }
        return s;
      },
    }
  )
);
