"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import type { Episode, EpisodeStatus } from "@/types/episode";

interface EpisodeCardProps {
  episode: Episode & { _count?: { scenes: number } };
  filmId: string;
  onDelete?: (id: string) => void;
}

const STATUS_COLOR: Record<EpisodeStatus, string> = {
  DRAFT:      "var(--text3)",
  ENRICHING:  "var(--blue)",
  READY:      "var(--accent)",
  GENERATING: "var(--accent)",
  DONE:       "var(--green)",
};

const STATUS_BG: Record<EpisodeStatus, string> = {
  DRAFT:      "var(--bg3)",
  ENRICHING:  "var(--blue-dim)",
  READY:      "var(--accent-dim)",
  GENERATING: "var(--accent-dim)",
  DONE:       "var(--green-dim)",
};

const STATUS_I18N_KEY: Record<EpisodeStatus, string> = {
  DRAFT:      "episode.status.draft",
  ENRICHING:  "episode.status.enriching",
  READY:      "episode.status.ready",
  GENERATING: "episode.status.generating",
  DONE:       "episode.status.done",
};

const ENRICH_STEP_KEYS = [
  "episode.enrichStep1",
  "episode.enrichStep2",
  "episode.enrichStep3",
];

export function EpisodeCard({ episode, filmId, onDelete }: EpisodeCardProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const sceneCount = episode._count?.scenes ?? (episode.scenes as unknown as unknown[])?.length ?? 0;
  const status = episode.status as EpisodeStatus;
  const isEnriching = status === "ENRICHING";

  return (
    <Link href={`/films/${filmId}/episodes/${episode.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          background: "var(--bg1)",
          border: isEnriching
            ? "0.5px solid var(--blue)"
            : hovered
            ? "0.5px solid var(--border2)"
            : "0.5px solid var(--border)",
          borderRadius: 8,
          cursor: "pointer",
          transition: "border-color 150ms, transform 150ms",
          transform: hovered ? "translateY(-1px)" : "none",
          position: "relative",
          overflow: "hidden",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Top bar */}
        {isEnriching ? (
          <div className="ep-shimmer-bar" />
        ) : (
          <div
            style={{
              height: 3,
              background: STATUS_COLOR[status],
              opacity: 0.7,
              width: status === "DONE" ? "100%" : status === "GENERATING" ? "65%" : status === "READY" ? "35%" : "0%",
              transition: "width 500ms",
            }}
          />
        )}

        <div style={{ padding: "10px 12px 8px" }}>
          {/* Header row */}
          <div
            style={{
              fontSize: 9,
              color: "var(--text3)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{t("episode.episode")} {episode.order + 1}</span>
            <span
              style={{
                fontSize: 8,
                fontWeight: 500,
                color: STATUS_COLOR[status],
                background: STATUS_BG[status],
                padding: "1px 5px",
                borderRadius: 3,
              }}
            >
              {t(STATUS_I18N_KEY[status])}
            </span>
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text1)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginBottom: 6,
            }}
          >
            {episode.title}
          </div>

          {/* Body */}
          {isEnriching ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {/* Spinner + label */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--blue)" }}>
                <span className="ep-spin" style={{ fontSize: 12 }}>⟳</span>
                <span>🤖 {t("episode.aiProcessing")}</span>
                <span className="ep-dots">
                  <span style={{ animationDelay: "0s" }}>.</span>
                  <span style={{ animationDelay: "0.2s" }}>.</span>
                  <span style={{ animationDelay: "0.4s" }}>.</span>
                </span>
              </div>

              {/* Cycling steps */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {ENRICH_STEP_KEYS.map((stepKey, i) => (
                  <div
                    key={i}
                    className={`ep-step ep-step-${i}`}
                    style={{ fontSize: 9, display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <span style={{ fontSize: 8 }}>○</span>
                    {t(stepKey)}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "var(--text3)" }}>
              {sceneCount > 0 ? (
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span>🎬</span> {sceneCount} {t("common.scenes")}
                </span>
              ) : (
                <span>{t("episode.noContent")}</span>
              )}
            </div>
          )}
        </div>

        {/* Delete button */}
        {onDelete && hovered && !isEnriching && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(episode.id); }}
            style={{
              position: "absolute", top: 8, right: 8,
              width: 20, height: 20, borderRadius: 4, border: "none",
              background: "var(--bg3)", color: "var(--text3)",
              cursor: "pointer", fontSize: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--red)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--red-dim)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text3)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg3)";
            }}
          >
            ✕
          </button>
        )}
      </div>
    </Link>
  );
}

export function NewEpisodeCard({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      style={{
        background: "transparent",
        border: `1px dashed ${hovered ? "var(--accent)" : "var(--border2)"}`,
        borderRadius: 8,
        padding: "10px 12px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        minHeight: 82,
        color: hovered ? "var(--accent)" : "var(--text3)",
        fontSize: 11,
        transition: "border-color 150ms, color 150ms",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize: 14 }}>+</span>
      {t("episode.new")}
    </div>
  );
}
