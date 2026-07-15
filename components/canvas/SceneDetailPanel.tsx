"use client";

import { useState, useEffect, useCallback } from "react";
import { IconLoader2, IconPlayerPlay } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { useSettingsStore } from "@/store/useSettingsStore";
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

export function SceneDetailPanel({ scene, previousScene, onUpdate }: Props) {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const { selectScene } = useCanvasStore();
  const defaultVideoProvider = useSettingsStore((s) => s.videoProvider);
  const [genProvider, setGenProvider] = useState<GenerationProviderName>(defaultVideoProvider);
  const [simpleParams, setSimpleParams] = useState<SimpleParams>({
    promptEn: scene.promptEnOverride ?? scene.promptEn,
    duration: "4",
    aspectRatio: "16:9",
  });
  const [generating, setGenerating] = useState(false);
  const [isSvdModel, setIsSvdModel] = useState(false);

  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then(d => setIsSvdModel(d.isSvd)).catch(() => {});
  }, []);

  const prompt = simpleParams.promptEn;
  const duration = simpleParams.duration;

  useEffect(() => {
    setSimpleParams((p) => ({
      ...p,
      promptEn: scene.promptEnOverride ?? scene.promptEn,
    }));
  }, [scene.id, scene.promptEn, scene.promptEnOverride]);

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
  }, [scene.id, prompt, duration, simpleParams.aspectRatio, genProvider, onUpdate, addToast, t]);

  const handleSelectVariant = async (variantId: string) => {
    await apiPut(`/api/scenes/${scene.id}`, { selectedVideoId: variantId });
    onUpdate();
  };

  const handleDeleteVariant = async (variantId: string) => {
    await fetch(`/api/videos/${variantId}`, { method: "DELETE" });
    onUpdate();
  };

  const handleRecoverVariant = async (variantId: string) => {
    await fetch(`/api/videos/${variantId}/recover`, { method: "POST" });
    onUpdate();
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
        <label className="form-label">{t("params.description")}</label>
        <textarea
          value={prompt}
          onChange={(e) => setSimpleParams((p) => ({ ...p, promptEn: e.target.value }))}
          rows={4}
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
          prompt={prompt}
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
              onRecover={handleRecoverVariant}
            />
          </>
        )}
      </div>

    </div>
  );
}
