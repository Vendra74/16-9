import { cropAndResize, uploadJpeg } from '@/lib/images';
import { notify } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { makePoster, requestUpload, uploadVideo } from '@/lib/video';

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
  kind: 'text' | 'photo' | 'video';
  /** A foto, ou a capa do vídeo, no bucket privado "messages". */
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  /** Vídeos nascem "processing" e ficam "ready" quando o servidor termina. */
  status: 'processing' | 'ready' | 'failed';
  video_url: string | null;
  duration: number | null;
  post?: SharedPost | null;
};

const PROFILE = 'id, username, display_name, avatar_url';
const CONVERSATION =
  `id, user_a, user_b, last_message_at, last_message, last_sender, a_read_at, b_read_at, ` +
  `a:profiles!conversations_user_a_fkey(${PROFILE}), b:profiles!conversations_user_b_fkey(${PROFILE})`;
const MESSAGE =
  'id, conversation_id, sender_id, body, post_id, created_at, kind, image_path, image_width, image_height, status, video_url, duration, ' +
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
    if (error.message.includes('blocked')) throw new Error('Não é possível conversar com essa pessoa.');
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

export async function sendMessage(conversationId: string, body: string, postId?: string) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, body, post_id: postId ?? null })
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
  onStep(video ? 'Preparando o vídeo…' : 'Preparando a foto…');
  const image = video
    ? await makePoster(media.uri, MAX_PHOTO_WIDTH)
    : await cropAndResize(media.uri, { originX: 0, originY: 0, width: media.width, height: media.height }, MAX_PHOTO_WIDTH);
  onStep('Enviando…');
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
      onStep('Enviando o vídeo… 0%');
      await uploadVideo(upload.url, media.uri, (f) => onStep(`Enviando o vídeo… ${Math.round(f * 100)}%`));
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

export async function markRead(conversationId: string) {
  await supabase.rpc('mark_conversation_read', { conv: conversationId });
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
