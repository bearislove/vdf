"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UIMode = "simple" | "pro";

interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

interface AppState {
  uiMode: UIMode;
  toasts: Toast[];
  setUiMode: (mode: UIMode) => void;
  addToast: (type: Toast["type"], message: string) => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      uiMode: "simple",
      toasts: [],
      setUiMode: (uiMode) => set({ uiMode }),
      addToast: (type, message) => {
        const id = String(++toastCounter);
        set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
        setTimeout(() => {
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        }, 4000);
      },
      removeToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    { name: "storyforge_ui_mode", partialize: (s) => ({ uiMode: s.uiMode }) }
  )
);
