"use client";

import { useEffect, useState } from "react";
import type { GenerationProviderName } from "@/lib/providers/types";

interface Props {
  modality: "image" | "video";
  value: GenerationProviderName;
  onChange: (value: GenerationProviderName) => void;
  requiresReferenceImages?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function GenerationProviderSelect({
  modality,
  value,
  onChange,
  requiresReferenceImages = false,
  disabled,
  ariaLabel,
  className,
  style,
}: Props) {
  const [options, setOptions] = useState<Array<{ name: GenerationProviderName; label: string }>>([
    { name: "agnes", label: "Agnes AI" },
    { name: "comfyui", label: "ComfyUI" },
  ]);

  useEffect(() => {
    fetch("/api/config")
      .then((response) => response.json())
      .then((config) => {
        const providers = config?.providers?.[modality];
        if (!Array.isArray(providers)) return;
        const nextOptions = providers.flatMap((provider: unknown) => {
          if (!provider || typeof provider !== "object") return [];
          const candidate = provider as {
            name?: unknown;
            label?: unknown;
            capabilities?: { referenceImages?: unknown };
          };
          if (candidate.name !== "agnes" && candidate.name !== "comfyui") return [];
          if (requiresReferenceImages && candidate.capabilities?.referenceImages !== true) return [];
          const name: GenerationProviderName = candidate.name;
          return [{
            name,
            label: typeof candidate.label === "string" ? candidate.label : name,
          }];
        });
        if (nextOptions.length > 0) setOptions(nextOptions);
      })
      .catch(() => {});
  }, [modality, requiresReferenceImages]);

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as GenerationProviderName)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
      style={style}
    >
      {options.map((option) => (
        <option key={option.name} value={option.name}>{option.label}</option>
      ))}
    </select>
  );
}
