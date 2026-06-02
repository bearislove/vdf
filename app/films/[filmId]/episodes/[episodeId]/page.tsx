"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { ObjectPanel } from "@/components/canvas/ObjectPanel";
import { CanvasEditor } from "@/components/canvas/CanvasEditor";
import { RightPanel } from "@/components/canvas/RightPanel";
import { useTranslation } from "@/hooks/useTranslation";
import { useAppStore } from "@/store/useAppStore";
import { useResizePanel } from "@/hooks/useResizePanel";
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
  const leftPanel = useResizePanel(386, 186, 520, "left");
  const rightPanel = useResizePanel(426, 126, 520, "right");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const GENERATING_STATUSES = new Set(["QUEUED", "GENERATING_IMAGE", "GENERATING_VIDEO"]);

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
    const hasGenerating = scenes.some((s) =>
      s.videoVariants?.some((v) => GENERATING_STATUSES.has(v.status))
    );

    if (hasGenerating && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        // Gọi sync-variants: hỏi thẳng ComfyUI từng job đang GENERATING
        // và cập nhật DB nếu đã xong, rồi trả về scenes mới nhất
        const res = await fetch(`/api/episodes/${params.episodeId}/sync-variants`, { method: "POST" });
        const newScenes: Scene[] = await res.json();
        setScenes(newScenes);
        if (!newScenes.some((s) => s.videoVariants?.some((v) => GENERATING_STATUSES.has(v.status)))) {
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

  // Có ít nhất 1 scene đã có video DONE
  const hasDoneVideo = scenes.some(
    (s) =>
      (s.selectedVideo as { status?: string } | null | undefined)?.status === "DONE" ||
      s.videoVariants?.some((v) => v.status === "DONE")
  );
  const [merging, setMerging] = useState(false);

  const handleMergeEpisode = useCallback(async () => {
    setMerging(true);
    try {
      const res = await fetch("/api/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filmId: params.filmId, episodeIds: [params.episodeId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Merge failed");
      addToast("success", "Xuất video xong! Đang tải về...");
      const a = document.createElement("a");
      a.href = data.outputUrl;
      a.download = `${episode?.title ?? "episode"}.mp4`;
      a.click();
    } catch (e) {
      addToast("error", String(e));
    } finally {
      setMerging(false);
    }
  }, [params.filmId, params.episodeId, episode?.title, addToast]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Topbar
        showMode
        breadcrumbs={[
          { label: t("nav.films"), href: "/films" },
          { label: film?.title ?? "...", href: `/films/${params.filmId}` },
          { label: episode?.title ?? "..." },
        ]}
        actions={
          hasDoneVideo ? (
            <button
              className="btn"
              onClick={handleMergeEpisode}
              disabled={merging}
              style={{ fontSize: 10 }}
            >
              {merging ? "⟳ Đang xuất..." : "🎬 Xuất video tập"}
            </button>
          ) : undefined
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
