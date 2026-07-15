"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { useSettingsStore } from "@/store/useSettingsStore";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";

export function AIProviderSettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore();

  return (
    <SettingsSection title={t("settings.sections.ai")}>

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
    </SettingsSection>
  );
}
