import type { Gear } from '@/lib/exif';
import { publicUrl } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import { releaseVideo } from '@/lib/video';

export type FeedPost = Gear & {
  id: string;
  user_id: string;
  image_path: string;
  width: number;
  height: number;
  title: string;
  location: string;
  created_at: string;
  kind: 'photo' | 'video';
  /** Vídeos nascem "processing" e só aparecem para os outros quando ficam "ready". */
  status: 'processing' | 'ready' | 'failed';
  /** Endereço de streaming (HLS). Nos vídeos, image_path é a capa. */
  video_url: string | null;
  duration: number | null;
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
  'id, user_id, image_path, width, height, title, location, camera, lens, focal_length, aperture, shutter, iso, created_at, kind, status, video_url, duration, ' +
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

/** Tira o que atrapalha o filtro do banco (curingas e separadores). */
function clean(query: string) {
  return query.trim().replace(/[%_,()"\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Explorar: os trabalhos mais curtidos ("top") ou os mais novos ("recent"). */
export async function fetchExplore(sort: 'top' | 'recent', limit = 60) {
  let req = supabase.from('posts').select(COLUMNS).eq('status', 'ready');
  if (sort === 'top') req = req.order('like_count', { ascending: false });
  const { data, error } = await req
    .order('created_at', { ascending: false })
    .limit(limit)
    .overrideTypes<FeedPost[], { merge: false }>();
  if (error) throw error;
  return data;
}

/** Busca trabalhos pelo título, lugar ou equipamento. */
export async function searchPosts(query: string, limit = 40) {
  const q = clean(query);
  if (!q) return [];
  const like = `ilike.%${q}%`;
  const { data, error } = await supabase
    .from('posts')
    .select(COLUMNS)
    .eq('status', 'ready')
    .or(`title.${like},location.${like},camera.${like},lens.${like}`)
    .order('like_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
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
  kind?: 'photo' | 'video';
  mux_upload_id?: string;
};

/** Cria o post e devolve o id. */
export async function createPost(post: NewPost) {
  const { data, error } = await supabase.from('posts').insert(post).select('id').single<{ id: string }>();
  if (error) throw error;
  return data.id;
}

export async function deletePost(post: Pick<FeedPost, 'id' | 'image_path' | 'kind'>) {
  // O vídeo sai do Mux primeiro; se falhar, o post continua e dá para tentar de novo.
  if (post.kind === 'video') await releaseVideo(post.id);
  const { error } = await supabase.from('posts').delete().eq('id', post.id);
  if (error) throw error;
  // A imagem sai depois; se falhar, só fica um arquivo órfão no Storage.
  await supabase.storage.from('posts').remove([post.image_path]);
}
