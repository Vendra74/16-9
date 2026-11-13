import * as Notifications from 'expo-notifications';
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import {
  fetchConversations,
  fetchPresence,
  hasUndelivered,
  isUnread,
  markDelivered,
  setPresence,
  type Conversation,
  type Message,
  type Presence,
} from '@/lib/messages';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Listener = (message: Message) => void;
type DeleteListener = (id: string) => void;

type InboxState = {
  conversations: Conversation[] | null;
  unreadCount: number;
  /** Online / visto por último das pessoas com quem converso, pelo id delas. */
  presence: Record<string, Presence>;
  refresh: () => Promise<void>;
  /** Recebe cada mensagem nova (de qualquer conversa) assim que chega. */
  onMessage: (listener: Listener) => () => void;
  /** Recebe o id de cada mensagem apagada. */
  onDeleted: (listener: DeleteListener) => () => void;
};

const InboxContext = createContext<InboxState>({
  conversations: null,
  unreadCount: 0,
  presence: {},
  refresh: async () => {},
  onMessage: () => () => {},
  onDeleted: () => () => {},
});

/** De quanto em quanto tempo o app avisa que continua aberto. O servidor espera até 90 s. */
const HEARTBEAT_MS = 30000;

/** Rede de segurança: com o app aberto, confere as conversas de tempos em tempos. */
const POLL_MS = 15000;

/**
 * Lista de conversas e contagem de não lidas, atualizadas em tempo real.
 *
 * O tempo real sozinho não basta: a ligação cai quando o app vai para segundo
 * plano ou a rede oscila, e o que chegou nesse intervalo não é reenviado. Por
 * isso a lista também é conferida ao voltar para o app, ao religar, quando
 * chega uma notificação e a cada poucos segundos. A conversa aberta acompanha
 * a lista (ver `Chat`), então nada depende só do tempo real.
 */
export function InboxProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const me = session?.user.id;
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [presence, setPresence_] = useState<Record<string, Presence>>({});
  const listeners = useRef(new Set<Listener>());
  const deleteListeners = useRef(new Set<DeleteListener>());

  /** Religa o tempo real quando a ligação anterior morreu. */
  const [generation, setGeneration] = useState(0);
  const requests = useRef(0);

  const refresh = useCallback(async () => {
    // Várias conferências podem estar no ar: só a mais recente vale, para uma
    // resposta antiga não trazer de volta um "não lida" que já foi lido.
    const request = ++requests.current;
    try {
      const list = await fetchConversations();
      if (request === requests.current) setConversations(list);
      // Buscou, então chegou: quem enviou passa a ver "recebida".
      if (me && list.some((c) => hasUndelivered(c, me))) markDelivered().catch(() => {});
      // Junto com a lista, quem está online agora.
      if (me) {
        const others = list.map((c) => (c.user_a === me ? c.user_b : c.user_a));
        const map = await fetchPresence(others);
        if (request === requests.current) setPresence_(map);
      }
    } catch {
      // Sem conexão: mantém o que já tinha.
    }
  }, [me]);

  useEffect(() => {
    if (!me) return;
    // A primeira busca; as seguintes passam por `refresh`.
    fetchConversations()
      .then((list) => requests.current === 0 && setConversations(list))
      .catch(() => {});
    const channel = supabase
      .channel(`inbox:${me}:${generation}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const message = payload.new as Message;
        listeners.current.forEach((listener) => listener(message));
        refresh();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) deleteListeners.current.forEach((listener) => listener(id));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () => {
        refresh();
      })
      .subscribe((status) => {
        // Ligou (ou religou depois de uma queda): busca o que chegou no intervalo.
        if (status === 'SUBSCRIBED') refresh();
      });

    // De volta ao app: confere as conversas e refaz a ligação se ela caiu de vez.
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      refresh();
      if (channel.state === 'closed' || channel.state === 'errored') setGeneration((n) => n + 1);
    });
    // Notificação com o app aberto é sinal de novidade, mesmo se o tempo real falhou.
    const push =
      Platform.OS === 'web' ? null : Notifications.addNotificationReceivedListener(() => refresh());
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, POLL_MS);

    return () => {
      appState.remove();
      push?.remove();
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [me, refresh, generation]);

  // Presença: avisa que o app está aberto, de tempos em tempos, e avisa ao sair da tela.
  useEffect(() => {
    if (!me) return;
    if (AppState.currentState === 'active') setPresence(true);
    const beat = setInterval(() => {
      if (AppState.currentState === 'active') setPresence(true);
    }, HEARTBEAT_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') setPresence(true);
      // "inactive" é só passagem (central de notificações, pedido de permissão): não conta como sair.
      else if (state === 'background') setPresence(false);
    });
    // No navegador, fechar a aba é o equivalente a sair.
    const leave = () => setPresence(false);
    if (Platform.OS === 'web') window.addEventListener('pagehide', leave);
    return () => {
      clearInterval(beat);
      appState.remove();
      if (Platform.OS === 'web') window.removeEventListener('pagehide', leave);
    };
  }, [me]);

  const onMessage = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const onDeleted = useCallback((listener: DeleteListener) => {
    deleteListeners.current.add(listener);
    return () => {
      deleteListeners.current.delete(listener);
    };
  }, []);

  const unreadCount = me ? (conversations ?? []).filter((c) => isUnread(c, me)).length : 0;

  return <InboxContext value={{ conversations, unreadCount, presence, refresh, onMessage, onDeleted }}>{children}</InboxContext>;
}

export function useInbox() {
  return use(InboxContext);
}
