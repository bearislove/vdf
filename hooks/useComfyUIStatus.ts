"use client";

import { useEffect, useState } from "react";
import type { ComfyUIStatus } from "@/types/comfyui";

export function useComfyUIStatus(intervalMs = 30000) {
  const [status, setStatus] = useState<ComfyUIStatus>({ connected: false });

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/comfyui/status");
        const data = await res.json();
        setStatus(data);
      } catch {
        setStatus({ connected: false });
      }
    };

    check();
    const timer = setInterval(check, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return status;
}
