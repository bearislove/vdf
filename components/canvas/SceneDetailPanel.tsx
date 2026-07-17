"use client";

import { useState, useEffect, useCallback } from "react";
import { IconDeviceFloppy, IconLoader2, IconPlayerPlay, IconTextDecrease, IconTextIncrease } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { useTranslation } from "@/hooks/useTranslation";
import { apiPut, apiPost } from "@/lib/utils/api";
import { ParamsSimple, durationToFrames, type SimpleParams } from "./ParamsSimple";
import { VariantList } from "./VariantList";
import { InitialImageManager } from "./InitialImageManager";
import { GenerationProviderSelect } from "@/components/ui/GenerationProviderSelect";
import { DetailPanelHeader } from "@/components/ui/DetailPanelHeader";
import { useCanvasStore } from "@/store/useCanvasStore";
import type { GenerationProviderName } from "@/lib/providers/types";
import type { Scene } from "@/types/scene";
import type { StoryObject } from "@/types/object";
import type { VideoVariant } from "@/types/video";

interface SceneWithLinks extends Omit<Scene, "objectLinks"> {
  objectLinks?: Array<{ id: string; role: string; object: StoryObject }>;
  videoVariants?: VideoVariant[];
  selectedVideo?: VideoVariant | null;
}

interface Props {
  scene: SceneWithLinks;
  previousScene?: SceneWithLinks;
  objects?: StoryObject[];
  onUpdate: () => void;
}

function getSavedParams(scene: SceneWithLinks): SimpleParams {
  const rawDuration = scene.videoParams?.duration;
  const rawFrames = scene.videoParams?.numFrames;
  let duration = "5";

  if ((typeof rawDuration === "string" || typeof rawDuration === "number") && Number(rawDuration) > 0) {
    duration = String(rawDuration);
  } else if (typeof rawFrames === "number" && rawFrames > 1) {
    duration = String(Math.max(1, Math.round((rawFrames - 1) / 24)));
  }

  return {
    promptEn: scene.promptEnOverride ?? scene.promptEn,
    negativePrompt: scene.negativePrompt,
    duration,
    aspectRatio: typeof scene.videoParams?.aspectRatio === "string"
      ? scene.videoParams.aspectRatio
      : "16:9",
  };
}

export function SceneDetailPanel({ scene, previousScene, onUpdate }: Props) {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const { selectScene } = useCanvasStore();
  const [genProvider, setGenProvider] = useState<GenerationProviderName>("agnes");
  const [simpleParams, setSimpleParams] = useState<SimpleParams>(() => getSavedParams(scene));
  const [savedParams, setSavedParams] = useState<SimpleParams>(() => getSavedParams(scene));
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [enhancingDescription, setEnhancingDescription] = useState(false);
  const [simplifyingDescription, setSimplifyingDescription] = useState(false);
  const [isSvdModel, setIsSvdModel] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((response) => response.json())
      .then((config) => {
        setIsSvdModel(config.isSvd);
        if (config.defaultVideoProvider === "agnes" || config.defaultVideoProvider === "comfyui") {
          setGenProvider(config.defaultVideoProvider);
        }
      })
      .catch(() => {});
  }, []);

  const prompt = simpleParams.promptEn;
  const negativePrompt = simpleParams.negativePrompt;
  const duration = simpleParams.duration;

  useEffect(() => {
    const nextParams = getSavedParams(scene);
    setSimpleParams(nextParams);
    setSavedParams(nextParams);
    // A different scene has its own independently persisted editor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id]);

  useEffect(() => {
    setSimpleParams((p) => ({
      ...p,
      promptEn: scene.promptEnOverride ?? scene.promptEn,
    }));
    setSavedParams((p) => ({
      ...p,
      promptEn: scene.promptEnOverride ?? scene.promptEn,
    }));
  }, [scene.id, scene.promptEn, scene.promptEnOverride]);

  const persistedNegativePrompt = scene.negativePrompt;
  useEffect(() => {
    setSimpleParams((p) => ({ ...p, negativePrompt: persistedNegativePrompt }));
    setSavedParams((p) => ({ ...p, negativePrompt: persistedNegativePrompt }));
  }, [scene.id, persistedNegativePrompt]);

  const hasChanges = simpleParams.promptEn !== savedParams.promptEn
    || simpleParams.negativePrompt !== savedParams.negativePrompt
    || simpleParams.duration !== savedParams.duration
    || simpleParams.aspectRatio !== savedParams.aspectRatio;
  const hasValidDuration = /^\d+$/.test(duration) && Number(duration) > 0;

  const hasActiveVideo = scene.videoVariants?.some((variant) =>
    ["QUEUED", "GENERATING_IMAGE", "GENERATING_VIDEO"].includes(variant.status)
  ) ?? false;
  const isVideoGenerating = generating || hasActiveVideo;

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      await apiPost("/api/videos", {
        sceneId: scene.id,
        provider: genProvider,
        params: {
          promptEn: prompt,
          negativePrompt: negativePrompt.trim(),
          numFrames: durationToFrames(duration),
          aspectRatio: simpleParams.aspectRatio,
        },
      });
      addToast("info", t("video.queuedMessage"));
      onUpdate();
    } catch (e) {
      addToast("error", String(e));
    } finally {
      setGenerating(false);
    }
  }, [scene.id, prompt, negativePrompt, duration, simpleParams.aspectRatio, genProvider, onUpdate, addToast, t]);

  const handleSave = useCallback(async () => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt || !hasValidDuration || saving || !hasChanges) return;

    setSaving(true);
    try {
      const nextParams = {
        ...simpleParams,
        promptEn: normalizedPrompt,
        negativePrompt: negativePrompt.trim(),
      };
      await apiPut(`/api/scenes/${scene.id}`, {
        promptEnOverride: normalizedPrompt,
        negativePrompt: nextParams.negativePrompt,
        videoParams: {
          ...scene.videoParams,
          duration: Number(duration),
          numFrames: durationToFrames(duration),
          aspectRatio: simpleParams.aspectRatio,
        },
      });
      setSimpleParams(nextParams);
      setSavedParams(nextParams);
      addToast("success", t("common.success"));
      onUpdate();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [prompt, negativePrompt, hasValidDuration, saving, hasChanges, simpleParams, scene.id, scene.videoParams, duration, addToast, t, onUpdate]);

  const handleSelectVariant = async (variantId: string) => {
    await apiPut(`/api/scenes/${scene.id}`, { selectedVideoId: variantId });
    onUpdate();
  };

  const descriptionBusy = enhancingDescription || simplifyingDescription;

  const rewriteDescription = async (
    endpoint: "enhance-description" | "simplify-description",
    setBusy: (busy: boolean) => void,
    successMessage: string
  ) => {
    if (!prompt.trim() || descriptionBusy || isVideoGenerating) return;
    setBusy(true);
    try {
      const result = await apiPost<{ description: string }>(
        `/api/scenes/${scene.id}/${endpoint}`,
        { description: prompt.trim() }
      );
      await apiPut(`/api/scenes/${scene.id}`, {
        promptEnOverride: result.description,
      });
      setSimpleParams((current) => ({ ...current, promptEn: result.description }));
      addToast("success", successMessage);
      onUpdate();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleEnhanceDescription = () =>
    rewriteDescription("enhance-description", setEnhancingDescription, t("canvas.sceneDescriptionEnhanced"));

  const handleSimplifyDescription = () =>
    rewriteDescription("simplify-description", setSimplifyingDescription, t("canvas.sceneDescriptionSimplified"));

  const handleDeleteVariant = async (variantId: string) => {
    await fetch(`/api/videos/${variantId}`, { method: "DELETE" });
    onUpdate();
  };

  const handleRetryVariant = async (variantId: string) => {
    try {
      const response = await fetch(`/api/videos/${variantId}/retry`, { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.error === "string" ? payload.error : `Retry failed (${response.status})`);
      }
      addToast("info", t("video.queuedMessage"));
      onUpdate();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <DetailPanelHeader
        title={scene.title || t("canvas.sceneNumber", { n: String(scene.order + 1) })}
        meta={`${scene.shotType} · ${scene.mood}`}
        closeLabel={t("common.close")}
        onClose={() => selectScene(null)}
      />

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {/* SVD model warning — prompt has no effect */}
        {isSvdModel && (
          <div style={{
            background: "rgba(255, 150, 0, 0.08)",
            border: "0.5px solid rgba(255, 150, 0, 0.4)",
            borderRadius: 6,
            padding: "8px 10px",
            marginBottom: 10,
            fontSize: 11,
            color: "var(--accent)",
            lineHeight: 1.5,
          }}>
            ⚠ Model hiện tại (<b>SVD</b>) không dùng mô tả văn bản — chỉ animate từ ảnh nhân vật. Các scene sẽ ra video giống nhau nếu dùng cùng ref image.<br />
            <span style={{ color: "var(--text3)" }}>→ Cài WAN hoặc LTX Video model để dùng được prompt mô tả.</span>
          </div>
        )}

        {/* Prompt */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
          <label className="form-label" htmlFor="scene-description" style={{ marginBottom: 0 }}>
            {t("params.description")}
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              className="icon-btn"
              onClick={handleSimplifyDescription}
              disabled={!prompt.trim() || descriptionBusy || isVideoGenerating}
              title={simplifyingDescription
                ? t("canvas.simplifyingSceneDescription")
                : t("canvas.simplifySceneDescription")}
              aria-label={t("canvas.simplifySceneDescription")}
              aria-busy={simplifyingDescription}
              style={{ width: 25, height: 25, color: "var(--accent)" }}
            >
              {simplifyingDescription
                ? <IconLoader2 size={13} className="loading-spinner" aria-hidden="true" />
                : <IconTextDecrease size={14} stroke={1.9} aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={handleEnhanceDescription}
              disabled={!prompt.trim() || descriptionBusy || isVideoGenerating}
              title={enhancingDescription
                ? t("canvas.enhancingSceneDescription")
                : t("canvas.enhanceSceneDescription")}
              aria-label={t("canvas.enhanceSceneDescription")}
              aria-busy={enhancingDescription}
              style={{ width: 25, height: 25, color: "var(--accent)" }}
            >
              {enhancingDescription
                ? <IconLoader2 size={13} className="loading-spinner" aria-hidden="true" />
                : <IconTextIncrease size={14} stroke={1.9} aria-hidden="true" />}
            </button>
          </div>
        </div>
        <textarea
          id="scene-description"
          value={prompt}
          onChange={(e) => setSimpleParams((p) => ({ ...p, promptEn: e.target.value }))}
          rows={8}
          disabled={descriptionBusy}
          style={{ resize: "vertical", marginBottom: 10 }}
        />

        <div className="divider" />

        <ParamsSimple
          values={simpleParams}
          onChange={(partial) => setSimpleParams((p) => ({ ...p, ...partial }))}
        />

        <div className="divider" />

        <InitialImageManager
          scene={scene as Parameters<typeof InitialImageManager>[0]["scene"]}
          previousScene={previousScene as Parameters<typeof InitialImageManager>[0]["previousScene"]}
          aspectRatio={simpleParams.aspectRatio}
          disabled={isVideoGenerating}
          onSceneUpdate={onUpdate}
        />

        <div className="divider" />

        <div style={{ display: "flex", alignItems: "stretch", gap: 7, marginBottom: 10 }}>
          <label style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "var(--text2)", flexShrink: 0 }}>
              {t("generation.provider")}
            </span>
            <GenerationProviderSelect
              modality="video"
              value={genProvider}
              onChange={setGenProvider}
              style={{ minWidth: 0, flex: 1, height: 34 }}
              disabled={isVideoGenerating}
              ariaLabel={t("generation.provider")}
            />
          </label>

          <button
            className="rp-btn p"
            onClick={handleGenerate}
            disabled={isVideoGenerating}
            aria-busy={isVideoGenerating}
            style={{ width: "auto", minHeight: 34, marginBottom: 0, padding: "7px 11px", flexShrink: 0 }}
          >
            {isVideoGenerating ? (
              <>
                <IconLoader2 size={15} stroke={2} className="loading-spinner" aria-hidden="true" />
                {t("canvas.generatingVideo")}
              </>
            ) : (
              <>
                <IconPlayerPlay size={14} fill="currentColor" aria-hidden="true" />
                {t("canvas.generate")}
              </>
            )}
          </button>
        </div>

        {/* Variants */}
        {(scene.videoVariants?.length ?? 0) > 0 && (
          <>
            <div className="divider" />
            <VariantList
              variants={scene.videoVariants ?? []}
              selectedVideoId={scene.selectedVideoId ?? null}
              sceneId={scene.id}
              onSelect={handleSelectVariant}
              onDelete={handleDeleteVariant}
              onRetry={handleRetryVariant}
            />
          </>
        )}
      </div>

      <footer className="detail-panel-footer">
        <button
          type="button"
          className="btn-p"
          onClick={handleSave}
          disabled={saving || descriptionBusy || !hasChanges || !prompt.trim() || !hasValidDuration}
          aria-busy={saving}
        >
          {saving
            ? <IconLoader2 className="loading-spinner" size={15} aria-hidden="true" />
            : <IconDeviceFloppy size={15} aria-hidden="true" />}
          {saving ? t("common.processing") : t("common.save")}
        </button>
      </footer>

    </div>
  );
}
