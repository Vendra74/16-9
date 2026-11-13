import { Image } from 'expo-image';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
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
import { VoiceBubble, VoiceRecorder } from '@/components/voice';
import { MediaThumb, MediaViewer, pickMedia } from '@/components/message-media';
import { PeoplePicker } from '@/components/people-picker';
import { MicIcon, MoreIcon, PublishIcon, ReceiptIcon, SendIcon } from '@/components/rail-icons';
import { Colors, FrameRatio, Spacing } from '@/constants/theme';
import { useInbox } from '@/lib/inbox';
import {
  deleteMessage,
  fetchConversation,
  fetchMessage,
  fetchMessages,
  isBlockedByMe,
  isUnread,
  markRead,
  otherPerson,
  previewText,
  receiptOf,
  sendMedia,
  sendVoice,
  sendMessage,
  startConversation,
  unblockUser,
  type Conversation,
  type Message,
  type Presence,
  type Receipt,
} from '@/lib/messages';
import { askModeration } from '@/lib/moderation';
import { postImageUrl } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { dateLocale, t } from '@/lib/i18n';

const LIST_WIDTH = 250;

function timeLabel(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit' });
}

/** Verde de "online": o único ponto de cor da tela, de propósito. */
const ONLINE = '#34C759';

/** "online", ou quando a pessoa esteve com o app aberto pela última vez. */
function presenceLabel(presence: Presence) {
  if (presence.online) return t('online');
  const seen = new Date(presence.last_seen_at);
  const time = seen.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (seen.toDateString() === today.toDateString()) return t('visto por último às {time}', { time });
  if (seen.toDateString() === yesterday.toDateString()) return t('visto por último ontem às {time}', { time });
  const date = seen.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit' });
  return t('visto por último em {date} às {time}', { date, time });
}

/** Azul de "lida": um tom para o balão claro, outro para o fundo escuro da lista. */
const READ_ON_LIGHT = '#0A6CFF';
const READ_ON_DARK = '#4DA3FF';

/** As setinhas de uma mensagem minha: enviada, recebida, lida. */
function ReceiptMark({ receipt, onDark }: { receipt: Receipt; onDark?: boolean }) {
  const label = receipt === 'read' ? t('Lida') : receipt === 'delivered' ? t('Recebida') : t('Enviada');
  const idle = onDark ? Colors.textMuted : '#5E6066';
  const read = onDark ? READ_ON_DARK : READ_ON_LIGHT;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <ReceiptIcon color={receipt === 'read' ? read : idle} both={receipt !== 'sent'} size={onDark ? 13 : 12} />
    </View>
  );
}

/** Mensagens: conversas à esquerda, a conversa aberta à direita. */
export default function MessagesScreen() {
  const { session } = useSession();
  const me = session?.user.id ?? '';
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ c?: string }>();
  const { conversations, presence, refresh } = useInbox();
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
      setError(e instanceof Error ? e.message : t('Não foi possível abrir a conversa.'));
    }
  }

  return (
    <View style={[styles.screen, { paddingRight: insets.right }]}>
      <View style={styles.list}>
        <View style={styles.listHeader}>
          <Text style={styles.title}>{t('Mensagens')}</Text>
          <Button variant="ghost" title={t('Nova')} onPress={() => setPicking(true)} />
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
              <Text style={styles.emptySmall}>{t('Nenhuma conversa ainda. Toque em “Nova” ou mande mensagem pelo feed.')}</Text>
            }
            renderItem={({ item }) => {
              const person = otherPerson(item, me);
              const name = person?.display_name || person?.username || t('Alguém');
              const unread = isUnread(item, me);
              return (
                <Pressable
                  onPress={() => open(item.id)}
                  style={[styles.item, item.id === selected && styles.itemSelected]}>
                  <View>
                    <Avatar name={name} url={person?.avatar_url} size={40} />
                    {person && presence[person.id]?.online ? (
                      <View style={styles.onlineDot} accessible accessibilityLabel={t('online')} />
                    ) : null}
                  </View>
                  <View style={styles.itemText}>
                    <View style={styles.itemTop}>
                      <Text style={[styles.itemName, unread && styles.bold]} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={styles.itemTime}>{timeLabel(item.last_message_at)}</Text>
                    </View>
                    <View style={styles.itemBottom}>
                      {item.last_sender === me && item.last_message_at ? (
                        <ReceiptMark receipt={receiptOf(item.last_message_at, item, me)} onDark />
                      ) : null}
                      <Text style={[styles.itemPreview, unread && styles.unreadPreview]} numberOfLines={1}>
                        {item.last_sender === me ? t('Você: ') : ''}
                        {previewText(item.last_message)}
                      </Text>
                    </View>
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
            <Text style={styles.emptyTitle}>{t('Converse com quem publica')}</Text>
            <Text style={styles.emptyText}>
              {t('Mande mensagem pelo botão de balão num trabalho do feed, ou toque em “Nova” para buscar alguém.')}
            </Text>
          </View>
        )}
      </View>

      <PeoplePicker
        visible={picking}
        title={t('Nova conversa')}
        onPick={(person) => startWith(person.id)}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

function Chat({ conversationId, me }: { conversationId: string; me: string }) {
  const { conversations, presence, onMessage, onDeleted, refresh } = useInbox();
  const focused = useIsFocused();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  /** Andamento do envio de uma foto ou vídeo; `null` quando não há envio. */
  const [step, setStep] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Message | null>(null);
  /** Gravando uma mensagem de voz: a barra de gravação toma o lugar do campo de texto. */
  const [recording, setRecording] = useState(false);
  /** A mensagem de voz que está tocando; uma de cada vez. */
  const [playing, setPlaying] = useState<string | null>(null);
  const processing = messages?.some((m) => m.status === 'processing') ?? false;

  // Como a lista de conversas vê esta conversa agora: é por ela que se sabe de novidade.
  const listed = conversations?.find((c) => c.id === conversationId);
  const lastAt = listed?.last_message_at ?? null;
  const unread = listed ? isUnread(listed, me) : false;

  /** Junta o que veio do servidor com o que já está na tela, sem repetir nem perder nada. */
  const merge = useCallback((list: Message[]) => {
    setMessages((current) => {
      const known = new Set(list.map((m) => m.id));
      const newestListed = list[0]?.created_at ?? '';
      // Mantém o que acabou de sair daqui e o servidor ainda não devolveu.
      const extra = (current ?? []).filter((m) => !known.has(m.id) && m.created_at > newestListed);
      return [...extra, ...list];
    });
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([fetchConversation(conversationId), fetchMessages(conversationId)])
      .then(([c, list]) => {
        if (!active) return;
        setConversation(c);
        merge(list);
        // Se você já tinha bloqueado a pessoa, a conversa abre fechada, com a opção de desbloquear.
        const other = c.user_a === me ? c.user_b : c.user_a;
        isBlockedByMe(other)
          .then((is) => active && setBlocked(is))
          .catch(() => {});
      })
      .catch(() => active && setError(t('Não foi possível carregar a conversa.')));
    return () => {
      active = false;
    };
  }, [conversationId, merge, me]);

  // Mensagem apagada (por qualquer um dos dois) some da tela na hora.
  useEffect(
    () => onDeleted((id) => setMessages((list) => list?.filter((m) => m.id !== id) ?? null)),
    [onDeleted],
  );

  // Mensagens novas desta conversa chegam em tempo real.
  useEffect(
    () =>
      onMessage(async (incoming) => {
        if (incoming.conversation_id !== conversationId) return;
        const full = incoming.post_id ? await fetchMessage(incoming.id).catch(() => incoming) : incoming;
        setMessages((list) => (list && !list.some((m) => m.id === full.id) ? [full, ...list] : list));
      }),
    [onMessage, conversationId],
  );

  // O tempo real pode falhar (app em segundo plano, rede oscilando). Quando a
  // lista de conversas mostra uma mensagem mais nova que a última desta tela,
  // busca de novo. Uma vez por novidade, para não ficar repetindo.
  const newest = messages?.[0]?.created_at ?? null;
  const loaded = messages !== null;
  const synced = useRef<string | null>(null);
  /** Muda para tentar de novo depois de uma falha de rede. */
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setTimeout(() => setAttempt((n) => n + 1), 5000), []);
  useEffect(() => {
    if (!loaded || !lastAt || synced.current === lastAt) return;
    if (newest && new Date(newest) >= new Date(lastAt)) return;
    synced.current = lastAt;
    fetchMessages(conversationId)
      .then(merge)
      .catch(() => {
        synced.current = null;
        retry();
      });
  }, [loaded, lastAt, newest, conversationId, merge, retry, attempt]);

  // Marca como lida só com a conversa de fato na frente da pessoa, e sempre que
  // houver algo não lido: assim o ponto vermelho não fica preso.
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (!focused || !loaded || !unread || !lastAt || marked.current === lastAt) return;
    marked.current = lastAt;
    markRead(conversationId)
      .then(refresh)
      .catch(() => {
        marked.current = null;
        retry();
      });
  }, [focused, loaded, unread, lastAt, conversationId, refresh, retry, attempt]);

  // Enquanto um vídeo da conversa está sendo processado, confere de tempos em tempos se ficou pronto.
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => {
      fetchMessages(conversationId)
        .then(setMessages)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [processing, conversationId]);

  /** Toque longo numa mensagem sua: apagar para as duas pessoas. */
  function confirmDelete(message: Message) {
    Alert.alert(t('Apagar esta mensagem?'), t('Ela some para você e para a outra pessoa. Não dá para desfazer.'), [
      { text: t('Cancelar'), style: 'cancel' },
      {
        text: t('Apagar'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMessage(message);
            setMessages((list) => list?.filter((m) => m.id !== message.id) ?? null);
            refresh();
          } catch {
            Alert.alert(t('Não foi possível apagar'), t('Confira a internet e tente de novo.'));
          }
        },
      },
    ]);
  }

  async function unblock(personId: string) {
    try {
      await unblockUser(personId);
      setBlocked(false);
      setError(null);
    } catch {
      Alert.alert(t('Não foi possível desbloquear'), t('Confira a internet e tente de novo.'));
    }
  }

  async function attach() {
    if (step !== null) return;
    setError(null);
    try {
      const media = await pickMedia();
      if (!media) return;
      setStep(t('Preparando…'));
      const sent = await sendMedia(conversationId, me, media, setStep);
      setMessages((list) => (list && !list.some((m) => m.id === sent.id) ? [sent, ...list] : list));
      refresh();
    } catch {
      setError(t('Não foi possível enviar. Confira a internet e tente de novo.'));
    } finally {
      setStep(null);
    }
  }

  async function sendRecording(uri: string, seconds: number) {
    setRecording(false);
    setError(null);
    setStep(t('Enviando o áudio…'));
    try {
      const sent = await sendVoice(conversationId, me, uri, seconds);
      setMessages((list) => (list && !list.some((m) => m.id === sent.id) ? [sent, ...list] : list));
      refresh();
    } catch {
      setError(t('Não foi possível enviar. Confira a internet e tente de novo.'));
    } finally {
      setStep(null);
    }
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendMessage(conversationId, body);
      setText('');
      setMessages((list) => (list && !list.some((m) => m.id === sent.id) ? [sent, ...list] : list));
      refresh();
    } catch {
      setError(t('Não foi possível enviar. Se você bloqueou ou foi bloqueado, a conversa fica fechada.'));
    } finally {
      setSending(false);
    }
  }

  if (!conversation || !messages) {
    return <View style={styles.center}>{error ? <FormMessage text={error} /> : <ApertureLoader size={32} />}</View>;
  }

  // A lista de conversas é atualizada o tempo todo: é dela que vêm "recebida" e "lida".
  const receipts = listed ?? conversation;
  const person = otherPerson(conversation, me);
  const name = person?.display_name || person?.username || t('Alguém');
  const seen = person ? presence[person.id] : undefined;

  return (
    <KeyboardAvoidingView style={styles.chatInner} behavior="padding">
      <View style={styles.chatHeader}>
        <Avatar name={name} url={person?.avatar_url} size={32} />
        <View style={styles.flex}>
          <Text style={styles.chatName}>{name}</Text>
          {person ? (
            <Text style={styles.chatHandle} numberOfLines={1}>
              @{person.username}
              {seen ? <Text style={seen.online && styles.onlineText}>{'  ·  ' + presenceLabel(seen)}</Text> : null}
            </Text>
          ) : null}
        </View>
        {person ? (
          <Pressable
            hitSlop={10}
            accessibilityLabel={t('Denunciar ou bloquear')}
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
        extraData={receipts}
        renderItem={({ item }) => (
          <Bubble
            message={item}
            mine={item.sender_id === me}
            receipt={item.sender_id === me ? receiptOf(item.created_at, receipts, me) : null}
            playing={playing === item.id}
            // Gravando, não toca: os dois ao mesmo tempo estragam a gravação.
            onPlay={(id) => !recording && setPlaying(id)}
            onOpen={() => setViewing(item)}
            onDelete={() => confirmDelete(item)}
          />
        )}
        ListEmptyComponent={
          <Text style={[styles.emptySmall, styles.flipped]}>{t('Diga oi para {name}.', { name })}</Text>
        }
      />

      <FormMessage text={error} />
      <FormMessage text={step} tone="info" />
      <MediaViewer message={viewing} onClose={() => setViewing(null)} />
      {blocked ? (
        <View style={styles.blockedRow}>
          <Text style={styles.blocked}>{t('Você bloqueou {name}. A conversa está fechada.', { name })}</Text>
          {person ? <Button variant="ghost" title={t('Desbloquear')} onPress={() => unblock(person.id)} /> : null}
        </View>
      ) : recording ? (
        <VoiceRecorder onSend={sendRecording} onCancel={() => setRecording(false)} />
      ) : (
        <View style={styles.inputRow}>
          <Pressable
            onPress={attach}
            disabled={step !== null}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('Enviar foto ou vídeo')}
            style={[styles.attachButton, step !== null && styles.dimmed]}>
            <PublishIcon color={Colors.textSecondary} size={24} />
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder={t('Mensagem')}
            placeholderTextColor={Colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            keyboardAppearance="dark"
            selectionColor={Colors.silver}
          />
          {text.trim() ? (
            <Pressable
              onPress={send}
              disabled={sending}
              accessibilityLabel={t('Enviar')}
              style={[styles.sendButton, sending && styles.dimmed]}>
              <SendIcon color={Colors.background} size={20} />
            </Pressable>
          ) : (
            // Sem texto, o botão vira microfone: tocar começa a gravar.
            <Pressable
              onPress={() => {
                setPlaying(null);
                setRecording(true);
              }}
              disabled={step !== null}
              accessibilityRole="button"
              accessibilityLabel={t('Gravar mensagem de voz')}
              style={[styles.sendButton, step !== null && styles.dimmed]}>
              <MicIcon color={Colors.background} size={20} />
            </Pressable>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function Bubble({
  message,
  mine,
  receipt,
  playing,
  onPlay,
  onOpen,
  onDelete,
}: {
  message: Message;
  mine: boolean;
  /** Só nas minhas mensagens: enviada, recebida ou lida. */
  receipt: Receipt | null;
  playing: boolean;
  onPlay: (id: string | null) => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const post = message.post;
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      <Pressable
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
        onLongPress={mine ? onDelete : undefined}
        delayLongPress={350}
        accessibilityHint={mine ? t('Segure para apagar') : undefined}>
        {message.post_id ? (
          post ? (
            <View style={styles.shared}>
              <Image source={{ uri: postImageUrl(post) }} style={styles.sharedImage} contentFit="cover" />
              <Text style={[styles.sharedText, mine && styles.textMine]} numberOfLines={1}>
                {[post.title, post.author && `@${post.author.username}`].filter(Boolean).join(' · ') || t('Trabalho')}
              </Text>
            </View>
          ) : (
            <Text style={[styles.sharedGone, mine && styles.textMine]}>{t('Trabalho indisponível')}</Text>
          )
        ) : null}
        {message.image_path ? <MediaThumb message={message} onOpen={onOpen} /> : null}
        {message.kind === 'audio' ? <VoiceBubble message={message} mine={mine} active={playing} onPlay={onPlay} /> : null}
        {message.body ? <Text style={[styles.bubbleText, mine && styles.textMine]}>{message.body}</Text> : null}
        <View style={styles.bubbleFoot}>
          <Text style={[styles.bubbleTime, mine && styles.timeMine]}>{timeLabel(message.created_at)}</Text>
          {receipt ? <ReceiptMark receipt={receipt} /> : null}
        </View>
      </Pressable>
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
    flexShrink: 1,
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
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: ONLINE,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  onlineText: {
    color: ONLINE,
  },
  bubbleFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 3,
  },
  bubbleTime: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  itemBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  attachButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
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
