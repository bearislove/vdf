"use client";

import { useEffect, useState, useCallback } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { FilmCard, NewFilmCard } from "@/components/films/FilmCard";
import { useTranslation } from "@/hooks/useTranslation";
import { useAppStore } from "@/store/useAppStore";
import type { Film } from "@/types/film";
import type { Episode } from "@/types/episode";

interface FilmWithMeta extends Omit<Film, "episodes"> {
  _count?: { episodes: number };
  episodes?: Pick<Episode, "status">[];
}

export default function FilmsPage() {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const [films, setFilms] = useState<FilmWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/films");
    const data = await res.json();
    setFilms(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/films", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!res.ok) throw new Error("Failed");
      addToast("success", t("common.success"));
      setNewTitle("");
      setShowCreate(false);
      await load();
    } catch {
      addToast("error", t("common.error"));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("film.deleteConfirm"))) return;
    await fetch(`/api/films/${id}`, { method: "DELETE" });
    setFilms((f) => f.filter((x) => x.id !== id));
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg0)" }}>
      <Topbar />
      <main style={{ padding: 20 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--text1)" }}>
            {t("film.title")}
          </h1>
          <button className="btn-p" onClick={() => setShowCreate(true)}>
            + {t("film.new")}
          </button>
        </div>

        {/* Create modal */}
        {showCreate && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 100,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowCreate(false);
            }}
          >
            <div
              style={{
                background: "var(--bg1)",
                border: "0.5px solid var(--border)",
                borderRadius: 10,
                padding: 20,
                width: 360,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>
                {t("film.new")}
              </div>
              <label className="form-label">{t("film.nameLabel")}</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t("film.namePlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                <button className="btn" onClick={() => setShowCreate(false)}>
                  {t("common.cancel")}
                </button>
                <button
                  className="btn-p"
                  onClick={handleCreate}
                  disabled={creating || !newTitle.trim()}
                >
                  {creating ? t("common.processing") : t("common.create")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Film grid */}
        {loading ? (
          <div style={{ color: "var(--text3)", fontSize: 12 }}>{t("common.loading")}</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 10,
            }}
          >
            {films.map((film) => (
              <FilmCard key={film.id} film={film} onDelete={handleDelete} />
            ))}
            <NewFilmCard onClick={() => setShowCreate(true)} />
          </div>
        )}
      </main>
    </div>
  );
}
