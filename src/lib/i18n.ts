import { getLocales } from 'expo-localization';

import { de } from '@/locales/de';
import { en } from '@/locales/en';
import { es } from '@/locales/es';
import { fr } from '@/locales/fr';
import { it } from '@/locales/it';

/**
 * Idiomas do app. Os textos nascem em português dentro das telas, sempre
 * passando por `t('…')`; cada outro idioma é um arquivo em src/locales que
 * leva o texto em português à tradução. Texto sem tradução aparece em português.
 */
export type Language = 'pt' | 'en' | 'es' | 'fr' | 'it' | 'de';

const DICTIONARIES: Record<Exclude<Language, 'pt'>, Record<string, string>> = { en, es, fr, it, de };

/** Formato de datas e horas de cada idioma. */
const DATE_LOCALES: Record<Language, string> = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  it: 'it-IT',
  de: 'de-DE',
};

/** O idioma do aparelho, se o app tiver; senão inglês. */
function deviceLanguage(): Language {
  try {
    for (const locale of getLocales()) {
      const code = locale.languageCode?.toLowerCase();
      if (code && code in DATE_LOCALES) return code as Language;
    }
  } catch {
    // Sem acesso ao idioma do aparelho: fica o padrão.
  }
  return 'en';
}

export const language: Language = deviceLanguage();
export const dateLocale = DATE_LOCALES[language];

/**
 * O texto no idioma do aparelho. Trechos entre chaves são trocados pelos
 * valores: `t('Bloquear {name}?', { name })`.
 */
export function t(text: string, values?: Record<string, string | number>) {
  const translated = language === 'pt' ? text : (DICTIONARIES[language][text] ?? text);
  if (!values) return translated;
  return translated.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** Texto com contagem: `plural(n, '{n} trabalho', '{n} trabalhos')`. */
export function plural(count: number, one: string, other: string) {
  return t(count === 1 ? one : other, { n: count });
}
