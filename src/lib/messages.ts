import { notify } from '@/lib/push';
import { supabase } from '@/lib/supabase';

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
  post?: SharedPost | null;
};

const PROFILE = 'id, username, display_name, avatar_url';
const CONVERSATION =
  `id, user_a, user_b, last_message_at, last_message, last_sender, a_read_at, b_read_at, ` +
  `a:profiles!conversations_user_a_fkey(${PROFILE}), b:profiles!conversations_user_b_fkey(${PROFILE})`;
const MESSAGE =
  'id, conversation_id, sender_id, body, post_id, created_at, ' +
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
