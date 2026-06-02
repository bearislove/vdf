"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { apiPut } from "@/lib/utils/api";
import type { Scene } from "@/types/scene";

interface ParamsProProps {
  scene: Scene;
  onUpdate: () => void;
}

export function ParamsPro({ scene, onUpdate }: ParamsProProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* Last-frame chaining toggle */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <label style={{ fontSize: 10, fontWeight: 500, color: "var(--text2)", letterSpacing: "0.04em" }}>
          {t("params.chainFromPrev")}
        </label>
        <button
          onClick={async () => {
            await apiPut(`/api/scenes/${scene.id}`, {
              useLastFrameChaining: !scene.useLastFrameChaining,
            });
            onUpdate();
          }}
          style={{
            width: 36, height: 18, borderRadius: 9, border: "none", cursor: "pointer",
            background: scene.useLastFrameChaining ? "var(--accent)" : "var(--bg3)",
            position: "relative", transition: "background 150ms", flexShrink: 0,
          }}
        >
          <span
            style={{
              position: "absolute", top: 2,
              left: scene.useLastFrameChaining ? 20 : 2,
              width: 14, height: 14, borderRadius: "50%",
              background: "#fff", transition: "left 150ms",
            }}
          />
        </button>
      </div>

      {/* Strategy override */}
      <div style={{ marginBottom: 8 }}>
        <label className="form-label">{t("params.strategy")}</label>
        <select
          value={scene.strategyOverride ?? ""}
          onChange={async (e) => {
            await apiPut(`/api/scenes/${scene.id}`, {
              strategyOverride: e.target.value || null,
            });
            onUpdate();
          }}
        >
          <option value="">{t("params.autoDetect")}</option>
          <option value="T2V">{t("generation.strategy.t2v")}</option>
          <option value="I2V_SINGLE">{t("generation.strategy.i2v_single")}</option>
          <option value="I2V_COMPOSITE">{t("generation.strategy.i2v_composite")}</option>
          <option value="IC_LORA">{t("generation.strategy.ic_lora")}</option>
        </select>
      </div>

      {/* Video model override */}
      <div style={{ marginBottom: 8 }}>
        <label className="form-label">{t("params.videoModelOverride")}</label>
        <input
          defaultValue={scene.videoModel || ""}
          onBlur={async (e) => {
            await apiPut(`/api/scenes/${scene.id}`, { videoModel: e.target.value });
          }}
          placeholder={t("params.videoModelPlaceholder")}
          style={{ fontSize: 10 }}
        />
      </div>
    </>
  );
}
