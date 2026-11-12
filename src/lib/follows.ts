import { supabase } from '@/lib/supabase';

export type FollowPerson = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  specialty: string;
  i_follow: boolean;
};

export type FollowKind = 'followers' | 'following';

export type ProfileCounts = { posts: number; followers: number; following: number };

/** Trabalhos, seguidores e seguindo. Seguir fica zerado se o SQL ainda não rodou. */
export async function fetchCounts(userId: string): Promise<ProfileCounts> {
  const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await query;
    return error ? 0 : (n ?? 0);
  };
  const [posts, followers, following] = await Promise.all([
    count(supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId)),
    count(supabase.from('follows').select('follower', { count: 'exact', head: true }).eq('followed', userId)),
    count(supabase.from('follows').select('followed', { count: 'exact', head: true }).eq('follower', userId)),
  ]);
  return { posts, followers, following };
}

/** Você segue essa pessoa? */
export async function isFollowing(me: string, userId: string) {
  const { data, error } = await supabase
    .from('follows')
    .select('followed')
    .eq('follower', me)
    .eq('followed', userId)
    .limit(1);
  if (error) return false;
  return data.length > 0;
}

export async function follow(userId: string) {
  const { error } = await supabase.from('follows').insert({ followed: userId });
  // Já seguia (toque duplo rápido): tudo bem.
  if (error && error.code !== '23505') throw error;
}

export async function unfollow(me: string, userId: string) {
  const { error } = await supabase.from('follows').delete().eq('follower', me).eq('followed', userId);
  if (error) throw error;
}

/** Seguidores ou seguidos de alguém, do mais recente ao mais antigo. */
export async function fetchFollowList(userId: string, kind: FollowKind) {
  const { data, error } = await supabase.rpc('follow_list', { person: userId, kind });
  if (error) throw error;
  return (data ?? []) as FollowPerson[];
}

export type MutualFollowers = {
  people: { id: string; username: string; display_name: string; avatar_url: string | null }[];
  total: number;
};

/** Quem você segue e também segue essa pessoa ("Seguido por X e Y"). */
export async function fetchMutualFollowers(userId: string): Promise<MutualFollowers> {
  const { data, error } = await supabase.rpc('followed_by_people_i_follow', { person: userId });
  if (error || !data?.length) return { people: [], total: 0 };
  const rows = data as (MutualFollowers['people'][number] & { total: number })[];
  return { people: rows, total: Number(rows[0].total) };
}
