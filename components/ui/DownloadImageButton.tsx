"use client";

import { useState, type CSSProperties, type MouseEvent } from "react";
import { IconDownload, IconLoader2 } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { useTranslation } from "@/hooks/useTranslation";
import { downloadStorageFile } from "@/lib/utils/download-storage-file";

interface Props {
  imagePath: string;
  className?: string;
  style?: CSSProperties;
  size?: number;
  disabled?: boolean;
}

export function DownloadImageButton({
  imagePath,
  className = "media-action-button",
  style,
  size = 13,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (downloading || disabled) return;
    setDownloading(true);
    try {
      await downloadStorageFile(imagePath);
    } catch (error) {
      addToast("error", `${t("common.downloadFailed")}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={handleDownload}
      disabled={disabled || downloading}
      title={t("common.download")}
      aria-label={t("common.download")}
      aria-busy={downloading}
    >
      {downloading
        ? <IconLoader2 size={size} className="loading-spinner" aria-hidden="true" />
        : <IconDownload size={size} aria-hidden="true" />}
    </button>
  );
}
