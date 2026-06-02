"use client";

import { useTranslation } from "@/hooks/useTranslation";

export function EmptyPanel() {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 8,
        padding: 20,
      }}
    >
      <span style={{ fontSize: 28, color: "var(--text3)" }}>👆</span>
      <p
        style={{
          fontSize: 11,
          color: "var(--text2)",
          textAlign: "center",
          lineHeight: 1.8,
        }}
      >
        {t("canvas.noSelection")}
        <br />
        {t("canvas.dragHint")}
      </p>
      <p style={{ fontSize: 10, color: "var(--text3)", textAlign: "center" }}>
        Kéo đối tượng từ panel trái vào scene
      </p>
    </div>
  );
}
