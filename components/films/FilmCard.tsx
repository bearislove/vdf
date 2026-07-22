"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDate } from "@/lib/utils/format";
import { useTranslation } from "@/hooks/useTranslation";
import type { Film } from "@/types/film";
import type { Episode } from "@/types/episode";

interface FilmWithMeta extends Omit<Film, "episodes"> {
  _count?: { episodes: number };
  episodes?: Pick<Episode, "status">[];
}

interface FilmCardProps {
  film: FilmWithMeta;
  onDelete?: (id: string) => void;
}

const EP_COLORS = ["#FF9C2A", "#5B9CF6", "#2ECC71", "#E24B4A", "#C084FC", "#F59E0B", "#10B981"];

export function FilmCard({ film, onDelete }: FilmCardProps) {
  const { t, locale } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const episodeCount = film._count?.episodes ?? film.episodes?.length ?? 0;

  const allDone = film.episodes?.every((e) => e.status === "DONE");
  const anyActive = film.episodes?.some((e) => ["ENRICHING", "GENERATING"].includes(e.status));
  const statusKey = allDone ? "done" : anyActive ? "inProgress" : "draft";
  const statusColor = allDone ? "var(--green)" : anyActive ? "var(--accent)" : "var(--text3)";

  return (
    <Link href={`/films/${film.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          aspectRatio: "1",
          position: "relative",
          borderRadius: 10,
          overflow: "hidden",
          border: hovered ? "0.5px solid var(--border2)" : "0.5px solid var(--border)",
          cursor: "pointer",
          background: "var(--bg1)",
          transition: "border-color 150ms, transform 150ms",
          transform: hovered ? "translateY(-2px)" : "none",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Background: episode bar visualization */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(160deg, #111 0%, #0a0a0a 100%)",
            display: "flex",
            alignItems: "flex-end",
            padding: "12px 12px 54px",
            gap: 5,
          }}
        >
          {Array.from({ length: Math.max(episodeCount, 1) }).map((_, i) => {
            const color = EP_COLORS[i % EP_COLORS.length];
            const h = 30 + ((i * 17) % 45);
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: h,
                  background: `linear-gradient(180deg, ${color}cc 0%, ${color}44 100%)`,
                  borderRadius: "3px 3px 0 0",
                  minHeight: 16,
                  maxHeight: 70,
                }}
              />
            );
          })}
        </div>

        {/* Gradient overlay bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 80,
            background: "linear-gradient(transparent, rgba(0,0,0,0.9))",
            pointerEvents: "none",
          }}
        />

        {/* Top right: status dot + delete */}
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: statusColor,
              display: "block",
            }}
          />
          {onDelete && hovered && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(film.id);
              }}
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                border: "none",
                background: "rgba(0,0,0,0.5)",
                color: "var(--text3)",
                cursor: "pointer",
                fontSize: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 150ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text3)")}
            >
              ✕
            </button>
          )}
        </div>

        {/* Bottom info overlay */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "8px 10px 10px",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "#fff",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginBottom: 3,
              textShadow: "0 1px 4px rgba(0,0,0,0.8)",
            }}
          >
            {film.title}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
              {episodeCount} {t("film.episodes")} · {formatDate(film.updatedAt, locale)}
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 500,
                color: statusColor,
                background: "rgba(0,0,0,0.45)",
                padding: "1px 6px",
                borderRadius: 3,
              }}
            >
              {t(`film.status.${statusKey}`)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function NewFilmCard({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      style={{
        aspectRatio: "1",
        borderRadius: 10,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        border: `1px dashed ${hovered ? "var(--accent)" : "var(--border2)"}`,
        background: hovered ? "rgba(255,156,42,0.04)" : "transparent",
        color: hovered ? "var(--accent)" : "var(--text3)",
        transition: "all 150ms",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
      <span style={{ fontSize: 11 }}>{t("film.new")}</span>
    </div>
  );
}
