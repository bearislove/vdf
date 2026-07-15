"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { useSettingsStore } from "@/store/useSettingsStore";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";
import type { ComfyUIModels } from "@/types/comfyui";

interface ModelsSettingsProps {
  models: ComfyUIModels;
  loading: boolean;
  onReload: () => void;
}

export function ModelsSettings({ models, loading, onReload }: ModelsSettingsProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();

  const allVideoModels = Array.from(new Set([
    ...(models.checkpoints ?? []),
    ...(models.diffusion_models ?? []),
  ]));

  return (
    <SettingsSection
      title={t("settings.sections.models")}
      action={
        <button className="btn btn-sm" onClick={onReload} disabled={loading}>
          {loading ? "⟳" : t("settings.models.reload")}
        </button>
      }
    >

      <SettingsRow label={t("settings.models.imageModel")}>
        <select value={settings.defaultImageModel} onChange={(e) => settings.setDefaultImageModel(e.target.value)}>
          <option value="">{t("settings.models.selectModel")}</option>
          {(models.checkpoints ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </SettingsRow>

      <SettingsRow label={t("settings.models.videoModel")}>
        <select value={settings.defaultVideoModel} onChange={(e) => settings.setDefaultVideoModel(e.target.value)}>
          <option value="">{t("settings.models.selectModel")}</option>
          {allVideoModels.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </SettingsRow>

      <SettingsRow label={t("settings.models.distilledLora")}>
        <select value={settings.defaultLoraDistilled} onChange={(e) => settings.setDefaultLoraDistilled(e.target.value)}>
          <option value="">{t("settings.models.selectLora")}</option>
          {(models.loras ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </SettingsRow>

      {models.checkpoints?.length === 0 && !loading && (
        <p style={{ fontSize: 10, color: "var(--text3)", marginTop: 8 }}>
          {t("settings.models.loadError")}
        </p>
      )}
    </SettingsSection>
  );
}
