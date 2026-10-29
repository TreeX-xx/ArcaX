'use client';

import { useMemo } from 'react';
import { useSettingsStore, type Language } from '@/store/settingsStore';
import { ZH_MESSAGES } from './i18n.zh';

export type { Language };

type Vars = Record<string, string | number>;

export const localeFor = (language: Language): string => language === 'zh' ? 'zh-CN' : 'en-US';

export const currentLocale = (): string => localeFor(useSettingsStore.getState().language);

const interpolate = (template: string, vars?: Vars): string => {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
  );
};

/**
 * Translate an English source message. English is the source language, so an
 * untranslated message falls back to the original text instead of breaking.
 * Interpolate named values with `{name}` placeholders.
 */
export function translate(language: Language, message: string, vars?: Vars): string {
  const template = language === 'zh' ? ZH_MESSAGES[message] ?? message : message;
  return interpolate(template, vars);
}

/** Translate using the currently persisted language. For stores and callbacks. */
export function tGlobal(message: string, vars?: Vars): string {
  return translate(useSettingsStore.getState().language, message, vars);
}

export function useI18n() {
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const locale = localeFor(language);
  const t = useMemo(
    () => (message: string, vars?: Vars) => translate(language, message, vars),
    [language]
  );
  return { language, locale, setLanguage, t };
}
