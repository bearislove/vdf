"use client";

import { useRef, useState } from "react";
import {
  IconArrowLeft,
  IconCheck,
  IconFileText,
  IconMapPin,
  IconRefresh,
  IconSparkles,
  IconUser,
} from "@tabler/icons-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAppStore } from "@/store/useAppStore";
import type { EnrichmentResult } from "@/lib/ai/enrichment";
import type { TextProviderName } from "@/lib/providers/types";
import { ModalDialog } from "@/components/ui/ModalDialog";
import { TextProviderSelect } from "@/components/ui/TextProviderSelect";

interface Props {
  filmId: string;
  onClose: () => void;
  onCreated: () => Promise<unknown> | void;
}

interface EpisodeForm {
  title: string;
  useAI: boolean;
  targetDurationSeconds: string;
  sceneCountHint: string;
}

async function readError(response: Response) {
  const body = await response.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : `Request failed (${response.status})`;
}

export function NewEpisodeDialog({ filmId, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const [storyText, setStoryText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState<EpisodeForm>({
    title: "",
    useAI: true,
    targetDurationSeconds: "",
    sceneCountHint: "",
  });
  const [analysis, setAnalysis] = useState<EnrichmentResult | null>(null);
  const [revisionRequest, setRevisionRequest] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [textProvider, setTextProvider] = useState<TextProviderName>("openai");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = analyzing || submitting;
  const analysisIsValid = analysis !== null
    && analysis.storyEnriched.trim().length > 0
    && analysis.scenes.every((scene) =>
      scene.title.trim()
      && scene.prompt_en.trim().length >= 10
      && scene.negative_prompt.trim().length >= 3
    )
    && analysis.objects.every((object) => object.name.trim());

  function handleFile(file: File) {
    if (!file.name.endsWith(".md") && !file.name.endsWith(".txt")) {
      addToast("error", t("episode.fileTypeError"));
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setStoryText((event.target?.result as string) ?? "");
      const suggestedTitle = file.name.replace(/\.(md|txt)$/i, "").replace(/[-_]/g, " ");
      setForm((current) => ({ ...current, title: current.title || suggestedTitle }));
    };
    reader.readAsText(file);
  }

  async function analyzeStory(regenerate = false) {
    if (!storyText.trim()) return;
    setAnalyzing(true);
    try {
      const response = await fetch("/api/episodes/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filmId,
          storyRaw: regenerate && analysis ? analysis.storyEnriched : storyText.trim(),
          revisionRequest: regenerate ? revisionRequest.trim() : undefined,
          provider: textProvider,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setAnalysis(await response.json());
      if (regenerate) setRevisionRequest("");
    } catch (error) {
      addToast("error", String(error));
    } finally {
      setAnalyzing(false);
    }
  }

  async function submitEpisode() {
    if (!form.title.trim() || !storyText.trim()) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filmId,
          title: form.title.trim(),
          storyRaw: storyText.trim(),
          targetDurationSeconds: form.targetDurationSeconds
            ? Number(form.targetDurationSeconds)
            : undefined,
          sceneCountHint: !form.useAI && form.sceneCountHint
            ? Number.parseInt(form.sceneCountHint, 10)
            : undefined,
          analysis: form.useAI ? analysis : undefined,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      await onCreated();
      addToast("success", t("episode.createdSuccess"));
      onClose();
    } catch (error) {
      addToast("error", String(error));
    } finally {
      setSubmitting(false);
    }
  }

  function updateScene(index: number, patch: Partial<EnrichmentResult["scenes"][number]>) {
    setAnalysis((current) => current && ({
      ...current,
      scenes: current.scenes.map((scene, sceneIndex) =>
        sceneIndex === index ? { ...scene, ...patch } : scene
      ),
    }));
  }

  function updateObject(index: number, patch: Partial<EnrichmentResult["objects"][number]>) {
    setAnalysis((current) => current && ({
      ...current,
      objects: current.objects.map((object, objectIndex) =>
        objectIndex === index ? { ...object, ...patch } : object
      ),
    }));
  }

  return (
    <ModalDialog
      title={analysis ? t("episode.previewTitle") : t("episode.createNew")}
      icon={analysis ? (
        <button className="icon-btn" onClick={() => setAnalysis(null)} disabled={busy} title={t("common.back")}>
          <IconArrowLeft size={16} />
        </button>
      ) : undefined}
      headerMeta={analysis ? (
        <span className="episode-preview-count">
          {analysis.scenes.length} {t("common.scenes")} · {analysis.objects.length} {t("episode.storyElements")}
        </span>
      ) : undefined}
      onClose={onClose}
      busy={busy}
      width={analysis ? "min(1120px, 100%)" : "min(620px, 100%)"}
      maxHeight="calc(100vh - 40px)"
      className="episode-dialog-workspace"
      bodyClassName="episode-dialog-content"
      zIndex={100}
      footer={
        <>
          <button className="btn" onClick={analysis ? () => setAnalysis(null) : onClose} disabled={busy}>
            {analysis ? t("common.back") : t("common.cancel")}
          </button>
          {!analysis && form.useAI ? (
            <button
              className="btn-p"
              onClick={() => analyzeStory(false)}
              disabled={analyzing || !form.title.trim() || !storyText.trim()}
            >
              <IconSparkles className={analyzing ? "loading-spinner" : ""} size={15} />
              {analyzing ? t("episode.analyzingPreview") : t("episode.analyzePreview")}
            </button>
          ) : (
            <button
              className="btn-p"
              onClick={submitEpisode}
              disabled={submitting || !form.title.trim() || !storyText.trim() || (form.useAI && !analysisIsValid)}
            >
              <IconCheck className={submitting ? "loading-spinner" : ""} size={15} />
              {submitting ? t("episode.importing") : t("episode.confirmCreate")}
            </button>
          )}
        </>
      }
    >
        {!analysis ? (
          <div className="episode-dialog-form">
            <div className="episode-story-field">
              <label className="form-label">{t("episode.storyLabel")} *</label>
              <textarea
                value={storyText}
                onChange={(event) => setStoryText(event.target.value)}
                placeholder={t("episode.storyPlaceholder")}
                autoFocus
                onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  const file = event.dataTransfer.files[0];
                  if (file) handleFile(file);
                }}
              />
              <div className="episode-story-meta">
                <button
                  type="button"
                  className={`episode-file-button ${dragOver ? "is-dragging" : ""}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <IconFileText size={15} />
                  {t("episode.uploadStory")}
                </button>
                {storyText.trim() && (
                  <span>{storyText.split(/\s+/).filter(Boolean).length.toLocaleString()} {t("common.words")}</span>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleFile(file);
                  event.target.value = "";
                }}
              />
            </div>

            <div className="episode-form-grid">
              <div className="episode-title-field">
                <label className="form-label">{t("episode.nameLabel")} *</label>
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder={t("episode.namePlaceholder")}
                />
              </div>
              <div>
                <label className="form-label">{t("episode.durationLabel")}</label>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={form.targetDurationSeconds}
                  onChange={(event) => setForm((current) => ({ ...current, targetDurationSeconds: event.target.value }))}
                  placeholder={t("episode.durationPlaceholder")}
                />
              </div>
              {!form.useAI && (
                <div>
                  <label className="form-label">{t("episode.splitScenesLabel")}</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={form.sceneCountHint}
                    onChange={(event) => setForm((current) => ({ ...current, sceneCountHint: event.target.value }))}
                    placeholder={t("episode.sceneCountPlaceholder")}
                  />
                </div>
              )}
            </div>

            <label className={`episode-ai-toggle ${form.useAI ? "is-active" : ""}`}>
              <input
                type="checkbox"
                checked={form.useAI}
                onChange={(event) => setForm((current) => ({ ...current, useAI: event.target.checked }))}
              />
              <IconSparkles size={17} />
              <span>{t("episode.aiPreviewOption")}</span>
            </label>
            {form.useAI && (
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="form-label" style={{ margin: 0 }}>{t("generation.provider")}</span>
                <TextProviderSelect
                  value={textProvider}
                  onChange={setTextProvider}
                  disabled={busy}
                  ariaLabel={t("generation.provider")}
                />
              </label>
            )}
          </div>
        ) : (
          <div className="episode-preview-body">
            <div className="episode-preview-top">
              <section className="episode-plot-editor">
                <div className="episode-preview-section-title">
                  <span>{t("episode.plotPreview")}</span>
                  <span>{analysis.storyEnriched.split(/\s+/).filter(Boolean).length.toLocaleString()} {t("common.words")}</span>
                </div>
                <textarea
                  value={analysis.storyEnriched}
                  onChange={(event) => setAnalysis({ ...analysis, storyEnriched: event.target.value })}
                />
                <div className="episode-revision-bar">
                  <textarea
                    value={revisionRequest}
                    onChange={(event) => setRevisionRequest(event.target.value)}
                    placeholder={t("episode.revisionPlaceholder")}
                  />
                  <button
                    className="btn"
                    onClick={() => analyzeStory(true)}
                    disabled={analyzing || !revisionRequest.trim()}
                  >
                    <IconRefresh className={analyzing ? "loading-spinner" : ""} size={15} />
                    {analyzing ? t("episode.regenerating") : t("episode.regenerate")}
                  </button>
                </div>
              </section>

              <aside className="episode-elements-panel">
                <div className="episode-preview-section-title">
                  <span>{t("episode.charactersAndLocations")}</span>
                </div>
                <div className="episode-elements-list">
                  {analysis.objects.map((object, index) => (
                    <div className="episode-element" key={object.id}>
                      <div className={`episode-element-icon ${object.type}`}>
                        {object.type === "character" ? <IconUser size={15} /> : <IconMapPin size={15} />}
                      </div>
                      <div>
                        <input
                          value={object.name}
                          onChange={(event) => updateObject(index, { name: event.target.value })}
                          aria-label={t("common.name")}
                        />
                        <textarea
                          value={object.description_en}
                          onChange={(event) => updateObject(index, { description_en: event.target.value })}
                          aria-label={t("episode.description")}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            </div>

            <section className="episode-scenes-editor">
              <div className="episode-preview-section-title">
                <span>{t("episode.scenePreview")}</span>
                <span>{analysis.scenes.length} {t("common.scenes")}</span>
              </div>
              <div className="episode-scenes-list">
                {analysis.scenes.map((scene, index) => (
                  <article className="episode-scene-row" key={scene.id}>
                    <span className="episode-scene-number">{String(index + 1).padStart(2, "0")}</span>
                    <div className="episode-scene-fields">
                      <input
                        value={scene.title}
                        onChange={(event) => updateScene(index, { title: event.target.value })}
                        aria-label={t("episode.sceneTitle")}
                        required
                      />
                      <textarea
                        value={scene.prompt_en}
                        onChange={(event) => updateScene(index, { prompt_en: event.target.value })}
                        aria-label={t("episode.scenePrompt")}
                        required
                        minLength={10}
                      />
                      <textarea
                        value={scene.negative_prompt}
                        onChange={(event) => updateScene(index, { negative_prompt: event.target.value })}
                        aria-label={t("episode.sceneNegativePrompt")}
                        placeholder={t("params.negativePromptPlaceholder")}
                        required
                        minLength={3}
                      />
                    </div>
                    <div className="episode-scene-meta">
                      <span>{scene.shot_type}</span>
                      <span>{scene.mood}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

    </ModalDialog>
  );
}
