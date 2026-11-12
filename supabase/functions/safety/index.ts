// 16:9: função "safety" do Supabase (Edge Function).
//
// Duas coisas que as lojas (Google Play e App Store) exigem de uma rede social:
//   { action: 'delete_account' } → apaga a conta de quem chamou e tudo dela:
//                                   vídeos no Mux, imagens no Storage e o login
//                                   (o resto do banco vai junto, em cascata).
//   { action: 'report' }         → avisa a equipe (tabela "team") por push que
//                                   chegou uma denúncia nova de quem chamou.
//
// Segredos: usa os do Mux que a função "video" já usa (MUX_TOKEN_ID, MUX_TOKEN_SECRET;
// os segredos valem para todas as funções do projeto). SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY já vêm prontos. Publicar com "Verify JWT" desligado
// (o login é conferido aqui, como nas outras funções).
//
// Sem dependências, de propósito: só fetch.

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Só avisa denúncias que acabaram de ser feitas. */
const FRESH_SECONDS = 120;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function serviceHeaders(extra: Record<string, string> = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return { apikey: key, authorization: `Bearer ${key}`, ...extra };
}

// ---------- Banco e Storage (com a chave de serviço) ----------

async function db<T>(table: string, query: string): Promise<T[]> {
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/${table}?${query}`, { headers: serviceHeaders() });
  if (!res.ok) throw new Error(`db_${table}_${res.status}:${await res.text()}`);
  return res.json();
}

/** Lista os arquivos de uma pasta do Storage (um nível). */
async function listFolder(bucket: string, prefix: string): Promise<string[]> {
  const res = await fetch(`${env('SUPABASE_URL')}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: serviceHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ prefix, limit: 1000 }),
  });
  if (!res.ok) throw new Error(`storage_list_${bucket}_${res.status}`);
  const items: { name: string; id: string | null }[] = await res.json();
  // Itens sem id são subpastas.
  return items.filter((i) => i.id).map((i) => `${prefix}${i.name}`);
}

async function removeFiles(bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 500) {
    const res = await fetch(`${env('SUPABASE_URL')}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: serviceHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ prefixes: paths.slice(i, i + 500) }),
    });
    if (!res.ok) throw new Error(`storage_remove_${bucket}_${res.status}`);
  }
}

async function currentUser(req: Request): Promise<string | null> {
  const authorization = req.headers.get('authorization') ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  const res = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, {
    headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), authorization },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return typeof user?.id === 'string' && UUID.test(user.id) ? user.id : null;
}

// ---------- Mux ----------

async function mux(method: string, path: string) {
  const auth = btoa(`${env('MUX_TOKEN_ID')}:${env('MUX_TOKEN_SECRET')}`);
  return fetch(`https://api.mux.com${path}`, { method, headers: { authorization: `Basic ${auth}` } });
}

type VideoRow = { mux_asset_id: string | null; mux_upload_id: string | null; status?: string };

/** Apaga o vídeo no Mux, ou cancela o envio que ainda não virou vídeo. */
async function releaseVideo(row: VideoRow) {
  if (row.mux_asset_id) {
    const res = await mux('DELETE', `/video/v1/assets/${row.mux_asset_id}`);
    if (!res.ok && res.status !== 404) throw new Error(`mux_delete_${res.status}`);
  } else if (row.mux_upload_id && row.status === 'processing') {
    await mux('PUT', `/video/v1/uploads/${row.mux_upload_id}/cancel`);
  }
}

// ---------- Apagar a conta ----------

type PostRow = VideoRow & { image_path: string | null; extra_images: string[] | null };
type MessageRow = VideoRow & { image_path: string | null };

async function deleteAccount(userId: string) {
  // As conversas somem junto com a conta (para os dois lados), então as mídias delas também.
  const conversations = await db<{ id: string }>('conversations', `select=id&or=(user_a.eq.${userId},user_b.eq.${userId})`);
  const posts = await db<PostRow>(
    'posts',
    `select=image_path,extra_images,mux_asset_id,mux_upload_id,status&user_id=eq.${userId}`,
  );
  const messages = conversations.length
    ? await db<MessageRow>(
        'messages',
        `select=image_path,mux_asset_id,mux_upload_id,status&conversation_id=in.(${conversations.map((c) => c.id).join(',')})`,
      )
    : [];

  // 1. Vídeos no Mux (é o que custa dinheiro se ficar para trás).
  for (const row of [...posts, ...messages]) await releaseVideo(row);

  // 2. Imagens no Storage.
  const postFiles = posts.flatMap((p) => [p.image_path, ...(p.extra_images ?? [])]).filter((p): p is string => !!p);
  const ownFolder = await listFolder('posts', `${userId}/`);
  await removeFiles('posts', [...new Set([...postFiles, ...ownFolder])]);
  await removeFiles('avatars', await listFolder('avatars', `${userId}/`));
  await removeFiles(
    'messages',
    messages.map((m) => m.image_path).filter((p): p is string => !!p),
  );

  // 3. O login. Perfil, posts, curtidas, comentários, conversas, tokens de push etc.
  //    são apagados em cascata pelo banco.
  const res = await fetch(`${env('SUPABASE_URL')}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: serviceHeaders(),
  });
  if (!res.ok && res.status !== 404) throw new Error(`auth_delete_${res.status}:${await res.text()}`);
  return json({ ok: true });
}

// ---------- Aviso de denúncia para a equipe ----------

type ReportRow = {
  id: number;
  reason: string;
  post_id: string | null;
  comment_id: string | null;
  message_id: string | null;
  reported_user: string | null;
  created_at: string;
};

export function describeReport(report: ReportRow, hidden: boolean) {
  const what = report.comment_id
    ? 'um comentário'
    : report.post_id
      ? 'um post'
      : report.message_id
        ? 'uma mensagem'
        : 'um perfil';
  return {
    title: 'Nova denúncia no 16:9',
    body: `${report.reason || 'Sem motivo'}: ${what}${hidden ? ' (já escondido)' : ''}. Veja na tabela reports.`,
  };
}

async function notifyTeam(userId: string) {
  const [report] = await db<ReportRow>(
    'reports',
    `select=id,reason,post_id,comment_id,message_id,reported_user,created_at&reporter=eq.${userId}&order=created_at.desc&limit=1`,
  );
  if (!report || Date.now() - new Date(report.created_at).getTime() > FRESH_SECONDS * 1000) {
    return json({ skipped: 'no_recent_report' });
  }

  const team = await db<{ user_id: string }>('team', 'select=user_id');
  if (team.length === 0) return json({ skipped: 'no_team' });
  const tokens = await db<{ token: string }>('push_tokens', `select=token&user_id=in.(${team.map((t) => t.user_id).join(',')})`);
  if (tokens.length === 0) return json({ skipped: 'no_tokens' });

  let hidden = false;
  if (report.comment_id) {
    [{ hidden = false } = {}] = await db<{ hidden: boolean }>('comments', `select=hidden&id=eq.${report.comment_id}`);
  } else if (report.post_id) {
    [{ hidden = false } = {}] = await db<{ hidden: boolean }>('posts', `select=hidden&id=eq.${report.post_id}`);
  }

  const { title, body } = describeReport(report, hidden);
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(tokens.map(({ token }) => ({ to: token, title, body, sound: 'default' }))),
  });
  if (!res.ok) console.error('expo_push_failed', res.status, await res.text());
  return json({ ok: true, sent: tokens.length });
}

// ---------- Entrada ----------

export async function handler(req: Request): Promise<Response> {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const userId = await currentUser(req);
    if (!userId) return json({ error: 'not_authenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    if (body.action === 'delete_account') return await deleteAccount(userId);
    if (body.action === 'report') return await notifyTeam(userId);
    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    console.error('safety_function_error', error);
    return json({ error: 'internal' }, 500);
  }
}

Deno.serve(handler);
