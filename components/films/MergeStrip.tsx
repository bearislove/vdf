"use client";

import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAppStore } from "@/store/useAppStore";
import type { Episode } from "@/types/episode";

interface MergeStripProps {
  filmId: string;
  episodes: Episode[];
  onDone?: (outputUrl: string) => void;
}

export function MergeStrip({ filmId, episodes, onDone }: MergeStripProps) {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);

  const readyEps = episodes.filter(
    (e) => e.status === "DONE" || e.status === "READY" || e.status === "GENERATING"
  );

  if (readyEps.length === 0) return null;

  function toggleEp(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // Maintain order based on episode.order
  const orderedSelected = episodes
    .filter((e) => selected.includes(e.id))
    .sort((a, b) => a.order - b.order)
    .map((e) => e.id);

  async function handleMerge() {
    if (orderedSelected.length < 1) return;
    setMerging(true);
    try {
      const res = await fetch("/api/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filmId, episodeIds: orderedSelected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Merge failed");
      addToast("success", t("film.mergeComplete"));
      onDone?.(data.outputUrl);
      // Auto-download
      const a = document.createElement("a");
      a.href = data.outputUrl;
      a.download = `film_merged.mp4`;
      a.click();
    } catch (e) {
      addToast("error", String(e));
    } finally {
      setMerging(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--bg1)",
        border: "0.5px solid var(--border)",
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 16,
      }}
    >
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: "var(--text2)" }}>⛓</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text1)" }}>
          {t("film.merge")}
        </span>
      </div>
      <p style={{ fontSize: 10, color: "var(--text2)", marginBottom: 10 }}>
        {t("film.mergeHint")}
      </p>

      {/* Episode chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 12 }}>
        {episodes.map((ep) => {
          const isSelected = selected.includes(ep.id);
          const selIdx = orderedSelected.indexOf(ep.id);
          const hasVideo = ep.status === "DONE";
          return (
            <span key={ep.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {selIdx > 0 && (
                <span style={{ fontSize: 11, color: "var(--text3)" }}>→</span>
              )}
              <button
                onClick={() => toggleEp(ep.id)}
                disabled={!hasVideo}
                title={!hasVideo ? t("episode.noVideo") : `${t("film.episodePrefix")} ${ep.order + 1}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 10px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 500,
                  cursor: hasVideo ? "pointer" : "not-allowed",
                  border: isSelected
                    ? "0.5px solid var(--accent)"
                    : "0.5px solid var(--border2)",
                  background: isSelected ? "var(--accent-dim)" : "var(--bg2)",
                  color: isSelected ? "var(--accent)" : hasVideo ? "var(--text2)" : "var(--text3)",
                  opacity: hasVideo ? 1 : 0.5,
                  transition: "all 150ms",
                }}
              >
                {isSelected && <span style={{ fontSize: 8 }}>✓</span>}
                {t("film.episodePrefix")} {ep.order + 1}
              </button>
            </span>
          );
        })}
      </div>

      {/* Action */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          className="btn-p btn-sm"
          onClick={handleMerge}
          disabled={merging || orderedSelected.length === 0}
        >
          {merging
            ? `⟳ ${t("film.merging")}`
            : orderedSelected.length > 0
            ? t("film.mergeAction", { count: String(orderedSelected.length) })
            : t("film.selectEpisodes")}
        </button>
        {selected.length > 0 && (
          <button
            className="btn btn-sm"
            onClick={() => setSelected([])}
          >
            {t("common.deselect")}
          </button>
        )}
      </div>
    </div>
  );
}
