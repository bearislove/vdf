"use client";

import { useState } from "react";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react";
import { useTranslation } from "@/hooks/useTranslation";
import { MediaPreviewModal } from "@/components/ui/MediaPreviewModal";
import type { VideoVariant } from "@/types/video";

interface VariantListProps {
  variants: VideoVariant[];
  selectedVideoId: string | null;
  sceneId: string;
  onSelect: (variantId: string) => void;
  onDelete: (variantId: string) => void;
  onRecover: (variantId: string) => Promise<void>;
}

function readableError(detail: string | null, fallback: string): string {
  if (!detail?.trim()) return fallback;

  try {
    const parsed = JSON.parse(detail) as unknown;
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object") {
      const error = parsed as Record<string, unknown>;
      const message = error.exception_message ?? error.message ?? error.error ?? error.detail;
      if (typeof message === "string" && message.trim()) {
        const node = typeof error.node_type === "string" ? ` (${error.node_type})` : "";
        return `${message}${node}`;
      }
    }
  } catch {
    // Provider errors are often plain text rather than JSON.
  }

  return detail;
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
  const [showReference, setShowReference] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [errorExpanded, setErrorExpanded] = useState(false);
  const seed = (variant.paramsSnapshot as Record<string, unknown>)?.seed ?? "?";
  const snapshotReference = (variant.paramsSnapshot as Record<string, unknown>)?.referenceImagePath;
  const referenceImagePath = variant.compositeImagePath ||
    (typeof snapshotReference === "string" ? snapshotReference : null);
  const isGenerating =
    variant.status === "QUEUED" ||
    variant.status === "GENERATING_IMAGE" ||
    variant.status === "GENERATING_VIDEO";
  const isFailed = variant.status === "FAILED";
  const errorMessage = readableError(variant.errorDetail, t("video.unknownError"));
  const coverImg = variant.lastFramePath || variant.thumbnailPath ||
    (variant.videoPath?.endsWith(".webp") ? variant.videoPath : null);
  const hasMedia = !!(variant.videoPath || coverImg);

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          border: isFailed
            ? "1px solid var(--red)"
            : isSelected
            ? "1.5px solid var(--accent)"
            : "0.5px solid var(--border)",
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
            <IconLoader2
              size={18}
              stroke={2}
              className="loading-spinner"
              style={{ color: "var(--accent)" }}
              aria-label={t("canvas.generatingVideo")}
            />
          ) : isFailed ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <IconAlertTriangle size={18} stroke={2} style={{ color: "var(--red)" }} aria-hidden="true" />
              <span style={{ fontSize: 9, color: "var(--red)", textAlign: "center" }}>
                {t("video.generationFailed")}
              </span>
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
                  display: "inline-flex", alignItems: "center", gap: 3,
                }}
              >
                <IconRefresh
                  size={10}
                  stroke={2}
                  className={recovering ? "loading-spinner" : undefined}
                  aria-hidden="true"
                />
                {t("video.recheck")}
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

          {referenceImagePath && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setShowReference(true);
              }}
              title={t("video.referenceImageUsed")}
              aria-label={t("video.referenceImageUsed")}
              style={{
                position: "absolute",
                left: 5,
                bottom: 5,
                width: 30,
                height: 30,
                padding: 2,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.75)",
                borderRadius: 4,
                background: "rgba(0,0,0,0.72)",
                cursor: "pointer",
                zIndex: 2,
              }}
            >
              <img
                src={`/api/files/${referenceImagePath}`}
                alt={t("video.referenceImageUsed")}
                style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", borderRadius: 2 }}
              />
            </button>
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
            borderRadius: isFailed ? 0 : "0 0 4px 4px",
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
          ) : isFailed ? (
            <span style={{ color: "var(--red)", fontWeight: 500 }}>{t("common.error")}</span>
          ) : (
            <span style={{ color: isSelected ? "var(--accent)" : "var(--blue)" }}>
              {isSelected ? "✓" : t("common.select")}
            </span>
          )}
        </div>

        {isFailed && (
          <div
            role="alert"
            title={errorMessage}
            style={{
              padding: "6px 7px",
              background: "var(--red-dim)",
              borderTop: "0.5px solid var(--red)",
              borderRadius: "0 0 4px 4px",
              color: "var(--red)",
              fontSize: 9,
              lineHeight: 1.4,
              overflowWrap: "anywhere",
            }}
          >
            <div
              style={errorExpanded ? undefined : {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 3,
                overflow: "hidden",
              }}
            >
              {errorMessage}
            </div>
            {errorMessage.length > 90 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setErrorExpanded((expanded) => !expanded);
                }}
                title={errorExpanded ? t("video.hideError") : t("video.showFullError")}
                aria-label={errorExpanded ? t("video.hideError") : t("video.showFullError")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  marginTop: 3,
                  padding: 1,
                  border: 0,
                  background: "transparent",
                  color: "var(--red)",
                  cursor: "pointer",
                }}
              >
                {errorExpanded ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
              </button>
            )}
          </div>
        )}

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
        <MediaPreviewModal
          videoPath={variant.videoPath}
          imagePath={variant.lastFramePath ?? variant.thumbnailPath ?? variant.compositeImagePath}
          onClose={() => setShowPlayer(false)}
        />
      )}
      {showReference && referenceImagePath && (
        <MediaPreviewModal
          imagePath={referenceImagePath}
          onClose={() => setShowReference(false)}
        />
      )}
    </>
  );
}
