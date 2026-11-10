import type { MiniProfile } from '@/lib/messages';
import { supabase } from '@/lib/supabase';

export type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author: MiniProfile | null;
};

export const COMMENT_MAX = 500;

// O nome da chave estrangeira vai explícito para o pedido nunca ficar ambíguo.
const COLUMNS =
  'id, post_id, user_id, body, created_at, author:profiles!comments_user_id_fkey(id, username, display_name, avatar_url)';

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

export async function addComment(postId: string, body: string) {
  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: postId, body: body.trim() })
    .select(COLUMNS)
    .single()
    .overrideTypes<Comment, { merge: false }>();
  if (error) throw error;
  return data;
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}
