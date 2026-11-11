import type { MiniProfile } from '@/lib/messages';
import { notify } from '@/lib/push';
import { supabase } from '@/lib/supabase';

export type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  /** Resposta: o comentário de origem (sempre um comentário principal). */
  parent_id: string | null;
  like_count: number;
  /** Só traz a curtida de quem está logado (regra do banco): vazio = não curtiu. */
  my_like: { user_id: string }[];
  author: MiniProfile | null;
};

export const COMMENT_MAX = 500;

// O nome da chave estrangeira vai explícito para o pedido nunca ficar ambíguo.
const COLUMNS =
  'id, post_id, user_id, body, created_at, parent_id, like_count, my_like:comment_likes(user_id), author:profiles!comments_user_id_fkey(id, username, display_name, avatar_url)';

/** Comentários de um post, do mais antigo ao mais novo. */
export async function fetchComments(postId: string, limit = 200) {
  const { data, error } = await supabase
    .from('comments')
    .select(COLUMNS)
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(limit)
    .overrideTypes<Comment[], { merge: false }>();
  if (error) throw error;
  return data;
}

/** Coloca cada resposta logo abaixo do comentário a que responde. */
export function threaded(comments: Comment[]) {
  const ids = new Set(comments.map((c) => c.id));
  const replies = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parent_id && ids.has(c.parent_id)) replies.set(c.parent_id, [...(replies.get(c.parent_id) ?? []), c]);
  }
  return comments
    .filter((c) => !c.parent_id || !ids.has(c.parent_id))
    .flatMap((c) => [c, ...(replies.get(c.id) ?? [])]);
}

export async function likeComment(id: string) {
  const { error } = await supabase.from('comment_likes').insert({ comment_id: id });
  // Já curtido (toque duplo rápido): tudo bem.
  if (error && error.code !== '23505') throw error;
}

export async function unlikeComment(id: string, userId: string) {
  const { error } = await supabase.from('comment_likes').delete().eq('comment_id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function addComment(postId: string, body: string, parentId?: string) {
  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: postId, body: body.trim(), ...(parentId ? { parent_id: parentId } : {}) })
    .select(COLUMNS)
    .single()
    .overrideTypes<Comment, { merge: false }>();
  if (error) throw error;
  notify({ kind: 'comment', id: data.id });
  return data;
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}
