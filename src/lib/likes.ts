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

export async function unlike(postId: string, userId: string) {
  const { error } = await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId);
  if (error) throw error;
}
