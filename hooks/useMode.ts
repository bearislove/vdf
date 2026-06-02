"use client";

import { useAppStore, type UIMode } from "@/store/useAppStore";

export function useMode() {
  const { uiMode, setUiMode } = useAppStore();
  return { mode: uiMode, setMode: setUiMode, isSimple: uiMode === "simple", isPro: uiMode === "pro" };
}
