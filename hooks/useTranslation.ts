"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import viMessages from "@/i18n/locales/vi.json";
import enMessages from "@/i18n/locales/en.json";
import zhMessages from "@/i18n/locales/zh.json";

type Messages = Record<string, unknown>;

const messagesByLocale: Record<Locale, Messages> = {
  vi: viMessages,
  en: enMessages,
  zh: zhMessages,
};

const listeners = new Set<() => void>();
let activeLocale: Locale = defaultLocale;
let browserInitialized = false;

function isLocale(value: string | null): value is Locale {
  return value !== null && (locales as readonly string[]).includes(value);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getLocaleSnapshot() {
  return activeLocale;
}

function updateDocumentLocale(locale: Locale) {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
}

function applyLocale(locale: Locale, persist: boolean) {
  if (persist) localStorage.setItem("vdf_locale", locale);
  updateDocumentLocale(locale);
  if (locale === activeLocale) return;

  activeLocale = locale;
  listeners.forEach((listener) => listener());
}

function initializeBrowserLocale() {
  if (browserInitialized) return;
  browserInitialized = true;

  const savedLocale = localStorage.getItem("vdf_locale");
  applyLocale(isLocale(savedLocale) ? savedLocale : defaultLocale, false);

  window.addEventListener("storage", (event) => {
    if (event.key === "vdf_locale" && isLocale(event.newValue)) {
      applyLocale(event.newValue, false);
    }
  });
}

function getNestedValue(obj: Record<string, unknown>, key: string): string {
  const parts = key.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return key;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : key;
}

export function useTranslation() {
  const locale = useSyncExternalStore(subscribe, getLocaleSnapshot, () => defaultLocale);
  const messages = messagesByLocale[locale];

  useEffect(() => {
    initializeBrowserLocale();
  }, []);

  const setLocale = useCallback((l: Locale) => {
    applyLocale(l, true);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let str = getNestedValue(messages, key);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          str = str.replace(`{${k}}`, String(v));
        });
      }
      return str;
    },
    [messages]
  );

  return { t, locale, setLocale };
}
