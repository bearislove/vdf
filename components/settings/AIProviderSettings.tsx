"use client";

import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useSettingsStore } from "@/store/useSettingsStore";

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
      <label style={{ fontSize: 11, color: "var(--text2)", width: 110, flexShrink: 0 }}>{label}</label>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

export function AIProviderSettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const [saving, setSaving] = useState(false);

  return (
    <div>
      <div
        style={{
          fontSize: 11, fontWeight: 500, color: "var(--text1)",
          paddingBottom: 6, borderBottom: "0.5px solid var(--border)", marginBottom: 9,
        }}
      >
        {t("settings.sections.ai")}
      </div>

      <div className="warning-box" style={{ marginBottom: 12 }}>
        {t("settings.ai.apiKeyWarning")}
      </div>

      <SettingsRow label={t("settings.ai.provider")}>
        <select
          value={settings.aiProvider}
          onChange={(e) => settings.setAiProvider(e.target.value as "openai" | "ollama")}
        >
          <option value="openai">{t("settings.ai.providers.openai")}</option>
          <option value="ollama">{t("settings.ai.providers.ollama")}</option>
        </select>
      </SettingsRow>

      <SettingsRow label={t("settings.ai.apiUrl")}>
        <input value={settings.aiBaseUrl} onChange={(e) => settings.setAiBaseUrl(e.target.value)} />
      </SettingsRow>

      <SettingsRow label={t("settings.ai.model")}>
        <input
          value={settings.aiModel}
          onChange={(e) => settings.setAiModel(e.target.value)}
          placeholder={t("settings.ai.modelPlaceholder")}
        />
      </SettingsRow>

      <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 10, marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
        <button className="btn-p btn-sm" onClick={() => { setSaving(true); setTimeout(() => setSaving(false), 500); }} disabled={saving}>
          {saving ? "⟳" : t("common.save")}
        </button>
      </div>
    </div>
  );
}
