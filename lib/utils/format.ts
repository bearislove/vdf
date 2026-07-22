import type { Locale } from "@/i18n/config";

const LOCALE_TAGS: Record<Locale, string> = {
  vi: "vi-VN",
  en: "en-US",
  zh: "zh-CN",
};

export function formatDate(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const absDiffMs = Math.abs(diffMs);
  const formatter = new Intl.RelativeTimeFormat(LOCALE_TAGS[locale], { numeric: "auto" });

  if (absDiffMs < 60_000) return formatter.format(0, "second");
  if (absDiffMs < 60 * 60_000) return formatter.format(-Math.round(diffMs / 60_000), "minute");
  if (absDiffMs < 24 * 60 * 60_000) return formatter.format(-Math.round(diffMs / (60 * 60_000)), "hour");
  if (absDiffMs < 7 * 24 * 60 * 60_000) {
    return formatter.format(-Math.round(diffMs / (24 * 60 * 60_000)), "day");
  }
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale]).format(d);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s > 0 ? `${s}s` : ""}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function framesToSeconds(frames: number, fps = 24): number {
  return frames / fps;
}

export function secondsToFrames(seconds: number, fps = 24): number {
  return Math.round(seconds * fps);
}
