import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';

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

/** Nome de cada idioma, escrito nele mesmo, para a tela de escolha. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  pt: 'Português',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  de: 'Deutsch',
};

const isLanguage = (code: unknown): code is Language => typeof code === 'string' && code in DATE_LOCALES;

/** O idioma do aparelho, se o app tiver; senão inglês. */
function deviceLanguage(): Language {
  try {
    for (const locale of getLocales()) {
      const code = locale.languageCode?.toLowerCase();
      if (isLanguage(code)) return code;
    }
  } catch {
    // Sem acesso ao idioma do aparelho: fica o padrão.
  }
  return 'en';
}

const STORAGE_KEY = '16x9.language';

/** Idioma escolhido no Perfil; `null` segue o aparelho. */
let chosen: Language | null = null;
let current: Language = deviceLanguage();
/** Falso até a escolha salva no aparelho ser lida. */
let ready = false;
const listeners = new Set<() => void>();

function apply(choice: Language | null) {
  chosen = choice;
  current = choice ?? deviceLanguage();
  ready = true;
  listeners.forEach((listener) => listener());
}

/** Lê a escolha salva. Roda uma vez, na abertura do app. */
export async function loadLanguage() {
  let saved: string | null = null;
  try {
    saved = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    // Sem a escolha salva, segue o aparelho.
  }
  apply(isLanguage(saved) ? saved : null);
}

/** Troca o idioma do app; `null` volta a seguir o aparelho. */
export async function setLanguage(choice: Language | null) {
  apply(choice);
  try {
    if (choice) await AsyncStorage.setItem(STORAGE_KEY, choice);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Vale até fechar o app; na próxima abertura volta a seguir o aparelho.
  }
}

/** O idioma em uso agora. */
export function getLanguage() {
  return current;
}

/** Formato de datas e horas do idioma em uso. */
export function dateLocale() {
  return DATE_LOCALES[current];
}

const getChoice = () => chosen;
const isReady = () => ready;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Para a raiz do app: o idioma em uso (as telas são remontadas quando ele muda),
 * a escolha feita no Perfil e se a escolha salva já foi lida.
 */
export function useLanguage() {
  // O terceiro argumento é só para a versão web, que monta a página no servidor.
  const language = useSyncExternalStore(subscribe, getLanguage, getLanguage);
  const choice = useSyncExternalStore(subscribe, getChoice, getChoice);
  const loaded = useSyncExternalStore(subscribe, isReady, isReady);
  return { language, choice, loaded };
}

/**
 * O texto no idioma em uso. Trechos entre chaves são trocados pelos
 * valores: `t('Bloquear {name}?', { name })`. Chame sempre dentro de uma
 * função (nunca solto no arquivo), para valer o idioma do momento.
 */
export function t(text: string, values?: Record<string, string | number>) {
  const translated = current === 'pt' ? text : (DICTIONARIES[current][text] ?? text);
  if (!values) return translated;
  return translated.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** Texto com contagem: `plural(n, '{n} trabalho', '{n} trabalhos')`. */
export function plural(count: number, one: string, other: string) {
  return t(count === 1 ? one : other, { n: count });
}
