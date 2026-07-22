"use client";

import { useEffect, useState, useCallback } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { CanvasEditor } from "@/components/canvas/CanvasEditor";
import { RightPanel } from "@/components/canvas/RightPanel";
import { EpisodeVideoActions } from "@/components/episodes/EpisodeVideoActions";
import { useTranslation } from "@/hooks/useTranslation";
import { useResizePanel } from "@/hooks/useResizePanel";
import { apiFetch, apiPost } from "@/lib/utils/api";
import { sceneHasActiveVideo } from "@/lib/video/video-status";
import { useAppStore } from "@/store/useAppStore";
import type { Episode } from "@/types/episode";
import type { Film } from "@/types/film";
import type { Scene } from "@/types/scene";
import type { StoryObject } from "@/types/object";

interface Props {
  params: { filmId: string; episodeId: string };
}

export default function EpisodePage({ params }: Props) {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const [film, setFilm] = useState<Film | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [objects, setObjects] = useState<StoryObject[]>([]);
  const [loading, setLoading] = useState(true);
  const rightPanel = useResizePanel(426, 126, 520, "right");

  const load = useCallback(async () => {
    try {
      const [filmData, episodeData, objectData] = await Promise.all([
        apiFetch<Film>(`/api/films/${params.filmId}`),
        apiFetch<Episode & { scenes?: Scene[] }>(`/api/episodes/${params.episodeId}`),
        apiFetch<StoryObject[]>(`/api/objects?filmId=${params.filmId}`),
      ]);
      setFilm(filmData);
      setEpisode(episodeData);
      setScenes(episodeData.scenes ?? []);
      setObjects(Array.isArray(objectData) ? objectData : []);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [addToast, params.filmId, params.episodeId]);

  useEffect(() => {
    load();
  }, [load]);

  const hasActiveVideo = scenes.some(sceneHasActiveVideo);

  // Poll serially while work is active. A recursive timeout prevents a slow
  // provider check from overlapping with the next request.
  useEffect(() => {
    if (!hasActiveVideo) return;

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const nextScenes = await apiPost<Scene[]>(
          `/api/episodes/${params.episodeId}/sync-variants`,
          {}
        );
        if (cancelled) return;
        if (!Array.isArray(nextScenes)) throw new Error("Invalid scene sync response");
        setScenes(nextScenes);
        if (nextScenes.some(sceneHasActiveVideo)) timeout = setTimeout(poll, 3000);
      } catch (error) {
        if (!cancelled) {
          console.error("[episode-sync]", error);
          timeout = setTimeout(poll, 3000);
        }
      }
    };

    timeout = setTimeout(poll, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [hasActiveVideo, params.episodeId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Topbar
        breadcrumbs={[
          { label: t("nav.films"), href: "/films" },
          { label: film?.title ?? "...", href: `/films/${params.filmId}` },
          { label: episode?.title ?? "..." },
        ]}
        actions={
          <EpisodeVideoActions
            filmId={params.filmId}
            episodeId={params.episodeId}
            episodeTitle={episode?.title}
            scenes={scenes}
            onRefresh={load}
          />
        }
      />

      {/* Canvas layout */}
      {!loading && (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <CanvasEditor
            episodeId={params.episodeId}
            scenes={scenes}
            onScenesChange={load}
          />

          {/* Drag handle + Right panel */}
          <div style={{ display: "flex", flexShrink: 0 }}>
            <ResizeHandle onMouseDown={rightPanel.onMouseDown} />
            <div style={{ width: rightPanel.width, overflow: "hidden", display: "flex" }}>
              <RightPanel
                scenes={scenes}
                objects={objects}
                onSceneUpdate={load}
                onObjectUpdate={load}
              />
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text3)",
          }}
        >
          {t("common.loading")}
        </div>
      )}
    </div>
  );
}

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 4,
        flexShrink: 0,
        cursor: "col-resize",
        background: hovered ? "var(--accent)" : "var(--border)",
        transition: "background 150ms",
        zIndex: 10,
      }}
    />
  );
}
