"use client";

import { useTranslation } from "@/hooks/useTranslation";

export interface SimpleParams {
  promptEn: string;
  quality: "fast" | "balanced" | "high";
  duration: string;
  seed: string;
  aspectRatio: string;
  firstFrameStrength: number;
  lastFrameStrength: number;
}

interface ParamsSimpleProps {
  values: SimpleParams;
  onChange: (values: Partial<SimpleParams>) => void;
}

const DURATION_PRESETS = [2, 4, 6, 8, 12, 16, 20];
const ASPECT_RATIO_OPTIONS = ["16:9", "9:16", "1:1", "3:2", "2:3"];

export function ParamsSimple({ values, onChange }: ParamsSimpleProps) {
  const { t } = useTranslation();

  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <label className="form-label">{t("params.quality")}</label>
        <select
          value={values.quality}
          onChange={(e) => onChange({ quality: e.target.value as SimpleParams["quality"] })}
        >
          <option value="fast">{t("params.qualityOptions.fast")}</option>
          <option value="balanced">{t("params.qualityOptions.balanced")}</option>
          <option value="high">{t("params.qualityOptions.high")}</option>
        </select>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label className="form-label">{t("params.duration")}</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 5 }}>
          {DURATION_PRESETS.map((s) => {
            const active = values.duration === String(s);
            return (
              <button
                key={s}
                onClick={() => onChange({ duration: String(s) })}
                style={{
                  padding: "3px 8px", borderRadius: 4, fontSize: 11,
                  border: active ? "0.5px solid var(--accent)" : "0.5px solid var(--border2)",
                  background: active ? "var(--accent-dim)" : "var(--bg2)",
                  color: active ? "var(--accent)" : "var(--text2)",
                  cursor: "pointer", fontWeight: active ? 500 : 400, transition: "all 100ms",
                }}
              >
                {s}s
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="number" min={1} max={120} step={1} value={values.duration}
            onChange={(e) => { const v = e.target.value; if (v === "" || parseInt(v, 10) > 0) onChange({ duration: v }); }}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>
            giây · {durationToFrames(values.duration)} frames
          </span>
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label className="form-label">Aspect Ratio</label>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {ASPECT_RATIO_OPTIONS.map((r) => {
            const active = values.aspectRatio === r;
            return (
              <button
                key={r}
                onClick={() => onChange({ aspectRatio: r })}
                style={{
                  padding: "3px 8px", borderRadius: 4, fontSize: 11,
                  border: active ? "0.5px solid var(--accent)" : "0.5px solid var(--border2)",
                  background: active ? "var(--accent-dim)" : "var(--bg2)",
                  color: active ? "var(--accent)" : "var(--text2)",
                  cursor: "pointer", fontWeight: active ? 500 : 400,
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label className="form-label">{t("params.seed")}</label>
        <input
          value={values.seed}
          onChange={(e) => onChange({ seed: e.target.value })}
          placeholder="-1 (random)"
        />
      </div>

      <div style={{ marginBottom: 8 }}>
        <label className="form-label">
          First Frame Strength
          <span style={{ float: "right", color: "var(--text3)" }}>{values.firstFrameStrength.toFixed(2)}</span>
        </label>
        <input
          type="range" min={0.5} max={1.0} step={0.05}
          value={values.firstFrameStrength}
          onChange={(e) => onChange({ firstFrameStrength: parseFloat(e.target.value) })}
          style={{ width: "100%" }}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label className="form-label">
          Last Frame Strength
          <span style={{ float: "right", color: "var(--text3)" }}>{values.lastFrameStrength.toFixed(2)}</span>
        </label>
        <input
          type="range" min={0.3} max={1.0} step={0.05}
          value={values.lastFrameStrength}
          onChange={(e) => onChange({ lastFrameStrength: parseFloat(e.target.value) })}
          style={{ width: "100%" }}
        />
      </div>
    </>
  );
}

export function durationToFrames(duration: string, fps = 24): number {
  const secs = Math.max(1, parseInt(duration, 10) || 1);
  return secs * fps + 1;
}
