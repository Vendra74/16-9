import { supabase } from '@/lib/supabase';

/**
 * Painel do administrador. Quem é administrador está na tabela "team" do banco;
 * cada função do servidor confere isso de novo, então a tela sozinha não abre nada.
 */

export type AdminPerson = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type AdminStats = {
  users: number;
  users_7d: number;
  posts: number;
  posts_7d: number;
  videos: number;
  comments: number;
  messages_7d: number;
  active_7d: number;
  open_reports: number;
  hidden: number;
  unread_feedback: number;
  banned: number;
  team: number;
};

export type Resolution = 'kept' | 'removed' | 'banned';

export type AdminReport = {
  id: number;
  reason: string;
  created_at: string;
  resolved_at: string | null;
  resolution: Resolution | null;
  reporter: AdminPerson | null;
  reported_user: (AdminPerson & { banned: boolean; reports: number }) | null;
  post: { id: string; title: string; image_path: string; kind: 'photo' | 'video'; hidden: boolean; user_id: string } | null;
  comment: { id: string; body: string; hidden: boolean; user_id: string } | null;
  message: { id: string; body: string; kind: string; sender_id: string } | null;
  /** Quantas pessoas diferentes denunciaram o mesmo conteúdo. */
  same_target: number;
};

export type AdminUser = AdminPerson & {
  specialty: string;
  city: string;
  created_at: string;
  banned_at: string | null;
  banned_reason: string;
  email: string | null;
  last_sign_in_at: string | null;
  is_team: boolean;
  posts: number;
  reports: number;
};

export type AdminFeedback = {
  id: number;
  message: string;
  app_version: string | null;
  platform: string | null;
  created_at: string;
  read_at: string | null;
  author: AdminPerson | null;
};

/** Se quem está logado é da equipe. Antes do SQL do painel rodar, responde que não. */
export async function amITeam() {
  const { data, error } = await supabase.rpc('is_team');
  if (error) return false;
  return data === true;
}

/** Se a conta de quem está logado foi suspensa. Na dúvida (sem internet, SQL não rodado), não. */
export async function amIBanned() {
  const { data, error } = await supabase.rpc('is_banned');
  if (error) return false;
  return data === true;
}

async function call<T>(name: string, args?: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const fetchStats = () => call<AdminStats>('admin_stats');

export const fetchReports = (onlyOpen: boolean) =>
  call<AdminReport[]>('admin_reports', { only_open: onlyOpen, max_rows: 150 });

export const resolveReport = (id: number, decision: Resolution, banReason = '') =>
  call<void>('admin_resolve_report', { report_id: id, decision, ban_reason: banReason });

export const fetchUsers = (query: string) => call<AdminUser[]>('admin_users', { query, max_rows: 60 });

export const banUser = (id: string, reason: string) => call<void>('admin_ban', { target: id, reason });

export const unbanUser = (id: string) => call<void>('admin_unban', { target: id });

export const setTeam = (id: string, value: boolean) => call<void>('admin_set_team', { target: id, value });

export const fetchFeedback = () => call<AdminFeedback[]>('admin_feedback', { max_rows: 200 });

export const markFeedback = (id: number, read: boolean) =>
  call<void>('admin_mark_feedback', { feedback_id: id, value: read });
