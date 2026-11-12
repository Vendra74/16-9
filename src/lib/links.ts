/** Links do perfil (site, portfólio, redes). O banco aceita até 5. */
export const MAX_LINKS = 5;

const VALID = /^https?:\/\/[^\s/]+\.[^\s]+$/i;

/**
 * Deixa o link no formato salvo: sem espaços e com https:// na frente.
 * Devolve `null` se não parecer um endereço da web.
 */
export function normalizeLink(value: string): string | null {
  let link = value.trim().replace(/\s+/g, '');
  if (!link) return null;
  if (!/^https?:\/\//i.test(link)) link = `https://${link.replace(/^\/+/, '')}`;
  if (link.length > 200 || !VALID.test(link)) return null;
  return link;
}

/** Serviços conhecidos aparecem pelo nome; os outros, pelo endereço do site. */
const SERVICES: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)vimeo\.com$/, 'Vimeo'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)behance\.net$/, 'Behance'],
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)(x\.com|twitter\.com)$/, 'X'],
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)flickr\.com$/, 'Flickr'],
  [/(^|\.)500px\.com$/, '500px'],
  [/(^|\.)imdb\.com$/, 'IMDb'],
  [/(^|\.)artstation\.com$/, 'ArtStation'],
];

/** Nome curto para mostrar o link no perfil. */
export function linkLabel(link: string): string {
  const host = (link.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] ?? '').toLowerCase().replace(/^www\./, '');
  const service = SERVICES.find(([pattern]) => pattern.test(host));
  return service ? service[1] : host;
}
