import * as WebBrowser from 'expo-web-browser';

/** Páginas públicas do 16:9 (GitHub Pages da pasta docs/, no domínio próprio). */
const SITE = 'https://sixteennine.com.br';

export const TERMS_URL = `${SITE}/termos.html`;
export const PRIVACY_URL = `${SITE}/privacidade.html`;

/** E-mail de contato da equipe. */
export const CONTACT_EMAIL = 'contato@sixteennine.com.br';

export function openTerms() {
  return WebBrowser.openBrowserAsync(TERMS_URL);
}

export function openPrivacy() {
  return WebBrowser.openBrowserAsync(PRIVACY_URL);
}
