"use client";

import { useId, type ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  title: string;
  icon?: ReactNode;
  headerMeta?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  width?: string;
  maxHeight?: string;
  zIndex?: number;
  bodyClassName?: string;
  className?: string;
}

export function ModalDialog({
  title,
  icon,
  headerMeta,
  children,
  footer,
  onClose,
  busy = false,
  width = "min(520px, 96vw)",
  maxHeight = "92vh",
  zIndex = 400,
  bodyClassName,
  className,
}: Props) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <div
      className="modal-dialog-backdrop"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section className={`modal-dialog-frame ${className ?? ""}`} style={{ width, maxHeight }}>
        <header className="modal-dialog-header">
          {icon && <span className="modal-dialog-icon">{icon}</span>}
          <h2 id={titleId}>{title}</h2>
          {headerMeta && <div className="modal-dialog-meta">{headerMeta}</div>}
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            disabled={busy}
            title={t("common.close")}
            aria-label={t("common.close")}
          >
            <IconX size={15} />
          </button>
        </header>
        <div className={`modal-dialog-body ${bodyClassName ?? ""}`}>{children}</div>
        {footer && <footer className="modal-dialog-footer">{footer}</footer>}
      </section>
    </div>
  );
}
