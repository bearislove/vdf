"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { EpisodeCard, NewEpisodeCard } from "@/components/episodes/EpisodeCard";
import { MergeStrip } from "@/components/films/MergeStrip";
import { useTranslation } from "@/hooks/useTranslation";
import { useAppStore } from "@/store/useAppStore";
import type { Film } from "@/types/film";
import type { Episode } from "@/types/episode";

interface Props {
  params: { filmId: string };
}

type ModalStep = "upload" | "configure";

interface StoryData {
  text: string;
  fileName: string;
  wordCount: number;
}

interface ConfigForm {
  title: string;
  useAI: boolean;
  targetDurationSeconds: string;
  sceneCountHint: string;
}

const POLL_INTERVAL = 3000;
const ENRICHING_STATUSES = new Set(["ENRICHING", "GENERATING"]);

export default function FilmPage({ params }: Props) {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const [film, setFilm] = useState<Film | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState<ModalStep>("upload");
  const [story, setStory] = useState<StoryData | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [form, setForm] = useState<ConfigForm>({ title: "", useAI: true, targetDurationSeconds: "", sceneCountHint: "" });
  const [creating, setCreating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  const fetchEpisodes = useCallback(async () => {
    const res = await fetch(`/api/episodes?filmId=${params.filmId}`);
    const data: Episode[] = await res.json();
    setEpisodes(data);
    return data;
  }, [params.filmId]);

  const load = useCallback(async () => {
    setLoading(true);
    const [filmRes] = await Promise.all([
      fetch(`/api/films/${params.filmId}`),
      fetchEpisodes(),
    ]);
    setFilm(await filmRes.json());
    setLoading(false);
  }, [params.filmId, fetchEpisodes]);

  useEffect(() => { load(); }, [load]);

  // ── Auto-poll when any episode is ENRICHING/GENERATING ────────────────────

  useEffect(() => {
    const hasActive = episodes.some((e) => ENRICHING_STATUSES.has(e.status));

    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const data = await fetchEpisodes();
        // Stop polling when all settled
        if (!data.some((e) => ENRICHING_STATUSES.has(e.status))) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          addToast("success", `✅ Phân tích hoàn tất — ${data.filter((e) => e.status === "READY").length} tập sẵn sàng`);
        }
      }, POLL_INTERVAL);
    }

    if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      // Don't clear on unmount — episodes change, not unmount
    };
  }, [episodes, fetchEpisodes, addToast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Modal helpers ─────────────────────────────────────────────────────────

  function openCreate() {
    setStep("upload");
    setStory(null);
    setDragOver(false);
    setShowPaste(false);
    setPasteText("");
    setForm({ title: "", useAI: true, targetDurationSeconds: "", sceneCountHint: "" });
    setShowCreate(true);
  }

  function loadStoryFromText(text: string, fileName: string) {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const suggestedTitle = fileName.replace(/\.(md|txt)$/, "").replace(/[-_]/g, " ");
    setStory({ text, fileName, wordCount });
    setForm((f) => ({ ...f, title: f.title || suggestedTitle }));
    setStep("configure");
  }

  function handleFile(file: File) {
    if (!file.name.endsWith(".md") && !file.name.endsWith(".txt")) {
      addToast("error", "Chỉ hỗ trợ file .md hoặc .txt");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => loadStoryFromText((e.target?.result as string) ?? "", file.name);
    reader.readAsText(file);
  }

  function handlePasteConfirm() {
    if (!pasteText.trim()) return;
    loadStoryFromText(pasteText.trim(), "story.txt");
  }

  // ── Create episode ────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!form.title.trim() || !story) return;
    setCreating(true);
    try {
      // 1. Create episode
      const body = {
        filmId: params.filmId,
        title: form.title.trim(),
        storyRaw: story.text,
        targetDurationSeconds: form.targetDurationSeconds ? parseFloat(form.targetDurationSeconds) : undefined,
        sceneCountHint: !form.useAI && form.sceneCountHint ? parseInt(form.sceneCountHint, 10) : undefined,
      };
      const res = await fetch("/api/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Tạo tập thất bại");
      const episode: Episode = await res.json();

      if (form.useAI) {
        // 2. Optimistically add episode with ENRICHING status
        setEpisodes((prev) => [...prev, { ...episode, status: "ENRICHING" as const }]);
        setShowCreate(false);

        // 3. Fire enrich — intentionally not awaited (fire & forget)
        fetch(`/api/episodes/${episode.id}/enrich`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storyRaw: story.text }),
        }).catch((e) => addToast("error", `Enrich thất bại: ${String(e)}`));

        addToast("info", `🤖 Đang phân tích tập "${episode.title}"...`);
        // Polling will auto-start via the useEffect above
      } else {
        addToast("success", t("common.success"));
        setShowCreate(false);
        await fetchEpisodes();
      }
    } catch (e) {
      addToast("error", String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("episode.deleteConfirm"))) return;
    await fetch(`/api/episodes/${id}`, { method: "DELETE" });
    setEpisodes((e) => e.filter((x) => x.id !== id));
  }

  // ── Render ────────────────────────────────────────────────────────────────

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
          <button className="btn-p" onClick={openCreate}>
            + {t("episode.new")}
          </button>
        </div>

        {/* ─── Create modal ─── */}
        {showCreate && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
            onClick={(e) => { if (e.target === e.currentTarget && !creating) setShowCreate(false); }}
          >
            <div
              style={{
                background: "var(--bg1)",
                border: "0.5px solid var(--border)",
                borderRadius: 10,
                padding: 24,
                width: 480,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text1)" }}>
                {t("episode.createNew")}
              </div>

              {/* ── Step 1: Upload ── */}
              {step === "upload" && (
                <>
                  {!showPaste ? (
                    <>
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        onDragEnter={() => setDragOver(true)}
                        onDragLeave={() => setDragOver(false)}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOver(false);
                          const file = e.dataTransfer.files[0];
                          if (file) handleFile(file);
                        }}
                        style={{
                          border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border2)"}`,
                          borderRadius: 10,
                          padding: "52px 24px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 10,
                          cursor: "pointer",
                          background: dragOver ? "rgba(255,156,42,0.05)" : "var(--bg2)",
                          transition: "border-color 150ms, background 150ms",
                        }}
                      >
                        <span style={{ fontSize: 40 }}>📄</span>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)" }}>
                          Kéo thả file .md / .txt vào đây
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text3)" }}>
                          hoặc click để chọn file
                        </div>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".md,.txt"
                        style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                      />
                      <button
                        className="btn btn-sm"
                        onClick={() => setShowPaste(true)}
                        style={{ alignSelf: "center", fontSize: 11 }}
                      >
                        ✏ Dán cốt chuyện trực tiếp
                      </button>
                    </>
                  ) : (
                    <>
                      <textarea
                        value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                        placeholder={t("episode.storyPlaceholder")}
                        autoFocus
                        style={{ minHeight: 200, resize: "vertical" }}
                      />
                      {pasteText.trim() && (
                        <div style={{ fontSize: 10, color: "var(--text3)" }}>
                          {pasteText.split(/\s+/).filter(Boolean).length} {t("common.words")}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-sm" onClick={() => setShowPaste(false)} style={{ flex: 1 }}>
                          ← Quay lại
                        </button>
                        <button
                          className="btn-p btn-sm"
                          onClick={handlePasteConfirm}
                          disabled={!pasteText.trim()}
                          style={{ flex: 1 }}
                        >
                          Tiếp theo →
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── Step 2: Configure ── */}
              {step === "configure" && story && (
                <>
                  {/* Story card */}
                  <div
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: "var(--bg2)", border: "0.5px solid var(--border)",
                      borderRadius: 7, padding: "8px 12px",
                    }}
                  >
                    <span style={{ fontSize: 20 }}>📄</span>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {story.fileName}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text3)" }}>
                        {story.wordCount.toLocaleString()} {t("common.words")}
                      </div>
                    </div>
                    <button
                      className="btn btn-sm"
                      onClick={() => { setStep("upload"); setShowPaste(false); setPasteText(""); }}
                      style={{ fontSize: 10, flexShrink: 0 }}
                    >
                      Thay đổi
                    </button>
                  </div>

                  {/* AI checkbox */}
                  <label
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      background: form.useAI ? "var(--accent-dim)" : "var(--bg2)",
                      border: `0.5px solid ${form.useAI ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: 7, padding: "10px 12px", cursor: "pointer",
                      transition: "background 150ms, border-color 150ms",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.useAI}
                      onChange={(e) => setForm((f) => ({ ...f, useAI: e.target.checked }))}
                      style={{ width: 14, height: 14, marginTop: 2, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }}
                    />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: form.useAI ? "var(--accent)" : "var(--text1)" }}>
                        🤖 Dùng AI phân tích và điền các field khác
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2 }}>
                        {form.useAI
                          ? "AI tự chia cảnh, tạo nhân vật & đối tượng — chạy ngầm, không cần chờ"
                          : "Bạn nhập thủ công số cảnh và các thông số"}
                      </div>
                    </div>
                  </label>

                  {/* Title */}
                  <div>
                    <label className="form-label">{t("episode.nameLabel")} *</label>
                    <input
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder={t("episode.namePlaceholder")}
                      autoFocus
                    />
                  </div>

                  {/* Duration */}
                  <div>
                    <label className="form-label">{t("episode.durationLabel")}</label>
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={form.targetDurationSeconds}
                      onChange={(e) => setForm((f) => ({ ...f, targetDurationSeconds: e.target.value }))}
                      placeholder={t("episode.durationPlaceholder")}
                    />
                  </div>

                  {/* Scene count — manual only */}
                  {!form.useAI && (
                    <div>
                      <label className="form-label">{t("episode.splitScenesLabel")}</label>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={form.sceneCountHint}
                        onChange={(e) => setForm((f) => ({ ...f, sceneCountHint: e.target.value }))}
                        placeholder={t("episode.sceneCountPlaceholder")}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Footer */}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn" onClick={() => setShowCreate(false)} disabled={creating}>
                  {t("common.cancel")}
                </button>
                {step === "configure" && story && (
                  <button
                    className="btn-p"
                    onClick={handleCreate}
                    disabled={creating || !form.title.trim()}
                  >
                    {creating
                      ? t("common.processing")
                      : form.useAI
                      ? "Tạo & Phân tích →"
                      : t("common.create")}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── Episode grid ─── */}
        {loading ? (
          <div style={{ color: "var(--text3)", fontSize: 12 }}>{t("common.loading")}</div>
        ) : (
          <>
            <MergeStrip filmId={params.filmId} episodes={episodes} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
              {episodes.map((ep) => (
                <EpisodeCard key={ep.id} episode={ep} filmId={params.filmId} onDelete={handleDelete} />
              ))}
              <NewEpisodeCard onClick={openCreate} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
