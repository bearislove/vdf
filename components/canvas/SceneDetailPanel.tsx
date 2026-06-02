"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useMode } from "@/hooks/useMode";
import { apiPut, apiPost } from "@/lib/utils/api";
import { ParamsSimple, durationToFrames, type SimpleParams } from "./ParamsSimple";
import { ParamsPro } from "./ParamsPro";
import { VariantList } from "./VariantList";
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
  objects?: StoryObject[];
  onUpdate: () => void;
}

const QUALITY_PRESETS: Record<string, { steps: number; guidance: number }> = {
  fast:     { steps: 15, guidance: 3.0 },
  balanced: { steps: 25, guidance: 3.5 },
  high:     { steps: 40, guidance: 3.5 },
};


export function SceneDetailPanel({ scene, onUpdate }: Props) {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const { isPro } = useMode();
  const [simpleParams, setSimpleParams] = useState<SimpleParams>({
    promptEn: scene.promptEnOverride ?? scene.promptEn,
    quality: "balanced",
    duration: "4",
    seed: "-1",
  });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const prompt = simpleParams.promptEn;
  const quality = simpleParams.quality;
  const duration = simpleParams.duration;
  const seed = simpleParams.seed;

  useEffect(() => {
    setSimpleParams((p) => ({ ...p, promptEn: scene.promptEnOverride ?? scene.promptEn }));
  }, [scene.id, scene.promptEn, scene.promptEnOverride]);

  const charCount =
    scene.objectLinks?.filter((l) => l.object?.type === "CHARACTER").length ?? 0;

  const warnings: string[] = [];
  if (charCount === 2) warnings.push(t("generation.warnings.twoCharacters"));
  if (charCount >= 3) warnings.push(t("generation.warnings.threeCharacters"));
  if (scene.shotType === "CLOSE") warnings.push(t("generation.warnings.closeUp"));
  if (parseInt(duration) > 4) warnings.push(t("generation.warnings.longScene"));
  const missingImages = scene.objectLinks?.some(
    (l) => l.object?.type === "CHARACTER" && !l.object.refImages?.length
  );
  if (missingImages) warnings.push(t("generation.warnings.noImage"));

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await apiPut(`/api/scenes/${scene.id}`, {
        promptEnOverride: prompt !== scene.promptEn ? prompt : null,
      });
      onUpdate();
    } catch {
      addToast("error", t("common.error"));
    } finally {
      setSaving(false);
    }
  }, [scene.id, scene.promptEn, prompt, onUpdate, addToast, t]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const preset = QUALITY_PRESETS[quality];
      await apiPost("/api/videos", {
        sceneId: scene.id,
        params: {
          promptEn: prompt,
          numFrames: durationToFrames(duration),
          seed: parseInt(seed) || -1,
          qualityPreset: quality,
          steps: preset.steps,
          guidance: preset.guidance,
          firstFrameStrength: 0.95,
          lastFrameStrength: 0.70,
        },
      });
      addToast("info", t("video.queuedMessage"));
      onUpdate();
    } catch (e) {
      addToast("error", String(e));
    } finally {
      setGenerating(false);
    }
  }, [scene.id, prompt, quality, duration, seed, onUpdate, addToast]);

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

  const handleRemoveObject = async (linkId: string) => {
    await fetch(`/api/scenes/${scene.id}/links/${linkId}`, { method: "DELETE" });
    onUpdate();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "0.5px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <span className="pill pill-done" style={{ marginBottom: 6 }}>
          {t("canvas.selectedScene")}
        </span>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginTop: 4 }}>
          {scene.title || t("canvas.sceneNumber", { n: String(scene.order + 1) })}
        </div>
        <div style={{ fontSize: 11, color: "var(--text2)" }}>
          {scene.shotType} · {scene.mood}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {/* Warnings */}
        {warnings.map((w, i) => (
          <div key={i} className="warning-box">
            ⚠ {w}
          </div>
        ))}

        {/* Prompt */}
        <label className="form-label">{t("params.description")}</label>
        <textarea
          value={prompt}
          onChange={(e) => setSimpleParams((p) => ({ ...p, promptEn: e.target.value }))}
          rows={4}
          style={{ resize: "vertical", marginBottom: 10 }}
        />

        {/* Characters */}
        {(scene.objectLinks?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 10 }}>
            <label className="form-label">{t("canvas.charactersAndObjects")}</label>
            {scene.objectLinks?.map((link) => (
              <div
                key={link.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                  fontSize: 11,
                  color: "var(--text1)",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background:
                      link.role === "main" ? "var(--accent)" : "var(--border2)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{link.object?.name}</span>
                <button
                  onClick={() => handleRemoveObject(link.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text3)",
                    cursor: "pointer",
                    fontSize: 10,
                    padding: 0,
                    width: "auto",
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="divider" />

        <ParamsSimple
          values={simpleParams}
          onChange={(partial) => setSimpleParams((p) => ({ ...p, ...partial }))}
        />

        {isPro && (
          <>
            <div className="divider" />
            <ParamsPro scene={scene as Scene} onUpdate={onUpdate} />
          </>
        )}

        <div className="divider" />

        {/* Actions */}
        <button
          className="rp-btn p"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? `⟳ ${t("common.processing")}` : "▶ " + t("canvas.generate")}
        </button>
        <button className="rp-btn" onClick={handleSave} disabled={saving}>
          {saving ? t("common.processing") : t("common.save")}
        </button>

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

