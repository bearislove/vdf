"use client";

import { useCallback, useEffect, useState } from "react";
import { defaultLocale, type Locale } from "@/i18n/config";

type Messages = Record<string, unknown>;

const cache: Partial<Record<Locale, Messages>> = {};

async function loadMessages(locale: Locale): Promise<Messages> {
  if (cache[locale]) return cache[locale]!;
  const msgs = await import(`@/i18n/locales/${locale}.json`);
  cache[locale] = msgs.default;
  return msgs.default;
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
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return defaultLocale;
    return (localStorage.getItem("storyforge_locale") as Locale) ?? defaultLocale;
  });
  const [messages, setMessages] = useState<Messages>({});

  useEffect(() => {
    loadMessages(locale).then(setMessages);
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem("storyforge_locale", l);
    setLocaleState(l);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let str = getNestedValue(messages as Record<string, unknown>, key);
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
