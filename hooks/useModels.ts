"use client";

import { useEffect, useState } from "react";
import type { ComfyUIModels } from "@/types/comfyui";

export function useModels() {
  const [models, setModels] = useState<ComfyUIModels>({
    checkpoints: [],
    loras: [],
    vae: [],
    controlnet: [],
    diffusion_models: [],
  });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/comfyui/models");
      const data = await res.json();
      setModels(data);
    } catch {
      // ComfyUI offline, keep empty
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return { models, loading, reload: load };
}
