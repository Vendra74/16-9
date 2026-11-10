import type { Gear } from '@/lib/exif';
import { publicUrl } from '@/lib/images';
import { supabase } from '@/lib/supabase';

export type FeedPost = Gear & {
  id: string;
  user_id: string;
  image_path: string;
  width: number;
  height: number;
  title: string;
  location: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  /** Só traz a curtida de quem está logado (regra do banco): vazio = não curtiu. */
  my_like: { user_id: string }[];
  author: {
    username: string;
    display_name: string;
    specialty: string;
    avatar_url: string | null;
  } | null;
};

const COLUMNS =
  'id, user_id, image_path, width, height, title, location, camera, lens, focal_length, aperture, shutter, iso, created_at, ' +
  'like_count, comment_count, my_like:likes(user_id), author:profiles!posts_user_id_fkey(username, display_name, specialty, avatar_url)';

export function postImageUrl(post: Pick<FeedPost, 'image_path'>) {
  return publicUrl('posts', post.image_path);
}

export async function fetchFeed(limit = 50) {
  const { data, error } = await supabase
    .from('posts')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
    .overrideTypes<FeedPost[], { merge: false }>();
  if (error) throw error;
  return data;
}

export async function fetchUserPosts(userId: string) {
  const { data, error } = await supabase
    .from('posts')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .overrideTypes<FeedPost[], { merge: false }>();
  if (error) throw error;
  return data;
}

export type NewPost = Gear & {
  image_path: string;
  width: number;
  height: number;
  title: string;
  location: string;
};

export async function createPost(post: NewPost) {
  const { error } = await supabase.from('posts').insert(post);
  if (error) throw error;
}

export async function deletePost(post: Pick<FeedPost, 'id' | 'image_path'>) {
  const { error } = await supabase.from('posts').delete().eq('id', post.id);
  if (error) throw error;
  // A imagem sai depois; se falhar, só fica um arquivo órfão no Storage.
  await supabase.storage.from('posts').remove([post.image_path]);
}
