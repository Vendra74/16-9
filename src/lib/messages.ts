import { copyMessageFile, cropAndResize, uploadJpeg, uploadVoice } from '@/lib/images';
import { notify } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { makePoster, requestUpload, uploadVideo } from '@/lib/video';
import { t } from '@/lib/i18n';

export type MiniProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type Conversation = {
  id: string;
  user_a: string;
  user_b: string;
  last_message_at: string | null;
  last_message: string;
  last_sender: string | null;
  a_read_at: string;
  b_read_at: string;
  /** Quando o app de cada pessoa buscou as mensagens pela última vez. Ausente em bancos ainda sem a coluna. */
  a_delivered_at?: string;
  b_delivered_at?: string;
  /** O "lida" que a outra pessoa vê (fica parado para quem desligou a confirmação de leitura). */
  a_seen_at?: string | null;
  b_seen_at?: string | null;
  /** Quem mandou a primeira mensagem, e se quem recebeu já aceitou (pedidos de mensagem). */
  started_by?: string | null;
  accepted?: boolean;
  a_muted?: boolean;
  b_muted?: boolean;
  a_pinned?: boolean;
  b_pinned?: boolean;
  a: MiniProfile | null;
  b: MiniProfile | null;
};

export type SharedPost = {
  id: string;
  image_path: string;
  title: string;
  author: { username: string; display_name: string } | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  post_id: string | null;
  created_at: string;
  kind: 'text' | 'photo' | 'video' | 'audio';
  /** A foto, ou a capa do vídeo, no bucket privado "messages". */
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  /** Vídeos nascem "processing" e ficam "ready" quando o servidor termina. */
  status: 'processing' | 'ready' | 'failed';
  video_url: string | null;
  /** Segundos do vídeo ou da mensagem de voz. */
  duration: number | null;
  /** A mensagem de voz, no bucket privado "messages". Ausente em bancos ainda sem a coluna. */
  audio_path?: string | null;
  /** A mensagem a que esta responde. */
  reply_to?: string | null;
  edited_at?: string | null;
  /** Quem reagiu e com qual emoji, pelo id da pessoa. */
  reactions?: Record<string, string> | null;
  forwarded?: boolean;
  post?: SharedPost | null;
};

const PROFILE = 'id, username, display_name, avatar_url';
// `*` de propósito, como em MESSAGE: colunas novas não quebram a leitura num banco que ainda não as tem.
const CONVERSATION =
  `*, ` +
  `a:profiles!conversations_user_a_fkey(${PROFILE}), b:profiles!conversations_user_b_fkey(${PROFILE})`;
// `*` de propósito: colunas novas (como audio_path) não quebram a leitura num banco que ainda não as tem.
const MESSAGE =
  '*, ' +
  'post:posts!messages_post_id_fkey(id, image_path, title, author:profiles!posts_user_id_fkey(username, display_name))';

/** A outra pessoa da conversa. */
export function otherPerson(c: Conversation, me: string) {
  return c.user_a === me ? c.b : c.a;
}

/** Tem mensagem nova da outra pessoa que eu ainda não abri? */
export function isUnread(c: Conversation, me: string) {
  if (!c.last_message_at || c.last_sender === me) return false;
  const readAt = c.user_a === me ? c.a_read_at : c.b_read_at;
  return new Date(c.last_message_at) > new Date(readAt);
}

/** O estado de uma mensagem enviada: saiu daqui, chegou no aparelho da outra pessoa, foi lida. */
export type Receipt = 'sent' | 'delivered' | 'read';

/** Em que ponto está uma mensagem minha, pelo que a conversa sabe da outra pessoa. */
export function receiptOf(sentAt: string, c: Conversation, me: string, hideRead = false): Receipt {
  const mineIsA = c.user_a === me;
  const sent = new Date(sentAt).getTime();
  // Banco novo: vale o "lida" que a pessoa aceitou mostrar. Banco antigo: o de sempre.
  const seenAt = 'a_seen_at' in c ? (mineIsA ? c.b_seen_at : c.a_seen_at) : mineIsA ? c.b_read_at : c.a_read_at;
  // Quem esconde a própria leitura também não vê a dos outros.
  if (!hideRead && seenAt && new Date(seenAt).getTime() >= sent) return 'read';
  const deliveredAt = mineIsA ? c.b_delivered_at : c.a_delivered_at;
  if (deliveredAt && new Date(deliveredAt).getTime() >= sent) return 'delivered';
  return 'sent';
}

/** Um pedido de mensagem que EU recebi e ainda não aceitei. */
export function isRequest(c: Conversation, me: string) {
  return c.accepted === false && c.started_by !== me;
}

/** Um pedido que eu enviei e a outra pessoa ainda não aceitou. */
export function isPendingRequest(c: Conversation, me: string) {
  return c.accepted === false && c.started_by === me;
}

export function isMuted(c: Conversation, me: string) {
  return (c.user_a === me ? c.a_muted : c.b_muted) === true;
}

export function isPinned(c: Conversation, me: string) {
  return (c.user_a === me ? c.a_pinned : c.b_pinned) === true;
}

export async function acceptConversation(id: string) {
  const { error } = await supabase.rpc('accept_conversation', { conv: id });
  if (error) throw error;
}

/** Recusa um pedido: a conversa some para as duas pessoas. */
export async function declineConversation(id: string) {
  const { error } = await supabase.rpc('decline_conversation', { conv: id });
  if (error) throw error;
}

/** Silenciar e fixar valem só para quem escolheu. `undefined` deixa como está. */
export async function setConversationFlags(id: string, flags: { muted?: boolean; pinned?: boolean }) {
  const { error } = await supabase.rpc('set_conversation_flags', {
    conv: id,
    muted: flags.muted ?? null,
    pinned: flags.pinned ?? null,
  });
  if (error) throw error;
}

/** Emojis oferecidos para reagir a uma mensagem. */
export const REACTIONS = ['❤️', '😂', '😮', '😢', '👏', '🔥'];

/** Reage a uma mensagem; `null` tira a reação. */
export async function reactToMessage(id: string, emoji: string | null) {
  const { error } = await supabase.rpc('react_to_message', { msg: id, emoji: emoji ?? '' });
  if (error) throw error;
}

/** Por quanto tempo uma mensagem de texto pode ser editada. O servidor confere de novo. */
const EDIT_MINUTES = 15;

export function canEdit(m: Message, me: string) {
  return (
    m.sender_id === me &&
    m.kind === 'text' &&
    m.body !== '' &&
    Date.now() - new Date(m.created_at).getTime() < EDIT_MINUTES * 60e3
  );
}

export async function editMessage(id: string, body: string) {
  const { error } = await supabase.rpc('edit_message', { msg: id, new_body: body });
  if (error) throw error;
}

/** Vídeo não é encaminhado: o arquivo fica no serviço de vídeo, preso à mensagem original. */
export function canForward(m: Message) {
  return m.kind !== 'video' && m.status === 'ready';
}

/** Manda uma cópia da mensagem para outra conversa, marcada como encaminhada. */
export async function forwardMessage(m: Message, conversationId: string, me: string) {
  const folder = `${conversationId}/${me}`;
  const row: Record<string, unknown> = { conversation_id: conversationId, forwarded: true, kind: m.kind };
  if (m.body) row.body = m.body;
  if (m.post_id) row.post_id = m.post_id;
  if (m.kind === 'photo' && m.image_path) {
    row.image_path = await copyMessageFile(m.image_path, folder);
    row.image_width = m.image_width;
    row.image_height = m.image_height;
  }
  if (m.kind === 'audio' && m.audio_path) {
    row.audio_path = await copyMessageFile(m.audio_path, folder);
    row.duration = m.duration;
  }
  const { data, error } = await supabase
    .from('messages')
    .insert(row)
    .select(MESSAGE)
    .single()
    .overrideTypes<Message, { merge: false }>();
  if (error) throw error;
  notify({ kind: 'message', id: data.id });
  return data;
}

/** Tem mensagem da outra pessoa que este aparelho ainda não avisou ter recebido? */
export function hasUndelivered(c: Conversation, me: string) {
  const deliveredAt = c.user_a === me ? c.a_delivered_at : c.b_delivered_at;
  if (!deliveredAt || !c.last_message_at || c.last_sender === me) return false;
  return new Date(c.last_message_at) > new Date(deliveredAt);
}

/** Avisa que as mensagens chegaram a este aparelho (a outra pessoa vê "recebida"). */
export async function markDelivered() {
  const { error } = await supabase.rpc('mark_conversations_delivered');
  if (error) throw error;
}

/** Se a pessoa está com o app aberto agora e, se não, quando esteve pela última vez. */
export type Presence = { online: boolean; last_seen_at: string };

/** Avisa que este aparelho está (ou deixou de estar) com o app aberto. Falha em silêncio. */
export async function setPresence(online: boolean) {
  try {
    await supabase.rpc('set_presence', { is_online: online });
  } catch {
    // Sem conexão: o servidor considera offline sozinho depois de 90 s.
  }
}

/** O estado das pessoas com quem converso. Vazio em bancos ainda sem a função. */
export async function fetchPresence(ids: string[]) {
  const map: Record<string, Presence> = {};
  if (ids.length === 0) return map;
  const { data, error } = await supabase.rpc('presence_of', { ids });
  if (error || !Array.isArray(data)) return map;
  for (const row of data as ({ user_id: string } & Presence)[]) {
    map[row.user_id] = { online: row.online, last_seen_at: row.last_seen_at };
  }
  return map;
}

export async function fetchConversations() {
  const { data, error } = await supabase
    .from('conversations')
    .select(CONVERSATION)
    .not('last_message_at', 'is', null)
    .order('last_message_at', { ascending: false })
    .overrideTypes<Conversation[], { merge: false }>();
  if (error) throw error;
  return data;
}

export async function fetchConversation(id: string) {
  const { data, error } = await supabase
    .from('conversations')
    .select(CONVERSATION)
    .eq('id', id)
    .single()
    .overrideTypes<Conversation, { merge: false }>();
  if (error) throw error;
  return data;
}

/** Abre (ou reaproveita) a conversa com outra pessoa. */
export async function startConversation(otherUserId: string) {
  const { data, error } = await supabase.rpc('start_conversation', { other: otherUserId });
  if (error) {
    if (error.message.includes('blocked')) throw new Error(t('Não é possível conversar com essa pessoa.'));
    throw error;
  }
  return data as string;
}

export async function fetchMessages(conversationId: string, limit = 100) {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .overrideTypes<Message[], { merge: false }>();
  if (error) throw error;
  return data;
}

export async function fetchMessage(id: string) {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE)
    .eq('id', id)
    .single()
    .overrideTypes<Message, { merge: false }>();
  if (error) throw error;
  return data;
}

export async function sendMessage(conversationId: string, body: string, postId?: string, replyTo?: string) {
  const { data, error } = await supabase
    .from('messages')
    // `reply_to` só vai quando existe: num banco ainda sem a coluna, mensagem comum segue funcionando.
    .insert({ conversation_id: conversationId, body, post_id: postId ?? null, ...(replyTo ? { reply_to: replyTo } : {}) })
    .select(MESSAGE)
    .single()
    .overrideTypes<Message, { merge: false }>();
  if (error) throw error;
  notify({ kind: 'message', id: data.id });
  return data;
}

/** Lado maior das fotos enviadas em conversas. */
const MAX_PHOTO_WIDTH = 1600;

export type Media = { kind: 'photo' | 'video'; uri: string; width: number; height: number };

/**
 * Envia uma foto ou um vídeo na conversa. A imagem (ou a capa do vídeo) vai
 * para a pasta da conversa; o vídeo vai para o Mux e a mensagem fica
 * "processando" até ele ficar pronto. `onStep` descreve o andamento.
 */
export async function sendMedia(conversationId: string, me: string, media: Media, onStep: (text: string) => void) {
  const video = media.kind === 'video';
  onStep(video ? t('Preparando o vídeo…') : t('Preparando a foto…'));
  const image = video
    ? await makePoster(media.uri, MAX_PHOTO_WIDTH)
    : await cropAndResize(media.uri, { originX: 0, originY: 0, width: media.width, height: media.height }, MAX_PHOTO_WIDTH);
  onStep(t('Enviando…'));
  const image_path = await uploadJpeg('messages', `${conversationId}/${me}`, image.uri);
  const upload = video ? await requestUpload() : null;
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      kind: media.kind,
      image_path,
      image_width: image.width,
      image_height: image.height,
      ...(upload ? { mux_upload_id: upload.upload_id } : {}),
    })
    .select(MESSAGE)
    .single()
    .overrideTypes<Message, { merge: false }>();
  if (error) throw error;
  if (upload) {
    try {
      onStep(t('Enviando o vídeo… {percent}%', { percent: 0 }));
      await uploadVideo(upload.url, media.uri, (f) => onStep(t('Enviando o vídeo… {percent}%', { percent: Math.round(f * 100) })));
    } catch (e) {
      // Sem o arquivo, a mensagem ficaria "processando" para sempre: desfaz.
      await supabase.from('messages').delete().eq('id', data.id);
      await supabase.storage.from('messages').remove([image_path]);
      throw e;
    }
  }
  notify({ kind: 'message', id: data.id });
  return data;
}

/** Duração máxima de uma mensagem de voz. */
export const MAX_VOICE_SECONDS = 120;

/** Envia uma mensagem de voz já gravada. O arquivo vai para a pasta da conversa. */
export async function sendVoice(conversationId: string, me: string, uri: string, seconds: number) {
  const audio_path = await uploadVoice(`${conversationId}/${me}`, uri);
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, kind: 'audio', audio_path, duration: seconds })
    .select(MESSAGE)
    .single()
    .overrideTypes<Message, { merge: false }>();
  if (error) {
    await supabase.storage.from('messages').remove([audio_path]);
    throw error;
  }
  notify({ kind: 'message', id: data.id });
  return data;
}

/** Apaga uma mensagem sua, para as duas pessoas. */
export async function deleteMessage(message: Pick<Message, 'id' | 'kind' | 'image_path' | 'audio_path'>) {
  // O vídeo sai do Mux primeiro; se falhar, a mensagem continua e dá para tentar de novo.
  if (message.kind === 'video') {
    const { error } = await supabase.functions.invoke('video', { body: { action: 'delete', message_id: message.id } });
    if (error) throw error;
  }
  const { error } = await supabase.from('messages').delete().eq('id', message.id);
  if (error) throw error;
  // Os arquivos saem depois; se falhar, só fica um arquivo órfão no Storage.
  const files = [message.image_path, message.audio_path].filter((path): path is string => Boolean(path));
  if (files.length) await supabase.storage.from('messages').remove(files);
}

/** As pessoas que você bloqueou, da mais recente à mais antiga. */
export async function fetchBlocked() {
  const { data: blocks, error } = await supabase
    .from('blocks')
    .select('blocked, created_at')
    .order('created_at', { ascending: false })
    .overrideTypes<{ blocked: string }[], { merge: false }>();
  if (error) throw error;
  if (blocks.length === 0) return [];
  // Em dois passos, de propósito: blocks aponta duas vezes para profiles.
  const ids = blocks.map((b) => b.blocked);
  const { data: people, error: peopleError } = await supabase
    .from('profiles')
    .select(PROFILE)
    .in('id', ids)
    .overrideTypes<MiniProfile[], { merge: false }>();
  if (peopleError) throw peopleError;
  return ids.map((id) => people.find((p) => p.id === id)).filter((p): p is MiniProfile => Boolean(p));
}

export async function markRead(conversationId: string) {
  const { error } = await supabase.rpc('mark_conversation_read', { conv: conversationId });
  if (error) throw error;
}

export async function searchPeople(query: string, me: string) {
  const q = query.trim().replace(/[%_,()]/g, '');
  let req = supabase.from('profiles').select(PROFILE).neq('id', me).order('username').limit(20);
  if (q) req = req.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
  const { data, error } = await req.overrideTypes<MiniProfile[], { merge: false }>();
  if (error) throw error;
  return data;
}

export async function blockUser(userId: string) {
  const { error } = await supabase.from('blocks').insert({ blocked: userId });
  if (error && error.code !== '23505') throw error;
}

export async function unblockUser(userId: string) {
  // A regra do banco só deixa apagar os bloqueios de quem está logado.
  const { error } = await supabase.from('blocks').delete().eq('blocked', userId);
  if (error) throw error;
}

/** Você bloqueou essa pessoa? (O banco só mostra os seus próprios bloqueios.) */
export async function isBlockedByMe(userId: string) {
  const { data, error } = await supabase.from('blocks').select('blocked').eq('blocked', userId).limit(1);
  if (error) throw error;
  return data.length > 0;
}

export async function report(target: { userId?: string; postId?: string; messageId?: string; commentId?: string }, reason: string) {
  const { error } = await supabase.from('reports').insert({
    reported_user: target.userId ?? null,
    post_id: target.postId ?? null,
    message_id: target.messageId ?? null,
    ...(target.commentId ? { comment_id: target.commentId } : {}),
    reason,
  });
  if (error) throw error;
}

/** Resumos que o servidor escreve em português na lista de conversas (mensagem sem texto). */
const PREVIEWS: Record<string, () => string> = {
  Foto: () => t('Foto'),
  Vídeo: () => t('Vídeo'),
  Áudio: () => t('Áudio'),
  'Compartilhou um trabalho': () => t('Compartilhou um trabalho'),
};

/** A última mensagem da conversa, com os resumos do servidor no idioma do app. */
export function previewText(lastMessage: string) {
  return PREVIEWS[lastMessage]?.() ?? lastMessage;
}
