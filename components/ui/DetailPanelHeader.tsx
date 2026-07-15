import type { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";

interface Props {
  title: string;
  meta?: ReactNode;
  visual?: ReactNode;
  closeLabel?: string;
  onClose?: () => void;
}

export function DetailPanelHeader({ title, meta, visual, closeLabel = "Close", onClose }: Props) {
  return (
    <header className={`detail-panel-header ${visual ? "has-visual" : ""}`}>
      {visual}
      <div className="detail-panel-heading">
        <strong>{title}</strong>
        {meta && <span>{meta}</span>}
      </div>
      {onClose && (
        <button className="icon-btn" onClick={onClose} title={closeLabel} aria-label={closeLabel}>
          <IconX size={16} />
        </button>
      )}
    </header>
  );
}
