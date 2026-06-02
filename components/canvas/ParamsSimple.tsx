"use client";

import { useTranslation } from "@/hooks/useTranslation";

export interface SimpleParams {
  promptEn: string;
  quality: "fast" | "balanced" | "high";
  duration: string; // seconds as string, any positive integer
  seed: string;
}

interface ParamsSimpleProps {
  values: SimpleParams;
  onChange: (values: Partial<SimpleParams>) => void;
}

const DURATION_PRESETS = [2, 4, 6, 8, 12, 16, 20];

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

        {/* Preset chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 5 }}>
          {DURATION_PRESETS.map((s) => {
            const active = values.duration === String(s);
            return (
              <button
                key={s}
                onClick={() => onChange({ duration: String(s) })}
                style={{
                  padding: "3px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  border: active ? "0.5px solid var(--accent)" : "0.5px solid var(--border2)",
                  background: active ? "var(--accent-dim)" : "var(--bg2)",
                  color: active ? "var(--accent)" : "var(--text2)",
                  cursor: "pointer",
                  fontWeight: active ? 500 : 400,
                  transition: "all 100ms",
                }}
              >
                {s}s
              </button>
            );
          })}
        </div>

        {/* Custom number input */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="number"
            min={1}
            max={120}
            step={1}
            value={values.duration}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || parseInt(v, 10) > 0) onChange({ duration: v });
            }}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>
            giây · {durationToFrames(values.duration)} frames
          </span>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label className="form-label">{t("params.seed")}</label>
        <input
          value={values.seed}
          onChange={(e) => onChange({ seed: e.target.value })}
          placeholder="-1 (random)"
        />
      </div>
    </>
  );
}

export function durationToFrames(duration: string): number {
  const secs = Math.max(1, parseInt(duration, 10) || 1);
  return secs * 24 + 1;
}
