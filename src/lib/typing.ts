import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** De quanto em quanto tempo quem digita avisa de novo. */
const SEND_EVERY_MS = 2500;
/** Sem aviso por este tempo, a pessoa parou de digitar. */
const SHOW_FOR_MS = 5000;

/**
 * "Digitando…" de uma conversa. Passa direto de um aparelho para o outro pelo
 * tempo real, sem gravar nada no banco: `typing` diz se a outra pessoa está
 * escrevendo, e `notify` é chamado a cada tecla de quem escreve aqui.
 */
export function useTyping(conversationId: string, me: string, enabled: boolean) {
  const [typing, setTyping] = useState(false);
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!enabled || !me) return;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const ch = supabase
      .channel(`typing:${conversationId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if ((payload as { user?: string }).user === me) return;
        setTyping(true);
        clearTimeout(hide);
        hide = setTimeout(() => setTyping(false), SHOW_FOR_MS);
      })
      .on('broadcast', { event: 'stop' }, ({ payload }) => {
        if ((payload as { user?: string }).user === me) return;
        clearTimeout(hide);
        setTyping(false);
      })
      .subscribe();
    channel.current = ch;
    return () => {
      clearTimeout(hide);
      channel.current = null;
      supabase.removeChannel(ch);
    };
  }, [conversationId, me, enabled]);

  const notify = useCallback(() => {
    const now = Date.now();
    if (!channel.current || now - lastSent.current < SEND_EVERY_MS) return;
    lastSent.current = now;
    channel.current.send({ type: 'broadcast', event: 'typing', payload: { user: me } }).catch(() => {});
  }, [me]);

  /** Enviou ou apagou o texto: o "digitando…" do outro lado some na hora. */
  const stop = useCallback(() => {
    lastSent.current = 0;
    channel.current?.send({ type: 'broadcast', event: 'stop', payload: { user: me } }).catch(() => {});
  }, [me]);

  return { typing: enabled && typing, notify, stop };
}
