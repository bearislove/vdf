"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { EpisodeCard, NewEpisodeCard } from "@/components/episodes/EpisodeCard";
import { NewEpisodeDialog } from "@/components/episodes/NewEpisodeDialog";
import { MergeStrip } from "@/components/films/MergeStrip";
import { useTranslation } from "@/hooks/useTranslation";
import { useAppStore } from "@/store/useAppStore";
import type { Film } from "@/types/film";
import type { Episode } from "@/types/episode";

interface Props {
  params: { filmId: string };
}

const POLL_INTERVAL = 3000;
const ENRICHING_STATUSES = new Set(["ENRICHING", "GENERATING"]);

export default function FilmPage({ params }: Props) {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const [film, setFilm] = useState<Film | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEpisodes = useCallback(async () => {
    const response = await fetch(`/api/episodes?filmId=${params.filmId}`);
    const data: Episode[] = await response.json();
    setEpisodes(data);
    return data;
  }, [params.filmId]);

  const load = useCallback(async () => {
    setLoading(true);
    const [filmResponse] = await Promise.all([
      fetch(`/api/films/${params.filmId}`),
      fetchEpisodes(),
    ]);
    setFilm(await filmResponse.json());
    setLoading(false);
  }, [params.filmId, fetchEpisodes]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const hasActive = episodes.some((episode) => ENRICHING_STATUSES.has(episode.status));
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const data = await fetchEpisodes();
        if (!data.some((episode) => ENRICHING_STATUSES.has(episode.status)) && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          addToast("success", t("episode.enrichSuccess"));
        }
      }, POLL_INTERVAL);
    }
    if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [episodes, fetchEpisodes, addToast, t]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  async function handleDelete(id: string) {
    if (!confirm(t("episode.deleteConfirm"))) return;
    await fetch(`/api/episodes/${id}`, { method: "DELETE" });
    setEpisodes((current) => current.filter((episode) => episode.id !== id));
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg0)" }}>
      <Topbar
        breadcrumbs={[
          { label: t("nav.films"), href: "/films" },
          { label: film?.title ?? "..." },
        ]}
      />
      <main style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--text1)" }}>
            {film?.title ?? "..."}
          </h1>
          <button className="btn-p" onClick={() => setShowCreate(true)}>
            + {t("episode.new")}
          </button>
        </div>

        {showCreate && (
          <NewEpisodeDialog
            filmId={params.filmId}
            onClose={() => setShowCreate(false)}
            onCreated={fetchEpisodes}
          />
        )}

        {loading ? (
          <div style={{ color: "var(--text3)", fontSize: 12 }}>{t("common.loading")}</div>
        ) : (
          <>
            <MergeStrip filmId={params.filmId} episodes={episodes} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
              {episodes.map((episode) => (
                <EpisodeCard
                  key={episode.id}
                  episode={episode}
                  filmId={params.filmId}
                  onDelete={handleDelete}
                />
              ))}
              <NewEpisodeCard onClick={() => setShowCreate(true)} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
