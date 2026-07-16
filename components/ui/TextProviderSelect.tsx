"use client";

import { useEffect, useState } from "react";
import type { TextProviderName } from "@/lib/providers/types";

interface Props {
  value: TextProviderName;
  onChange: (value: TextProviderName) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function TextProviderSelect({ value, onChange, disabled, ariaLabel }: Props) {
  const [options, setOptions] = useState<Array<{ name: TextProviderName; label: string }>>([
    { name: "openai", label: "OpenAI compatible" },
    { name: "ollama", label: "Ollama" },
    { name: "agnes", label: "Agnes AI" },
  ]);

  useEffect(() => {
    fetch("/api/config")
      .then((response) => response.json())
      .then((config) => {
        if (config.defaultTextProvider === "openai" || config.defaultTextProvider === "ollama" || config.defaultTextProvider === "agnes") {
          onChange(config.defaultTextProvider);
        }
        if (!Array.isArray(config?.providers?.text)) return;
        const nextOptions = config.providers.text.flatMap((provider: unknown) => {
          if (!provider || typeof provider !== "object") return [];
          const candidate = provider as { name?: unknown; label?: unknown };
          if (candidate.name !== "openai" && candidate.name !== "ollama" && candidate.name !== "agnes") return [];
          const name: TextProviderName = candidate.name;
          return [{ name, label: typeof candidate.label === "string" ? candidate.label : name }];
        });
        if (nextOptions.length > 0) setOptions(nextOptions);
      })
      .catch(() => {});
  }, [onChange]);

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as TextProviderName)}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <option key={option.name} value={option.name}>{option.label}</option>
      ))}
    </select>
  );
}

