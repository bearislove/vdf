"use client";

import { useState } from "react";
import { IconEye, IconStar, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "@/hooks/useTranslation";
import { MediaActionButton } from "./MediaActionButton";

export interface PhotoItem {
  path: string;
  isMain: boolean;
  label?: string;
}

interface PhotoGridProps {
  photos: PhotoItem[];
  onSetMain: (path: string) => void;
  onDelete: (path: string) => void;
  onPreview?: (path: string) => void;
  cols?: number;
  gap?: number;
}

export function PhotoGrid({
  photos,
  onSetMain,
  onDelete,
  onPreview,
  cols = 3,
  gap = 4,
}: PhotoGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap,
      }}
    >
      {photos.map((photo) => (
        <PhotoCell
          key={photo.path}
          photo={photo}
          onSetMain={() => onSetMain(photo.path)}
          onDelete={() => onDelete(photo.path)}
          onPreview={onPreview ? () => onPreview(photo.path) : undefined}
        />
      ))}
    </div>
  );
}

function PhotoCell({
  photo,
  onSetMain,
  onDelete,
  onPreview,
}: {
  photo: PhotoItem;
  onSetMain: () => void;
  onDelete: () => void;
  onPreview?: () => void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        aspectRatio: "1",
        borderRadius: 5,
        border: photo.isMain ? "2px solid var(--accent)" : "1.5px solid var(--border)",
        overflow: "hidden",
        cursor: "pointer",
        background: "var(--bg2)",
        position: "relative",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        src={`/api/files/${photo.path}`}
        alt={photo.label ?? ""}
        onClick={onPreview}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      {photo.isMain && (
        <div
          style={{
            position: "absolute", bottom: 2, left: 2,
            fontSize: 7, background: "var(--accent)", color: "#000",
            padding: "1px 4px", borderRadius: 2, pointerEvents: "none",
          }}
        >
          {t("object.mainBadge")}
        </div>
      )}
      {hovered && (
        <div
          style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 4,
          }}
        >
          {!photo.isMain && (
            <MediaActionButton label={t("object.setAsMain")} onClick={onSetMain} tone="primary">
              <IconStar size={14} />
            </MediaActionButton>
          )}
          {onPreview && (
            <MediaActionButton label={t("common.view")} onClick={onPreview}>
              <IconEye size={14} />
            </MediaActionButton>
          )}
          <MediaActionButton label={t("common.delete")} onClick={onDelete} tone="danger">
            <IconTrash size={14} />
          </MediaActionButton>
        </div>
      )}
    </div>
  );
}
