"use client";

import { useRef, useState } from "react";
import {
  IconArrowLeft,
  IconCheck,
  IconFileText,
  IconMapPin,
  IconPencil,
  IconRefresh,
  IconSparkles,
  IconUser,
} from "@tabler/icons-react";
import { useTranslation } from "@/hooks/useTranslation";
import { apiPost } from "@/lib/utils/api";
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
  targetDurationSeconds: string;
  sceneCountHint: string;
}

export function NewEpisodeDialog({ filmId, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const [storyText, setStoryText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState<EpisodeForm>({
    title: "",
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
      const result = await apiPost<EnrichmentResult>("/api/episodes/preview", {
        filmId,
        storyRaw: regenerate && analysis ? analysis.storyEnriched : storyText.trim(),
        revisionRequest: regenerate ? revisionRequest.trim() : undefined,
        provider: textProvider,
      });
      setAnalysis(result);
      if (regenerate) setRevisionRequest("");
    } catch (error) {
      addToast("error", String(error));
    } finally {
      setAnalyzing(false);
    }
  }

  async function submitEpisode(withAnalysis: boolean) {
    if (!form.title.trim() || !storyText.trim()) return;
    setSubmitting(true);
    try {
      await apiPost("/api/episodes", {
        filmId,
        title: form.title.trim(),
        storyRaw: storyText.trim(),
        targetDurationSeconds: form.targetDurationSeconds
          ? Number(form.targetDurationSeconds)
          : undefined,
        sceneCountHint: !withAnalysis && form.sceneCountHint
          ? Number.parseInt(form.sceneCountHint, 10)
          : undefined,
        analysis: withAnalysis ? analysis : undefined,
      });
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
          {!analysis ? (
            <>
              <button
                className="btn"
                onClick={() => submitEpisode(false)}
                disabled={submitting || analyzing || !form.title.trim() || !storyText.trim()}
              >
                <IconPencil className={submitting ? "loading-spinner" : ""} size={15} />
                {submitting ? t("episode.importing") : t("episode.createManually")}
              </button>
              <button
                className="btn-p"
                onClick={() => analyzeStory(false)}
                disabled={analyzing || submitting || !form.title.trim() || !storyText.trim()}
              >
                <IconSparkles className={analyzing ? "loading-spinner" : ""} size={15} />
                {analyzing ? t("episode.analyzingPreview") : t("episode.analyzePreview")}
              </button>
            </>
          ) : (
            <button
              className="btn-p"
              onClick={() => submitEpisode(true)}
              disabled={submitting || !analysisIsValid}
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
              <label className="form-label" htmlFor="episode-story">{t("episode.storyLabel")} *</label>
              <textarea
                id="episode-story"
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
                <label className="form-label" htmlFor="episode-title">{t("episode.nameLabel")} *</label>
                <input
                  id="episode-title"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder={t("episode.namePlaceholder")}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="episode-duration">{t("episode.durationLabel")}</label>
                <input
                  id="episode-duration"
                  type="number"
                  min={0}
                  step={10}
                  value={form.targetDurationSeconds}
                  onChange={(event) => setForm((current) => ({ ...current, targetDurationSeconds: event.target.value }))}
                  placeholder={t("episode.durationPlaceholder")}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="episode-scene-count">{t("episode.splitScenesLabel")}</label>
                <input
                  id="episode-scene-count"
                  type="number"
                  min={1}
                  max={500}
                  value={form.sceneCountHint}
                  onChange={(event) => setForm((current) => ({ ...current, sceneCountHint: event.target.value }))}
                  placeholder={t("episode.sceneCountPlaceholder")}
                />
              </div>
            </div>

            <div className="episode-provider-field">
              <label className="form-label" htmlFor="episode-text-provider">{t("generation.provider")}</label>
              <TextProviderSelect
                id="episode-text-provider"
                value={textProvider}
                onChange={setTextProvider}
                disabled={busy}
                ariaLabel={t("generation.provider")}
              />
            </div>
          </div>
        ) : (
          <div className="episode-preview-body">
            <div className="episode-preview-top">
              <section className="episode-plot-editor">
                <label className="episode-preview-section-title" htmlFor="episode-enriched-story">
                  <span>{t("episode.plotPreview")}</span>
                  <span>{analysis.storyEnriched.split(/\s+/).filter(Boolean).length.toLocaleString()} {t("common.words")}</span>
                </label>
                <textarea
                  id="episode-enriched-story"
                  value={analysis.storyEnriched}
                  onChange={(event) => setAnalysis({ ...analysis, storyEnriched: event.target.value })}
                />
                <div className="episode-revision-field">
                  <label className="form-label" htmlFor="episode-revision-request">
                    {t("episode.revisionLabel")}
                  </label>
                  <div className="episode-revision-bar">
                    <textarea
                      id="episode-revision-request"
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
                      <div className="episode-element-fields">
                        <label className="episode-field-label" htmlFor={`episode-object-${index}-name`}>
                          {t("common.name")}
                        </label>
                        <input
                          id={`episode-object-${index}-name`}
                          value={object.name}
                          onChange={(event) => updateObject(index, { name: event.target.value })}
                        />
                        <label className="episode-field-label" htmlFor={`episode-object-${index}-description`}>
                          {t("episode.description")}
                        </label>
                        <textarea
                          id={`episode-object-${index}-description`}
                          value={object.description_en}
                          onChange={(event) => updateObject(index, { description_en: event.target.value })}
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
                      <div className="episode-field-group">
                        <label className="episode-field-label" htmlFor={`episode-scene-${index}-title`}>
                          {t("episode.sceneTitle")}
                        </label>
                        <input
                          id={`episode-scene-${index}-title`}
                          value={scene.title}
                          onChange={(event) => updateScene(index, { title: event.target.value })}
                          required
                        />
                      </div>
                      <div className="episode-field-group">
                        <label className="episode-field-label" htmlFor={`episode-scene-${index}-prompt`}>
                          {t("episode.scenePrompt")}
                        </label>
                        <textarea
                          id={`episode-scene-${index}-prompt`}
                          value={scene.prompt_en}
                          onChange={(event) => updateScene(index, { prompt_en: event.target.value })}
                          required
                          minLength={10}
                        />
                      </div>
                      <div className="episode-field-group">
                        <label className="episode-field-label" htmlFor={`episode-scene-${index}-negative-prompt`}>
                          {t("episode.sceneNegativePrompt")}
                        </label>
                        <textarea
                          id={`episode-scene-${index}-negative-prompt`}
                          value={scene.negative_prompt}
                          onChange={(event) => updateScene(index, { negative_prompt: event.target.value })}
                          placeholder={t("params.negativePromptPlaceholder")}
                          required
                          minLength={3}
                        />
                      </div>
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
