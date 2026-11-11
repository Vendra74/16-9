import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApertureLoader } from '@/components/aperture';
import { Avatar } from '@/components/avatar';
import { Button, FormMessage } from '@/components/form';
import { PeoplePicker } from '@/components/people-picker';
import { MoreIcon, SendIcon } from '@/components/rail-icons';
import { Colors, FrameRatio, Spacing } from '@/constants/theme';
import { useInbox } from '@/lib/inbox';
import {
  fetchConversation,
  fetchMessage,
  fetchMessages,
  isUnread,
  markRead,
  otherPerson,
  sendMessage,
  startConversation,
  type Conversation,
  type Message,
} from '@/lib/messages';
import { askModeration } from '@/lib/moderation';
import { postImageUrl } from '@/lib/posts';
import { useSession } from '@/lib/session';

const LIST_WIDTH = 250;

function timeLabel(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** Mensagens: conversas à esquerda, a conversa aberta à direita. */
export default function MessagesScreen() {
  const { session } = useSession();
  const me = session?.user.id ?? '';
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ c?: string }>();
  const { conversations, refresh } = useInbox();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = params.c ?? conversations?.[0]?.id ?? null;

  function open(id: string) {
    router.setParams({ c: id });
  }

  async function startWith(personId: string) {
    setPicking(false);
    try {
      const id = await startConversation(personId);
      open(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir a conversa.');
    }
  }

  return (
    <View style={[styles.screen, { paddingRight: insets.right }]}>
      <View style={styles.list}>
        <View style={styles.listHeader}>
          <Text style={styles.title}>Mensagens</Text>
          <Button variant="ghost" title="Nova" onPress={() => setPicking(true)} />
        </View>
        <FormMessage text={error} />
        {conversations === null ? (
          <View style={styles.center}>
            <ApertureLoader size={32} />
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(c) => c.id}
            onRefresh={refresh}
            refreshing={false}
            ListEmptyComponent={
              <Text style={styles.emptySmall}>Nenhuma conversa ainda. Toque em “Nova” ou mande mensagem pelo feed.</Text>
            }
            renderItem={({ item }) => {
              const person = otherPerson(item, me);
              const name = person?.display_name || person?.username || 'Alguém';
              const unread = isUnread(item, me);
              return (
                <Pressable
                  onPress={() => open(item.id)}
                  style={[styles.item, item.id === selected && styles.itemSelected]}>
                  <Avatar name={name} url={person?.avatar_url} size={40} />
                  <View style={styles.itemText}>
                    <View style={styles.itemTop}>
                      <Text style={[styles.itemName, unread && styles.bold]} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={styles.itemTime}>{timeLabel(item.last_message_at)}</Text>
                    </View>
                    <Text style={[styles.itemPreview, unread && styles.unreadPreview]} numberOfLines={1}>
                      {item.last_sender === me ? 'Você: ' : ''}
                      {item.last_message}
                    </Text>
                  </View>
                  {unread ? <View style={styles.dot} /> : null}
                </Pressable>
              );
            }}
          />
        )}
      </View>

      <View style={styles.chat}>
        {selected ? (
          <Chat key={selected} conversationId={selected} me={me} />
        ) : (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Converse com quem publica</Text>
            <Text style={styles.emptyText}>
              Mande mensagem pelo botão de balão num trabalho do feed, ou toque em “Nova” para buscar alguém.
            </Text>
          </View>
        )}
      </View>

      <PeoplePicker
        visible={picking}
        title="Nova conversa"
        onPick={(person) => startWith(person.id)}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

function Chat({ conversationId, me }: { conversationId: string; me: string }) {
  const { onMessage, refresh } = useInbox();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const read = useCallback(() => {
    markRead(conversationId).then(refresh);
  }, [conversationId, refresh]);

  useEffect(() => {
    let active = true;
    Promise.all([fetchConversation(conversationId), fetchMessages(conversationId)])
      .then(([c, list]) => {
        if (!active) return;
        setConversation(c);
        setMessages(list);
        read();
      })
      .catch(() => active && setError('Não foi possível carregar a conversa.'));
    return () => {
      active = false;
    };
  }, [conversationId, read]);

  // Mensagens novas desta conversa chegam em tempo real.
  useEffect(
    () =>
      onMessage(async (incoming) => {
        if (incoming.conversation_id !== conversationId) return;
        const full = incoming.post_id ? await fetchMessage(incoming.id).catch(() => incoming) : incoming;
        setMessages((list) => (list && !list.some((m) => m.id === full.id) ? [full, ...list] : list));
        if (full.sender_id !== me) read();
      }),
    [onMessage, conversationId, me, read],
  );

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendMessage(conversationId, body);
      setText('');
      setMessages((list) => (list && !list.some((m) => m.id === sent.id) ? [sent, ...list] : list));
    } catch {
      setError('Não foi possível enviar. Se você bloqueou ou foi bloqueado, a conversa fica fechada.');
    } finally {
      setSending(false);
    }
  }

  if (!conversation || !messages) {
    return <View style={styles.center}>{error ? <FormMessage text={error} /> : <ApertureLoader size={32} />}</View>;
  }

  const person = otherPerson(conversation, me);
  const name = person?.display_name || person?.username || 'Alguém';

  return (
    <KeyboardAvoidingView style={styles.chatInner} behavior="padding">
      <View style={styles.chatHeader}>
        <Avatar name={name} url={person?.avatar_url} size={32} />
        <View style={styles.flex}>
          <Text style={styles.chatName}>{name}</Text>
          {person ? <Text style={styles.chatHandle}>@{person.username}</Text> : null}
        </View>
        {person ? (
          <Pressable
            hitSlop={10}
            accessibilityLabel="Denunciar ou bloquear"
            onPress={() => askModeration({ id: person.id, name }, {}, () => setBlocked(true))}>
            <MoreIcon color={Colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.messages}
        data={messages}
        inverted
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <Bubble message={item} mine={item.sender_id === me} />}
        ListEmptyComponent={
          <Text style={[styles.emptySmall, styles.flipped]}>Diga oi para {name}.</Text>
        }
      />

      <FormMessage text={error} />
      {blocked ? (
        <Text style={styles.blocked}>Você bloqueou {name}. A conversa está fechada.</Text>
      ) : (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Mensagem"
            placeholderTextColor={Colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            keyboardAppearance="dark"
            selectionColor={Colors.silver}
          />
          <Pressable
            onPress={send}
            disabled={!text.trim() || sending}
            accessibilityLabel="Enviar"
            style={[styles.sendButton, (!text.trim() || sending) && styles.dimmed]}>
            <SendIcon color={Colors.background} size={20} />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, mine }: { message: Message; mine: boolean }) {
  const post = message.post;
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {message.post_id ? (
          post ? (
            <View style={styles.shared}>
              <Image source={{ uri: postImageUrl(post) }} style={styles.sharedImage} contentFit="cover" />
              <Text style={[styles.sharedText, mine && styles.textMine]} numberOfLines={1}>
                {[post.title, post.author && `@${post.author.username}`].filter(Boolean).join(' · ') || 'Trabalho'}
              </Text>
            </View>
          ) : (
            <Text style={[styles.sharedGone, mine && styles.textMine]}>Trabalho indisponível</Text>
          )
        ) : null}
        {message.body ? <Text style={[styles.bubbleText, mine && styles.textMine]}>{message.body}</Text> : null}
        <Text style={[styles.bubbleTime, mine && styles.timeMine]}>{timeLabel(message.created_at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  list: {
    width: LIST_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.border,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Spacing.md,
    paddingTop: Spacing.sm,
  },
  title: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  itemSelected: {
    backgroundColor: Colors.surface,
  },
  itemText: {
    flex: 1,
    gap: 2,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
  },
  itemName: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  bold: {
    fontWeight: '800',
  },
  itemTime: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  itemPreview: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  unreadPreview: {
    color: Colors.text,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5A4F',
  },
  emptySmall: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    padding: Spacing.lg,
  },
  flipped: {
    transform: [{ scaleY: -1 }],
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 380,
  },
  chat: {
    flex: 1,
  },
  chatInner: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  chatName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  chatHandle: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  messages: {
    padding: Spacing.md,
    gap: 6,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  bubbleMine: {
    backgroundColor: Colors.silver,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: Colors.surfaceRaised,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    color: Colors.text,
    fontSize: 15,
  },
  textMine: {
    color: Colors.background,
  },
  bubbleTime: {
    color: Colors.textMuted,
    fontSize: 10,
    alignSelf: 'flex-end',
  },
  timeMine: {
    color: '#5E6066',
  },
  shared: {
    gap: 4,
  },
  sharedImage: {
    width: 240,
    aspectRatio: FrameRatio,
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  sharedText: {
    color: Colors.textSecondary,
    fontSize: 12,
    maxWidth: 240,
  },
  sharedGone: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontStyle: 'italic',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    color: Colors.text,
    fontSize: 15,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.silver,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.4,
  },
  blocked: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    padding: Spacing.md,
  },
});
