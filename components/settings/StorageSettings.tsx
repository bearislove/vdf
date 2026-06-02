"use client";

import { useTranslation } from "@/hooks/useTranslation";

export function StorageSettings() {
  const { t } = useTranslation();

  return (
    <div>
      <div
        style={{
          fontSize: 11, fontWeight: 500, color: "var(--text1)",
          paddingBottom: 6, borderBottom: "0.5px solid var(--border)", marginBottom: 9,
        }}
      >
        {t("settings.sections.storage")}
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, fontWeight: 500, color: "var(--text2)", display: "block", marginBottom: 4 }}>
          {t("settings.storage.path")}
        </label>
        <code
          style={{
            fontSize: 10, color: "var(--text2)",
            background: "var(--bg2)", padding: "4px 8px",
            borderRadius: 4, display: "block",
          }}
        >
          ./storage/
        </code>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, fontWeight: 500, color: "var(--text2)", display: "block", marginBottom: 6 }}>
          {t("settings.storage.directoryStructure")}
        </label>
        <div
          style={{
            fontSize: 10, color: "var(--text3)", lineHeight: 2,
            background: "var(--bg2)", borderRadius: 5, padding: "8px 12px",
            fontFamily: "monospace",
          }}
        >
          storage/<br />
          ├── films/&#123;filmId&#125;/<br />
          │&nbsp;&nbsp; └── episodes/&#123;episodeId&#125;/<br />
          │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ├── objects/&#123;objectId&#125;/<br />
          │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; │&nbsp;&nbsp; ├── ref_images/<br />
          │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; │&nbsp;&nbsp; └── audio_ref.wav<br />
          │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; └── scenes/&#123;sceneId&#125;/<br />
          │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; └── variants/&#123;variantId&#125;/<br />
          │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ├── video.webp<br />
          │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ├── thumbnail.png<br />
          │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; └── last_frame.png<br />
          └── exports/
        </div>
      </div>

      <div
        style={{
          background: "var(--bg2)", borderRadius: 5, padding: "8px 12px",
          fontSize: 10, color: "var(--text3)",
        }}
      >
        {t("settings.storage.fileServeInfo")}
      </div>
    </div>
  );
}
