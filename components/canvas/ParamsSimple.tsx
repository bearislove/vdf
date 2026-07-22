"use client";

import { useTranslation } from "@/hooks/useTranslation";

export interface SimpleParams {
  promptEn: string;
  negativePrompt: string;
  duration: string;
  aspectRatio: string;
}

interface ParamsSimpleProps {
  values: SimpleParams;
  onChange: (values: Partial<SimpleParams>) => void;
}

const DURATION_PRESETS = [2, 3, 4, 5, 6, 8, 12, 16, 18];
const ASPECT_RATIO_OPTIONS = ["16:9", "9:16", "1:1", "3:2", "2:3"];

export function ParamsSimple({ values, onChange }: ParamsSimpleProps) {
  const { t } = useTranslation();

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <label className="form-label" htmlFor="negative-prompt">
          {t("params.negativePrompt")}
        </label>
        <textarea
          id="negative-prompt"
          value={values.negativePrompt}
          onChange={(event) => onChange({ negativePrompt: event.target.value })}
          rows={3}
          placeholder={t("params.negativePromptPlaceholder")}
          style={{ resize: "vertical" }}
        />
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
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="number" min={1} max={120} step={1} value={values.duration}
            onChange={(e) => { const v = e.target.value; if (v === "" || parseInt(v, 10) > 0) onChange({ duration: v }); }}
            style={{ flex: 1 }}
            className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
            
          />
          <span style={{ fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>
            s
          </span>
        </div>
        </div>

      </div>

      <div style={{ marginBottom: 8 }}>
        <label className="form-label">{t("params.aspectRatio")}</label>
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

    </>
  );
}

export function durationToFrames(duration: string, fps = 24): number {
  const secs = Math.max(1, parseInt(duration, 10) || 1);
  return secs * fps + 1;
}
