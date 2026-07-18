"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { ObjectPanel } from "@/components/canvas/ObjectPanel";
import { CanvasEditor } from "@/components/canvas/CanvasEditor";
import { RightPanel } from "@/components/canvas/RightPanel";
import { EpisodeVideoActions } from "@/components/episodes/EpisodeVideoActions";
import { useTranslation } from "@/hooks/useTranslation";
import { useResizePanel } from "@/hooks/useResizePanel";
import { sceneHasActiveVideo } from "@/lib/video/video-status";
import type { Episode } from "@/types/episode";
import type { Film } from "@/types/film";
import type { Scene } from "@/types/scene";
import type { StoryObject } from "@/types/object";

interface Props {
  params: { filmId: string; episodeId: string };
}

export default function EpisodePage({ params }: Props) {
  const { t } = useTranslation();
  const [film, setFilm] = useState<Film | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [objects, setObjects] = useState<StoryObject[]>([]);
  const [loading, setLoading] = useState(true);
  const leftPanel = useResizePanel(386, 186, 520, "left");
  const rightPanel = useResizePanel(426, 126, 520, "right");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const [filmRes, epRes, objRes] = await Promise.all([
      fetch(`/api/films/${params.filmId}`),
      fetch(`/api/episodes/${params.episodeId}`),
      fetch(`/api/objects?filmId=${params.filmId}`),
    ]);
    const filmData = await filmRes.json();
    const epData = await epRes.json();
    const objData = await objRes.json();
    setFilm(filmData);
    setEpisode(epData);
    setScenes(epData.scenes ?? []);
    setObjects(Array.isArray(objData) ? objData : []);
    setLoading(false);
  }, [params.filmId, params.episodeId]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-poll every 3s while any scene has a GENERATING/QUEUED variant
  useEffect(() => {
    const hasGenerating = scenes.some(sceneHasActiveVideo);

    if (hasGenerating && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        // Gọi sync-variants: hỏi thẳng ComfyUI từng job đang GENERATING
        // và cập nhật DB nếu đã xong, rồi trả về scenes mới nhất
        const res = await fetch(`/api/episodes/${params.episodeId}/sync-variants`, { method: "POST" });
        const newScenes: Scene[] = await res.json();
        setScenes(newScenes);
        if (!newScenes.some(sceneHasActiveVideo)) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      }, 3000);
    }

    if (!hasGenerating && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes, params.episodeId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

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
          {/* Left panel + drag handle */}
          <div style={{ display: "flex", flexShrink: 0 }}>
            <div style={{ width: leftPanel.width, overflow: "hidden", display: "flex" }}>
              <ObjectPanel
                objects={objects}
                filmId={params.filmId}
                onObjectsChange={load}
              />
            </div>
            <ResizeHandle onMouseDown={leftPanel.onMouseDown} />
          </div>

          <CanvasEditor
            episodeId={params.episodeId}
            scenes={scenes}
            objects={objects}
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
