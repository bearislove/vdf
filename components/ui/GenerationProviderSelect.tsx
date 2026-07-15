import type { GenerationProviderName } from "@/lib/providers/types";

interface Props {
  value: GenerationProviderName;
  onChange: (value: GenerationProviderName) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function GenerationProviderSelect({
  value,
  onChange,
  disabled,
  ariaLabel,
  className,
  style,
}: Props) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as GenerationProviderName)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
      style={style}
    >
      <option value="comfyui">ComfyUI</option>
      <option value="agnes">Agnes AI</option>
    </select>
  );
}
