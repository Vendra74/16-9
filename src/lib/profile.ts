import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  specialty: string;
  city: string;
  bio: string;
  avatar_url: string | null;
  /** Site, portfólio, redes. Some se o SQL dos links ainda não foi rodado. */
  links?: string[];
};

export type ProfileChanges = Partial<Omit<Profile, 'id'>>;

export const USERNAME_PATTERN = /^[a-z0-9_.]{3,24}$/;

/** Deixa o @ no formato aceito: minúsculas, sem espaço nem acento. */
export function normalizeUsername(value: string) {
  return value
    .trim()
    .replace(/^@/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '');
}

export async function fetchProfile(userId: string) {
  // `*` traz os links quando a coluna existe, sem quebrar o perfil se o SQL ainda não rodou.
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single<Profile>();
  if (error) throw error;
  return { ...data, links: data.links ?? [] };
}

/** Busca criadores pelo nome, @, especialidade ou cidade. */
export async function searchCreators(query: string, me: string, limit = 12) {
  const q = query.trim().replace(/[%_,()"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return [];
  const like = `ilike.%${q}%`;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, specialty, city, bio, avatar_url')
    .neq('id', me)
    .or(`username.${like},display_name.${like},specialty.${like},city.${like}`)
    .order('username')
    .limit(limit)
    .overrideTypes<Profile[], { merge: false }>();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId: string, changes: ProfileChanges) {
  const { error } = await supabase.from('profiles').update(changes).eq('id', userId);
  if (error) {
    if (error.code === '23505') throw new Error(t('Esse @ já está em uso.'));
    throw error;
  }
}

export async function isUsernameAvailable(username: string) {
  const { data, error } = await supabase.rpc('username_available', { name: username });
  if (error) throw error;
  return data === true;
}

export async function sendFeedback(message: string, appVersion: string, platform: string) {
  const { error } = await supabase
    .from('feedback')
    .insert({ message, app_version: appVersion, platform });
  if (error) throw error;
}
