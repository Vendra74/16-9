import * as Clipboard from 'expo-clipboard';
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

import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { ApertureLoader } from '@/components/aperture';
import { Avatar } from '@/components/avatar';
import { Button, FormMessage } from '@/components/form';
import { LinkedText } from '@/components/linked-text';
import { VoiceBubble, VoiceRecorder } from '@/components/voice';
import { MediaThumb, MediaViewer, pickMedia } from '@/components/message-media';
import { PeoplePicker } from '@/components/people-picker';
import { MicIcon, MoreIcon, MutedIcon, PinIcon, PublishIcon, ReceiptIcon, ReplyIcon, SendIcon } from '@/components/rail-icons';
import { Colors, FrameRatio, Spacing } from '@/constants/theme';
import { useInbox } from '@/lib/inbox';
import {
  REACTIONS,
  acceptConversation,
  canEdit,
  canForward,
  declineConversation,
  deleteMessage,
  editMessage,
  fetchConversation,
  fetchMessage,
  fetchMessages,
  forwardMessage,
  isBlockedByMe,
  isMuted,
  isPendingRequest,
  isPinned,
  isRequest,
  isUnread,
  markRead,
  otherPerson,
  previewText,
  reactToMessage,
  receiptOf,
  sendMedia,
  sendVoice,
  sendMessage,
  setConversationFlags,
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
import { useTyping } from '@/lib/typing';
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

/** Uma linha que resume a mensagem: o texto, ou o tipo quando não há texto. */
function snippet(message: Message) {
  if (message.body) return message.body;
  if (message.kind === 'photo') return t('Foto');
  if (message.kind === 'video') return t('Vídeo');
  if (message.kind === 'audio') return t('Áudio');
  return t('Compartilhou um trabalho');
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
  const { conversations, presence, requestCount, privacy, refresh } = useInbox();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  /** Mostrando a caixa de pedidos em vez das conversas. */
  const [showRequests, setShowRequests] = useState(false);

  // Pedidos ficam numa caixa à parte; nas conversas, as fixadas vêm primeiro.
  const inRequests = showRequests && requestCount > 0;
  const q = query.trim().toLowerCase();
  const visible = (conversations ?? [])
    .filter((c) => isRequest(c, me) === inRequests)
    .filter((c) => {
      if (!q) return true;
      const person = otherPerson(c, me);
      return [person?.display_name, person?.username, c.last_message].some((value) => value?.toLowerCase().includes(q));
    })
    .sort((x, y) => Number(isPinned(y, me)) - Number(isPinned(x, me)));
  const selected = params.c ?? (conversations ?? []).find((c) => !isRequest(c, me))?.id ?? null;

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
        <TextInput
          style={styles.search}
          placeholder={t('Buscar conversas')}
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          keyboardAppearance="dark"
          selectionColor={Colors.silver}
          returnKeyType="search"
        />
        {requestCount > 0 ? (
          <Pressable onPress={() => setShowRequests(!inRequests)} style={styles.requestsRow} accessibilityRole="button">
            <Text style={styles.requestsText}>
              {inRequests ? t('‹ Voltar às conversas') : t('Pedidos de mensagem ({count})', { count: requestCount })}
            </Text>
          </Pressable>
        ) : null}
        <FormMessage text={error} />
        {conversations === null ? (
          <View style={styles.center}>
            <ApertureLoader size={32} />
          </View>
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            onRefresh={refresh}
            refreshing={false}
            ListEmptyComponent={
              <Text style={styles.emptySmall}>
                {q ? t('Nenhuma conversa encontrada.') : t('Nenhuma conversa ainda. Toque em “Nova” ou mande mensagem pelo feed.')}
              </Text>
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
                      {isPinned(item, me) ? <PinIcon color={Colors.textMuted} size={12} /> : null}
                      {isMuted(item, me) ? <MutedIcon color={Colors.textMuted} size={12} /> : null}
                      <Text style={styles.itemTime}>{timeLabel(item.last_message_at)}</Text>
                    </View>
                    <View style={styles.itemBottom}>
                      {item.last_sender === me && item.last_message_at ? (
                        <ReceiptMark receipt={receiptOf(item.last_message_at, item, me, privacy.hide_read)} onDark />
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
  const { conversations, presence, tick, privacy, onMessage, onDeleted, onChanged, refresh } = useInbox();
  const focused = useIsFocused();
  /** A mensagem com o menu aberto (toque longo). */
  const [menuFor, setMenuFor] = useState<Message | null>(null);
  /** A mensagem a que a próxima vai responder. */
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  /** A mensagem sendo editada: o campo de texto passa a alterá-la. */
  const [editing, setEditing] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [conversationMenu, setConversationMenu] = useState(false);
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
  /** Pedido que recebi e ainda não aceitei. */
  const pending = listed ? isRequest(listed, me) : false;
  const { typing, notify: notifyTyping, stop: stopTyping } = useTyping(conversationId, me, focused && !pending);

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

  // Mensagem editada ou com reação nova: troca só o que mudou, mantendo o trabalho compartilhado.
  useEffect(
    () =>
      onChanged((changed) => {
        if (changed.conversation_id !== conversationId) return;
        setMessages((list) => list?.map((m) => (m.id === changed.id ? { ...m, ...changed, post: m.post } : m)) ?? null);
      }),
    [onChanged, conversationId],
  );

  // Edições e reações não mexem na lista de conversas; a conferência periódica cobre
  // o caso de o tempo real ter falhado.
  useEffect(() => {
    if (tick === 0 || !focused) return;
    fetchMessages(conversationId)
      .then(merge)
      .catch(() => {});
  }, [tick, focused, conversationId, merge]);

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
    // Abrir um pedido não avisa quem enviou: só depois de aceitar.
    if (!focused || !loaded || !unread || !lastAt || pending || marked.current === lastAt) return;
    marked.current = lastAt;
    markRead(conversationId)
      .then(refresh)
      .catch(() => {
        marked.current = null;
        retry();
      });
  }, [focused, loaded, unread, lastAt, pending, conversationId, refresh, retry, attempt]);

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
    stopTyping();
    try {
      if (editing) {
        await editMessage(editing.id, body);
        const id = editing.id;
        setMessages((list) => list?.map((m) => (m.id === id ? { ...m, body, edited_at: new Date().toISOString() } : m)) ?? null);
        setEditing(null);
      } else {
        const sent = await sendMessage(conversationId, body, undefined, replyingTo?.id);
        setReplyingTo(null);
        setMessages((list) => (list && !list.some((m) => m.id === sent.id) ? [sent, ...list] : list));
      }
      setText('');
      refresh();
    } catch {
      setError(
        editing
          ? t('Não foi possível editar. Só dá para editar até 15 minutos depois de enviar.')
          : t('Não foi possível enviar. Se você bloqueou ou foi bloqueado, a conversa fica fechada.'),
      );
    } finally {
      setSending(false);
    }
  }

  function startEditing(message: Message) {
    setReplyingTo(null);
    setEditing(message);
    setText(message.body);
  }

  function stopEditing() {
    setEditing(null);
    setText('');
  }

  /** Reage, troca a reação ou tira (tocando de novo no mesmo emoji). */
  async function react(message: Message, emoji: string) {
    const next = message.reactions?.[me] === emoji ? null : emoji;
    // Mostra na hora; se o servidor recusar, a próxima conferência corrige.
    setMessages(
      (list) =>
        list?.map((m) => {
          if (m.id !== message.id) return m;
          const reactions = { ...(m.reactions ?? {}) };
          if (next) reactions[me] = next;
          else delete reactions[me];
          return { ...m, reactions };
        }) ?? null,
    );
    try {
      await reactToMessage(message.id, next);
    } catch {
      setError(t('Não foi possível reagir. Confira a internet e tente de novo.'));
    }
  }

  async function forwardTo(personId: string) {
    const message = forwarding;
    setForwarding(null);
    if (!message) return;
    setError(null);
    setStep(t('Encaminhando…'));
    try {
      const target = await startConversation(personId);
      const sent = await forwardMessage(message, target, me);
      if (target === conversationId) {
        setMessages((list) => (list && !list.some((m) => m.id === sent.id) ? [sent, ...list] : list));
      }
      refresh();
    } catch {
      setError(t('Não foi possível encaminhar. Confira a internet e tente de novo.'));
    } finally {
      setStep(null);
    }
  }

  async function answerRequest(accept: boolean) {
    setError(null);
    try {
      if (accept) await acceptConversation(conversationId);
      else await declineConversation(conversationId);
      await refresh();
      // Recusada, a conversa deixa de existir: volta para a lista.
      if (!accept) router.setParams({ c: undefined });
    } catch {
      setError(t('Não foi possível responder ao pedido. Confira a internet e tente de novo.'));
    }
  }

  async function setFlags(flags: { muted?: boolean; pinned?: boolean }) {
    try {
      await setConversationFlags(conversationId, flags);
      refresh();
    } catch {
      setError(t('Não foi possível alterar a conversa. Confira a internet e tente de novo.'));
    }
  }

  /** O menu de uma mensagem: o que dá para fazer depende de quem enviou e do tipo. */
  function actionsFor(message: Message): SheetAction[] {
    const mine = message.sender_id === me;
    const actions: SheetAction[] = [{ label: t('Responder'), onPress: () => { setEditing(null); setReplyingTo(message); } }];
    if (message.body) actions.push({ label: t('Copiar texto'), onPress: () => Clipboard.setStringAsync(message.body).catch(() => {}) });
    if (canForward(message)) actions.push({ label: t('Encaminhar'), onPress: () => setForwarding(message) });
    if (canEdit(message, me)) actions.push({ label: t('Editar'), onPress: () => startEditing(message) });
    if (mine) actions.push({ label: t('Apagar'), destructive: true, onPress: () => confirmDelete(message) });
    return actions;
  }

  if (!conversation || !messages) {
    return <View style={styles.center}>{error ? <FormMessage text={error} /> : <ApertureLoader size={32} />}</View>;
  }

  // A lista de conversas é atualizada o tempo todo: é dela que vêm "recebida" e "lida".
  const receipts = listed ?? conversation;
  const person = otherPerson(conversation, me);
  const name = person?.display_name || person?.username || t('Alguém');
  const seen = person ? presence[person.id] : undefined;
  const muted = isMuted(receipts, me);
  const pinned = isPinned(receipts, me);
  /** Pedido que enviei e ainda não foi aceito. */
  const waiting = isPendingRequest(receipts, me);
  const byId = new Map(messages.map((m) => [m.id, m]));

  return (
    <KeyboardAvoidingView style={styles.chatInner} behavior="padding">
      <View style={styles.chatHeader}>
        <Avatar name={name} url={person?.avatar_url} size={32} />
        <View style={styles.flex}>
          <Text style={styles.chatName}>{name}</Text>
          {person ? (
            <Text style={styles.chatHandle} numberOfLines={1}>
              @{person.username}
              {typing ? (
                <Text style={styles.onlineText}>{'  ·  ' + t('digitando…')}</Text>
              ) : seen ? (
                <Text style={seen.online && styles.onlineText}>{'  ·  ' + presenceLabel(seen)}</Text>
              ) : null}
            </Text>
          ) : null}
        </View>
        {person ? (
          <Pressable
            hitSlop={10}
            accessibilityLabel={t('Opções da conversa')}
            onPress={() => setConversationMenu(true)}>
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
            receipt={item.sender_id === me ? receiptOf(item.created_at, receipts, me, privacy.hide_read) : null}
            me={me}
            repliedTo={item.reply_to ? (byId.get(item.reply_to) ?? 'gone') : null}
            otherName={name}
            playing={playing === item.id}
            // Gravando, não toca: os dois ao mesmo tempo estragam a gravação.
            onPlay={(id) => !recording && setPlaying(id)}
            onOpen={() => setViewing(item)}
            // Num pedido ainda não aceito não há o que fazer com a mensagem além de ler.
            onMenu={() => !pending && setMenuFor(item)}
            onReact={(emoji) => react(item, emoji)}
          />
        )}
        ListEmptyComponent={
          <Text style={[styles.emptySmall, styles.flipped]}>{t('Diga oi para {name}.', { name })}</Text>
        }
      />

      <FormMessage text={error} />
      <FormMessage text={step} tone="info" />
      <MediaViewer message={viewing} onClose={() => setViewing(null)} />
      <ActionSheet
        visible={menuFor !== null}
        emojis={pending ? undefined : REACTIONS}
        selected={menuFor?.reactions?.[me] ?? null}
        onEmoji={(emoji) => menuFor && react(menuFor, emoji)}
        actions={menuFor ? actionsFor(menuFor) : []}
        onClose={() => setMenuFor(null)}
      />
      <ActionSheet
        visible={conversationMenu}
        title={name}
        actions={[
          {
            label: muted ? t('Reativar notificações') : t('Silenciar notificações'),
            onPress: () => setFlags({ muted: !muted }),
          },
          { label: pinned ? t('Desafixar conversa') : t('Fixar conversa'), onPress: () => setFlags({ pinned: !pinned }) },
          ...(person
            ? [
                {
                  label: t('Denunciar ou bloquear'),
                  destructive: true,
                  onPress: () => askModeration({ id: person.id, name }, {}, () => setBlocked(true)),
                },
              ]
            : []),
        ]}
        onClose={() => setConversationMenu(false)}
      />
      <PeoplePicker
        visible={forwarding !== null}
        title={t('Encaminhar para')}
        onPick={(picked) => forwardTo(picked.id)}
        onClose={() => setForwarding(null)}
      />
      {waiting ? <Text style={styles.waiting}>{t('Pedido enviado. {name} precisa aceitar para a conversa abrir.', { name })}</Text> : null}
      {blocked ? (
        <View style={styles.blockedRow}>
          <Text style={styles.blocked}>{t('Você bloqueou {name}. A conversa está fechada.', { name })}</Text>
          {person ? <Button variant="ghost" title={t('Desbloquear')} onPress={() => unblock(person.id)} /> : null}
        </View>
      ) : pending ? (
        <View style={styles.requestBar}>
          <Text style={styles.requestText}>
            {t('{name} quer conversar com você. Quem enviou só fica sabendo que você viu se você aceitar.', { name })}
          </Text>
          <View style={styles.requestButtons}>
            <Button title={t('Aceitar')} onPress={() => answerRequest(true)} />
            <Button variant="ghost" title={t('Recusar')} onPress={() => answerRequest(false)} />
            {person ? (
              <Button
                variant="ghost"
                title={t('Bloquear')}
                onPress={() => askModeration({ id: person.id, name }, {}, () => setBlocked(true))}
              />
            ) : null}
          </View>
        </View>
      ) : recording ? (
        <VoiceRecorder onSend={sendRecording} onCancel={() => setRecording(false)} />
      ) : (
        <>
        {replyingTo || editing ? (
          <View style={styles.contextBar}>
            <ReplyIcon color={Colors.textSecondary} size={16} />
            <Text style={styles.contextText} numberOfLines={1}>
              {editing
                ? t('Editando mensagem')
                : t('Respondendo: {preview}', { preview: replyingTo ? snippet(replyingTo) : '' })}
            </Text>
            <Pressable
              onPress={() => (editing ? stopEditing() : setReplyingTo(null))}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('Cancelar')}>
              <Text style={styles.contextClose}>✕</Text>
            </Pressable>
          </View>
        ) : null}
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
            onChangeText={(value) => {
              setText(value);
              if (value) notifyTyping();
              else stopTyping();
            }}
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
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function Bubble({
  message,
  mine,
  me,
  receipt,
  repliedTo,
  otherName,
  playing,
  onPlay,
  onOpen,
  onMenu,
  onReact,
}: {
  message: Message;
  mine: boolean;
  me: string;
  /** Só nas minhas mensagens: enviada, recebida ou lida. */
  receipt: Receipt | null;
  /** A mensagem citada; 'gone' quando foi apagada ou é antiga demais para estar carregada. */
  repliedTo: Message | 'gone' | null;
  otherName: string;
  playing: boolean;
  onPlay: (id: string | null) => void;
  onOpen: () => void;
  /** Toque longo: abre o menu da mensagem. */
  onMenu: () => void;
  onReact: (emoji: string) => void;
}) {
  const post = message.post;
  const reactions = Object.entries(message.reactions ?? {});
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      <View style={mine ? styles.bubbleColumnMine : styles.bubbleColumn}>
        <Pressable
          style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
          onLongPress={onMenu}
          delayLongPress={350}
          accessibilityHint={t('Segure para ver as opções')}>
          {message.forwarded ? <Text style={[styles.note, mine && styles.timeMine]}>{t('Encaminhada')}</Text> : null}
          {repliedTo ? (
            <View style={[styles.quote, mine && styles.quoteMine]}>
              <Text style={[styles.quoteName, mine && styles.textMine]} numberOfLines={1}>
                {repliedTo === 'gone' ? t('Mensagem') : repliedTo.sender_id === me ? t('Você') : otherName}
              </Text>
              <Text style={[styles.quoteText, mine && styles.timeMine]} numberOfLines={2}>
                {repliedTo === 'gone' ? t('Mensagem indisponível') : snippet(repliedTo)}
              </Text>
            </View>
          ) : null}
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
          {message.body ? (
            <LinkedText
              text={message.body}
              style={[styles.bubbleText, mine && styles.textMine]}
              linkStyle={mine ? styles.linkMine : styles.link}
            />
          ) : null}
          <View style={styles.bubbleFoot}>
            {message.edited_at ? <Text style={[styles.bubbleTime, mine && styles.timeMine]}>{t('editada')}</Text> : null}
            <Text style={[styles.bubbleTime, mine && styles.timeMine]}>{timeLabel(message.created_at)}</Text>
            {receipt ? <ReceiptMark receipt={receipt} /> : null}
          </View>
        </Pressable>
        {reactions.length > 0 ? (
          <View style={styles.reactions}>
            {reactions.map(([person, emoji]) => (
              <Pressable
                key={person}
                // Tocar na própria reação tira; na da outra pessoa, reage igual.
                onPress={() => onReact(emoji)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={person === me ? t('Tirar sua reação {emoji}', { emoji }) : t('Reagir com {emoji}', { emoji })}
                style={[styles.reaction, person === me && styles.reactionMine]}>
                <Text style={styles.reactionText}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
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
  search: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontSize: 13,
  },
  requestsRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  requestsText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  requestBar: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  requestText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  requestButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  waiting: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  contextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  contextText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 13,
  },
  contextClose: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
  bubbleColumn: {
    alignItems: 'flex-start',
    maxWidth: '100%',
  },
  bubbleColumnMine: {
    alignItems: 'flex-end',
    maxWidth: '100%',
  },
  note: {
    color: Colors.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
  },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.silver,
    paddingLeft: 8,
    paddingVertical: 2,
    marginBottom: 2,
  },
  quoteMine: {
    borderLeftColor: '#5E6066',
  },
  quoteName: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  quoteText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  link: {
    color: READ_ON_DARK,
    textDecorationLine: 'underline',
  },
  linkMine: {
    color: READ_ON_LIGHT,
    textDecorationLine: 'underline',
  },
  reactions: {
    flexDirection: 'row',
    gap: 4,
    marginTop: -6,
    marginHorizontal: 8,
  },
  reaction: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.background,
  },
  reactionMine: {
    borderColor: Colors.silver,
  },
  reactionText: {
    fontSize: 13,
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
