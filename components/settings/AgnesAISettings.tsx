"use client";

import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useSettingsStore } from "@/store/useSettingsStore";
import { SettingsRow } from "./SettingsRow";
import { GenerationProviderSelect } from "@/components/ui/GenerationProviderSelect";
import { SettingsSection } from "./SettingsSection";

export function AgnesAISettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/agnes/status");
      setTestResult(await res.json());
    } catch (e) {
      setTestResult({ ok: false, error: String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <SettingsSection title={t("settings.sections.agnes")}>

      <div className="warning-box" style={{ marginBottom: 12 }}>
        {t("settings.agnes.apiKeyWarning")}
      </div>

      <SettingsRow label={t("settings.agnes.imageProvider")} labelWidth={120}>
        <GenerationProviderSelect
          value={settings.imageProvider}
          onChange={settings.setImageProvider}
          ariaLabel={t("settings.agnes.imageProvider")}
        />
      </SettingsRow>

      <SettingsRow label={t("settings.agnes.videoProvider")} labelWidth={120}>
        <GenerationProviderSelect
          value={settings.videoProvider}
          onChange={settings.setVideoProvider}
          ariaLabel={t("settings.agnes.videoProvider")}
        />
      </SettingsRow>

      <div className="divider" />

      <SettingsRow label={t("settings.agnes.imageModel")} labelWidth={120}>
        <input
          value={settings.agnesImageModel}
          onChange={(e) => settings.setAgnesImageModel(e.target.value)}
          placeholder="agnes-image-2.1-flash"
        />
      </SettingsRow>

      <SettingsRow label={t("settings.agnes.videoModel")} labelWidth={120}>
        <input
          value={settings.agnesVideoModel}
          onChange={(e) => settings.setAgnesVideoModel(e.target.value)}
          placeholder="agnes-video-v2.0"
        />
      </SettingsRow>

      <p style={{ fontSize: 9, color: "var(--text3)", marginTop: 2, marginBottom: 10 }}>
        {t("settings.agnes.modelHint")}
      </p>

      {testResult && (
        <div
          style={{
            fontSize: 10,
            color: testResult.ok ? "var(--green)" : "var(--red)",
            background: testResult.ok ? "var(--green-dim)" : "var(--red-dim)",
            border: `0.5px solid ${testResult.ok ? "var(--green)" : "var(--red)"}`,
            borderRadius: 4,
            padding: "4px 8px",
            marginBottom: 8,
          }}
        >
          {testResult.ok ? t("settings.agnes.connected") : (testResult.error || t("settings.agnes.disconnected"))}
        </div>
      )}

      <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 10, marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-sm" onClick={handleTest} disabled={testing}>
          {testing ? "⟳" : t("settings.agnes.test")}
        </button>
      </div>
    </SettingsSection>
  );
}
