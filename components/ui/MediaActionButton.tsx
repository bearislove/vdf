import type { MouseEvent, ReactNode } from "react";

interface Props {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
}

export function MediaActionButton({
  label,
  children,
  onClick,
  disabled,
  tone = "default",
}: Props) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClick();
  };

  return (
    <button
      type="button"
      className={`media-action-button is-${tone}`}
      onClick={handleClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}
