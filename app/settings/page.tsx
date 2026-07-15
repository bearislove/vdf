"use client";

import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { ComfyUISettings } from "@/components/settings/ComfyUISettings";
import { ModelsSettings } from "@/components/settings/ModelsSettings";
import { AIProviderSettings } from "@/components/settings/AIProviderSettings";
import { AgnesAISettings } from "@/components/settings/AgnesAISettings";
import { StorageSettings } from "@/components/settings/StorageSettings";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useTranslation } from "@/hooks/useTranslation";
import { useModels } from "@/hooks/useModels";
import { useComfyUIStatus } from "@/hooks/useComfyUIStatus";

const NAV_KEYS = [
  { key: "comfyui", sectionKey: "settings.sections.comfyui", icon: "⚙" },
  { key: "agnes",   sectionKey: "settings.sections.agnes",   icon: "◆" },
  { key: "models",  sectionKey: "settings.sections.models",  icon: "🤖" },
  { key: "ai",      sectionKey: "settings.sections.ai",      icon: "✨" },
  { key: "storage", sectionKey: "settings.sections.storage", icon: "💾" },
  { key: "about",   sectionKey: "settings.sections.about",   icon: "ℹ" },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const [active, setActive] = useState("comfyui");
  const NAV_ITEMS = NAV_KEYS.map((item) => ({ ...item, label: t(item.sectionKey) }));
  const comfyStatus = useComfyUIStatus(10000);
  const { models, loading: modelsLoading, reload: reloadModels } = useModels();

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg0)" }}>
      <Topbar
        breadcrumbs={[
          { label: t("nav.films"), href: "/films" },
          { label: t("settings.title") },
        ]}
      />
      <main style={{ padding: 20, display: "flex", gap: 12, maxWidth: 900 }}>
        <SettingsNav items={NAV_ITEMS} active={active} onChange={setActive} />

        <div
          style={{
            flex: 1,
            background: "var(--bg1)",
            border: "0.5px solid var(--border)",
            borderRadius: 8,
            padding: 16,
          }}
        >
          {active === "comfyui" && <ComfyUISettings status={comfyStatus} />}
          {active === "agnes"   && <AgnesAISettings />}
          {active === "models"  && <ModelsSettings models={models} loading={modelsLoading} onReload={reloadModels} />}
          {active === "ai"      && <AIProviderSettings />}
          {active === "storage" && <StorageSettings />}

          {active === "about" && (
            <SettingsSection title={t("settings.sections.about")}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 6 }}>
                {t("settings.about.version")}
              </p>
              <p style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.8, marginBottom: 10 }}>
                {t("settings.about.description")}<br />
                {t("settings.about.techStack")}
              </p>
              <div style={{ fontSize: 10, color: "var(--text3)", lineHeight: 1.8 }}>
                <div>Framework: Next.js 14 App Router</div>
                <div>Database: PostgreSQL + Prisma 5</div>
                <div>Canvas: React Flow</div>
                <div>State: Zustand</div>
              </div>
            </SettingsSection>
          )}
        </div>
      </main>
    </div>
  );
}
