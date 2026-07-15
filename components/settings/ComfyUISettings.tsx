"use client";

import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useSettingsStore } from "@/store/useSettingsStore";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";
import type { ComfyUIStatus } from "@/types/comfyui";

interface ComfyUISettingsProps {
  status: ComfyUIStatus;
}

export function ComfyUISettings({ status }: ComfyUISettingsProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      await fetch("/api/comfyui/status");
    } finally {
      setTesting(false);
    }
  };

  return (
    <SettingsSection
      title={t("settings.sections.comfyui")}
      action={
        <span
          style={{
            fontSize: 10,
            color: status.connected ? "var(--green)" : "var(--red)",
            background: status.connected ? "var(--green-dim)" : "var(--red-dim)",
            padding: "2px 7px", borderRadius: 3,
          }}
        >
          {status.connected ? t("settings.comfyui.connected") : t("settings.comfyui.disconnected")}
          {status.version ? ` v${status.version}` : ""}
        </span>
      }
    >

      <SettingsRow label={t("settings.comfyui.url")}>
        <input value={settings.comfyuiUrl} onChange={(e) => settings.setComfyuiUrl(e.target.value)} />
      </SettingsRow>
      <SettingsRow label={t("settings.comfyui.timeout")}>
        <input
          type="number"
          value={settings.comfyuiTimeout}
          onChange={(e) => settings.setComfyuiTimeout(parseInt(e.target.value) || 300)}
        />
      </SettingsRow>

      <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 10, marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-sm" onClick={handleTest} disabled={testing}>
          {testing ? "⟳" : t("settings.comfyui.test")}
        </button>
      </div>
    </SettingsSection>
  );
}
