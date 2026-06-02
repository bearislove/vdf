"use client";

import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useSettingsStore } from "@/store/useSettingsStore";
import type { ComfyUIStatus } from "@/types/comfyui";

interface ComfyUISettingsProps {
  status: ComfyUIStatus;
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
      <label style={{ fontSize: 11, color: "var(--text2)", width: 110, flexShrink: 0 }}>{label}</label>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

export function ComfyUISettings({ status }: ComfyUISettingsProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    await fetch("/api/comfyui/status");
    setTesting(false);
  };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => setSaving(false), 500);
  };

  return (
    <div>
      <div
        style={{
          fontSize: 11, fontWeight: 500, color: "var(--text1)",
          paddingBottom: 6, borderBottom: "0.5px solid var(--border)", marginBottom: 9,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        {t("settings.sections.comfyui")}
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
      </div>

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

      <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 10, marginTop: 8, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-sm" onClick={handleTest} disabled={testing}>
          {testing ? "⟳" : t("settings.comfyui.test")}
        </button>
        <button className="btn-p btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? "⟳" : t("common.save")}
        </button>
      </div>
    </div>
  );
}
