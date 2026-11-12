import * as WebBrowser from 'expo-web-browser';

/** Páginas públicas do 16:9 (GitHub Pages, pasta docs/ do repositório). */
const SITE = 'https://vendra74.github.io/16-9';

export const TERMS_URL = `${SITE}/termos.html`;
export const PRIVACY_URL = `${SITE}/privacidade.html`;

export function openTerms() {
  return WebBrowser.openBrowserAsync(TERMS_URL);
}

export function openPrivacy() {
  return WebBrowser.openBrowserAsync(PRIVACY_URL);
}
