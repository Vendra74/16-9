/**
 * Identidade visual do 16:9: sala de cinema.
 * Preto profundo de fundo, grafite nos elementos, branco/prata no texto.
 * A imagem é sempre a protagonista; a interface quase desaparece.
 */
export const Colors = {
  background: '#000000',
  surface: '#141416',
  surfaceRaised: '#1E1F22',
  border: '#2A2B2F',
  text: '#F2F2F2',
  textSecondary: '#9A9DA3',
  textMuted: '#5E6066',
  silver: '#D8D8D8',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** Largura do trilho lateral de navegação (fora da área segura). */
export const RailWidth = 72;

/** Proporção única de todo conteúdo publicado. */
export const FrameRatio = 16 / 9;
