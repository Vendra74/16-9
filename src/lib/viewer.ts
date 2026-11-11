import { router } from 'expo-router';

import type { FeedPost } from '@/lib/posts';

/**
 * A sequência de trabalhos que a tela "viewer" vai mostrar. Fica na memória:
 * quem abre (Explorar, um perfil) já tem a lista carregada, então a tela
 * abre na hora, na mesma ordem, sem buscar de novo.
 */
let current: { posts: FeedPost[]; startId: string } | null = null;

/** Abre os trabalhos em tela cheia, começando pelo escolhido. */
export function openViewer(posts: FeedPost[], startId: string) {
  current = { posts, startId };
  router.push('/viewer');
}

export function viewerContent() {
  return current;
}

/** Vai para uma conversa, fechando antes as telas abertas por cima das abas. */
export function openConversation(c: string) {
  if (router.canDismiss()) router.dismissAll();
  router.navigate({ pathname: '/messages', params: { c } });
}

/** Vai para o seu próprio perfil (aba), fechando as telas abertas por cima. */
export function openMyProfile() {
  if (router.canDismiss()) router.dismissAll();
  router.navigate('/profile');
}
