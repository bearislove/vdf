"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import type { VideoVariant } from "@/types/video";

interface VariantListProps {
  variants: VideoVariant[];
  selectedVideoId: string | null;
  sceneId: string;
  onSelect: (variantId: string) => void;
  onDelete: (variantId: string) => void;
  onRecover: (variantId: string) => Promise<void>;
}

export function VariantList({ variants, selectedVideoId, onSelect, onDelete, onRecover }: VariantListProps) {
  const { t } = useTranslation();

  if (variants.length === 0) return null;

  return (
    <>
      <label className="form-label">{t("canvas.variants")}</label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 5,
        }}
      >
        {variants.map((v) => (
          <VariantCard
            key={v.id}
            variant={v}
            isSelected={v.id === selectedVideoId}
            onSelect={() => onSelect(v.id)}
            onDelete={() => onDelete(v.id)}
            onRecover={() => onRecover(v.id)}  // returns Promise — VariantCard awaits it
          />
        ))}
      </div>
    </>
  );
}

function VariantCard({
  variant,
  isSelected,
  onSelect,
  onDelete,
  onRecover,
}: {
  variant: VideoVariant;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRecover: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [showPlayer, setShowPlayer] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const seed = (variant.paramsSnapshot as Record<string, unknown>)?.seed ?? "?";
  const isGenerating =
    variant.status === "GENERATING_IMAGE" || variant.status === "GENERATING_VIDEO";
  const isFailed = variant.status === "FAILED";
  const coverImg = variant.lastFramePath || variant.thumbnailPath;
  const hasMedia = !!(variant.videoPath || coverImg);

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          border: isSelected ? "1.5px solid var(--accent)" : "0.5px solid var(--border)",
          borderRadius: 5,
          overflow: "visible",
          cursor: "pointer",
          position: "relative",
        }}
      >
        {/* Thumbnail — square */}
        <div
          onClick={onSelect}
          style={{
            aspectRatio: "1",
            background: isSelected ? "var(--accent-dim)" : "var(--bg2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", overflow: "hidden",
            borderRadius: "4px 4px 0 0",
          }}
        >
          {coverImg ? (
            <img
              src={`/api/files/${coverImg}`}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : isGenerating ? (
            <span style={{ fontSize: 12, color: "var(--accent)", animation: "spin 1s linear infinite" }}>⟳</span>
          ) : isFailed ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--red)" }}>✕</span>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  setRecovering(true);
                  try {
                    await onRecover();
                  } finally {
                    setRecovering(false);
                  }
                }}
                disabled={recovering}
                style={{
                  fontSize: 9, padding: "2px 6px", borderRadius: 3,
                  border: "0.5px solid var(--blue)", background: "var(--blue-dim)",
                  color: "var(--blue)", cursor: recovering ? "not-allowed" : "pointer",
                  opacity: recovering ? 0.6 : 1,
                }}
              >
                {recovering ? "⟳" : "Re-check"}
              </button>
            </div>
          ) : (
            <span style={{ fontSize: 14, color: isSelected ? "var(--accent)" : "var(--text3)" }}>▶</span>
          )}

          {/* Play overlay on hover */}
          {hasMedia && !isGenerating && (
            <div
              onClick={(e) => { e.stopPropagation(); setShowPlayer(true); }}
              style={{
                position: "absolute", inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: 0, transition: "opacity 150ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
            >
              <span style={{ fontSize: 16, color: "#fff" }}>▶</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          onClick={onSelect}
          style={{
            padding: "3px 6px",
            display: "flex", justifyContent: "space-between",
            fontSize: 9,
            borderTop: isSelected ? "0.5px solid var(--accent-dim)" : "0.5px solid var(--border)",
            color: isSelected ? "var(--accent)" : "var(--text2)",
            borderRadius: "0 0 4px 4px",
            overflow: "hidden",
          }}
        >
          <span>seed {String(seed).slice(0, 6)}</span>
          {isGenerating ? (
            <span style={{ color: "var(--accent)" }}>
              {variant.progressTotal > 0
                ? `${Math.round((variant.progressStep / variant.progressTotal) * 100)}%`
                : "..."}
            </span>
          ) : (
            <span style={{ color: isSelected ? "var(--accent)" : "var(--blue)" }}>
              {isSelected ? "✓" : t("common.select")}
            </span>
          )}
        </div>

        {/* Delete ✕ — top right, on hover */}
        {hovered && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: "1.5px solid var(--bg1)",
              background: "var(--red)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 9,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              zIndex: 10,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {showPlayer && (
        <VideoModal
          videoPath={variant.videoPath}
          imagePath={variant.lastFramePath ?? variant.thumbnailPath ?? variant.compositeImagePath}
          onClose={() => setShowPlayer(false)}
        />
      )}
    </>
  );
}

function VideoModal({
  videoPath, imagePath, onClose,
}: { videoPath: string | null; imagePath: string | null; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: -32, right: 0,
            background: "rgba(255,255,255,0.12)", border: "none",
            color: "#fff", cursor: "pointer", padding: "4px 10px", borderRadius: 4, fontSize: 11,
          }}
        >
          ✕ Đóng (ESC)
        </button>
        {videoPath ? (
          <video
            src={`/api/files/${videoPath}`}
            controls autoPlay loop
            style={{ maxWidth: "85vw", maxHeight: "85vh", borderRadius: 6, display: "block" }}
          />
        ) : imagePath ? (
          <img
            src={`/api/files/${imagePath}`}
            alt="Preview"
            style={{ maxWidth: "85vw", maxHeight: "85vh", borderRadius: 6, display: "block" }}
          />
        ) : null}
      </div>
    </div>
  );
}
