"use client";

import { useEffect } from "react";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  imagePath?: string | null;
  videoPath?: string | null;
  alt?: string;
  onClose: () => void;
  zIndex?: number;
}

export function MediaPreviewModal({
  imagePath,
  videoPath,
  alt = "",
  onClose,
  zIndex = 500,
}: Props) {
  const { t } = useTranslation();
  const webpPath = videoPath?.toLowerCase().endsWith(".webp") ? videoPath : null;
  const resolvedImagePath = webpPath ?? imagePath;
  const resolvedVideoPath = webpPath ? null : videoPath;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="media-preview-backdrop"
      style={{ zIndex }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("common.view")}
    >
      <div className="media-preview-content" onClick={(event) => event.stopPropagation()}>
        <button className="icon-btn" onClick={onClose} title={t("common.closeEsc")}>
          <IconX size={17} />
        </button>
        {resolvedVideoPath ? (
          <video src={`/api/files/${resolvedVideoPath}`} controls autoPlay loop />
        ) : resolvedImagePath ? (
          <img src={`/api/files/${resolvedImagePath}`} alt={alt} />
        ) : null}
      </div>
    </div>
  );
}
