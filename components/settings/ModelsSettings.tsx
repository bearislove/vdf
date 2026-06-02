"use client";

import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useSettingsStore } from "@/store/useSettingsStore";
import type { ComfyUIModels } from "@/types/comfyui";

interface ModelsSettingsProps {
  models: ComfyUIModels;
  loading: boolean;
  onReload: () => void;
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
      <label style={{ fontSize: 11, color: "var(--text2)", width: 110, flexShrink: 0 }}>{label}</label>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

export function ModelsSettings({ models, loading, onReload }: ModelsSettingsProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const [saving, setSaving] = useState(false);

  const allVideoModels = [...(models.checkpoints ?? []), ...(models.diffusion_models ?? [])];

  return (
    <div>
      <div
        style={{
          fontSize: 11, fontWeight: 500, color: "var(--text1)",
          paddingBottom: 6, borderBottom: "0.5px solid var(--border)", marginBottom: 9,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        {t("settings.sections.models")}
        <button className="btn btn-sm" onClick={onReload} disabled={loading}>
          {loading ? "⟳" : t("settings.models.reload")}
        </button>
      </div>

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

      <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 10, marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
        <button className="btn-p btn-sm" onClick={() => { setSaving(true); setTimeout(() => setSaving(false), 500); }} disabled={saving}>
          {saving ? "⟳" : t("common.save")}
        </button>
      </div>
    </div>
  );
}
