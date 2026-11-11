import { notify } from '@/lib/push';
import { supabase } from '@/lib/supabase';

export async function like(postId: string) {
  const { error } = await supabase.from('likes').insert({ post_id: postId });
  // Já curtido (toque duplo rápido): tudo bem, e não avisa de novo.
  if (error) {
    if (error.code === '23505') return;
    throw error;
  }
  notify({ kind: 'like', post_id: postId });
}

export type Liker = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  specialty: string;
};

/** Quem curtiu o post, do mais recente ao mais antigo. */
export async function fetchLikers(postId: string) {
  const { data, error } = await supabase.rpc('post_likers', { post: postId });
  if (error) throw error;
  return (data ?? []) as Liker[];
}

export async function unlike(postId: string, userId: string) {
  const { error } = await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId);
  if (error) throw error;
}
