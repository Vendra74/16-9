import { supabase } from '@/lib/supabase';

export async function like(postId: string) {
  const { error } = await supabase.from('likes').insert({ post_id: postId });
  // Já curtido (toque duplo rápido): tudo bem.
  if (error && error.code !== '23505') throw error;
}

export async function unlike(postId: string, userId: string) {
  const { error } = await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId);
  if (error) throw error;
}
