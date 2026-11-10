import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { fetchConversations, isUnread, type Conversation, type Message } from '@/lib/messages';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Listener = (message: Message) => void;

type InboxState = {
  conversations: Conversation[] | null;
  unreadCount: number;
  refresh: () => Promise<void>;
  /** Recebe cada mensagem nova (de qualquer conversa) assim que chega. */
  onMessage: (listener: Listener) => () => void;
};

const InboxContext = createContext<InboxState>({
  conversations: null,
  unreadCount: 0,
  refresh: async () => {},
  onMessage: () => () => {},
});

/** Lista de conversas e contagem de não lidas, atualizadas em tempo real. */
export function InboxProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const me = session?.user.id;
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const listeners = useRef(new Set<Listener>());

  const refresh = useCallback(async () => {
    try {
      setConversations(await fetchConversations());
    } catch {
      // Sem conexão: mantém o que já tinha.
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    fetchConversations()
      .then(setConversations)
      .catch(() => {});
    const channel = supabase
      .channel(`inbox:${me}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const message = payload.new as Message;
        listeners.current.forEach((listener) => listener(message));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () => {
        refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, refresh]);

  const onMessage = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const unreadCount = me ? (conversations ?? []).filter((c) => isUnread(c, me)).length : 0;

  return <InboxContext value={{ conversations, unreadCount, refresh, onMessage }}>{children}</InboxContext>;
}

export function useInbox() {
  return use(InboxContext);
}
