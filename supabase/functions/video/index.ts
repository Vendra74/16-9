// 16:9: função "video" do Supabase (Edge Function).
//
// Faz a ponte entre o app e o Mux, que guarda e converte os vídeos:
//   1. O app pede um endereço de envio          → { action: 'upload' }
//   2. O Mux avisa quando o vídeo ficou pronto  → webhook (cabeçalho mux-signature)
//      O vídeo pode ser de um post ou de uma mensagem; as colunas são as mesmas.
//   3. O app avisa que apagou um post de vídeo  → { action: 'delete', post_id }
//
// Segredos necessários (Edge Functions → Secrets):
//   MUX_TOKEN_ID, MUX_TOKEN_SECRET, MUX_WEBHOOK_SECRET
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm prontos do Supabase.
//
// Publicar com "Verify JWT" DESLIGADO: o Mux não manda login do Supabase.
// O login de quem usa o app é conferido aqui dentro.
//
// Sem dependências, de propósito: só fetch e Web Crypto.

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

/** Limite do produto: vídeos de até 1 minuto (com uma folga para arredondamentos). */
const MAX_SECONDS = 62;
/** Aceita avisos do Mux com até 5 minutos de atraso. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// ---------- Mux ----------

async function mux(method: string, path: string, body?: unknown) {
  const auth = btoa(`${env('MUX_TOKEN_ID')}:${env('MUX_TOKEN_SECRET')}`);
  return fetch(`https://api.mux.com${path}`, {
    method,
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function deleteAsset(assetId: string) {
  const res = await mux('DELETE', `/video/v1/assets/${assetId}`);
  // 404 = já não existe; para nós dá no mesmo.
  if (!res.ok && res.status !== 404) console.error('mux_delete_failed', assetId, res.status);
}

// ---------- Banco (PostgREST com a chave de serviço) ----------

type PostRow = { id: string; mux_upload_id: string | null; mux_asset_id: string | null };

/** Onde um vídeo pode morar, e a coluna que diz de quem ele é. */
const TABLES = [
  { name: 'posts', owner: 'user_id' },
  { name: 'messages', owner: 'sender_id' },
] as const;

async function db(method: string, query: string, body?: unknown, table = 'posts'): Promise<PostRow[]> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/${table}?${query}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`db_${res.status}:${await res.text()}`);
  return res.json();
}

const COLUMNS = 'select=id,mux_upload_id,mux_asset_id';

/**
 * Atualiza o post ou a mensagem daquele envio. `ownerId` confere o dono;
 * `extra` acrescenta filtros. Devolve quantas linhas mudaram.
 */
async function patchVideo(uploadId: string, changes: unknown, ownerId?: string, extra = '') {
  for (const table of TABLES) {
    const where =
      `mux_upload_id=eq.${encodeURIComponent(uploadId)}` + (ownerId ? `&${table.owner}=eq.${ownerId}` : '') + extra;
    const rows = await db('PATCH', where, changes, table.name);
    if (rows.length > 0) return rows.length;
  }
  return 0;
}

/** Quem está chamando, pelo login do Supabase. `null` se o login não vale. */
async function currentUser(req: Request): Promise<string | null> {
  const authorization = req.headers.get('authorization') ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  const res = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, {
    headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), authorization },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return typeof user?.id === 'string' ? user.id : null;
}

// ---------- Pedidos do app ----------

async function startUpload(userId: string) {
  const res = await mux('POST', '/video/v1/uploads', {
    cors_origin: '*',
    timeout: 3600,
    new_asset_settings: {
      playback_policy: ['public'],
      video_quality: 'basic',
      max_resolution_tier: '1080p',
      // Volta no aviso do Mux: confere que o post é de quem pediu o envio.
      passthrough: userId,
    },
  });
  if (!res.ok) {
    console.error('mux_upload_failed', res.status, await res.text());
    return json({ error: 'mux_unavailable' }, 502);
  }
  const { data } = await res.json();
  return json({ upload_id: data.id, url: data.url });
}

async function releaseVideo(userId: string, postId: unknown) {
  if (typeof postId !== 'string' || !UUID.test(postId)) return json({ error: 'bad_post_id' }, 400);
  const [post] = await db('GET', `${COLUMNS}&id=eq.${postId}&user_id=eq.${userId}`);
  if (!post) return json({ error: 'not_found' }, 404);
  if (post.mux_asset_id) {
    await deleteAsset(post.mux_asset_id);
  } else if (post.mux_upload_id) {
    // Ainda enviando: cancela para o Mux não criar o vídeo depois.
    await mux('PUT', `/video/v1/uploads/${post.mux_upload_id}/cancel`);
  }
  return json({ ok: true });
}

// ---------- Aviso do Mux (webhook) ----------

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compara sem vazar, pelo tempo de resposta, onde as duas diferem. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** O cabeçalho vem como "t=<segundos>,v1=<assinatura>". */
export async function verifySignature(header: string, rawBody: string, secret: string, nowSeconds: number) {
  const parts = new Map(header.split(',').map((p) => p.trim().split('=') as [string, string]));
  const t = parts.get('t');
  const v1 = parts.get('v1');
  if (!t || !v1 || !/^\d+$/.test(t)) return false;
  if (Math.abs(nowSeconds - Number(t)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`));
  return safeEqual(hex(signature), v1.toLowerCase());
}

type MuxEvent = {
  type?: string;
  data?: {
    id?: string;
    upload_id?: string;
    passthrough?: string;
    duration?: number;
    aspect_ratio?: string;
    playback_ids?: { id: string; policy: string }[];
  };
};

/** "16:9" → 1.78. Sem informação, considera horizontal. */
function ratio(aspect: string | undefined) {
  const [w, h] = (aspect ?? '').split(':').map(Number);
  return w > 0 && h > 0 ? w / h : 16 / 9;
}

async function handleWebhook(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get('mux-signature') ?? '';
  const valid = await verifySignature(signature, raw, env('MUX_WEBHOOK_SECRET'), Math.floor(Date.now() / 1000));
  if (!valid) return json({ error: 'bad_signature' }, 401);

  const event: MuxEvent = JSON.parse(raw);
  const data = event.data ?? {};

  switch (event.type) {
    // O vídeo foi criado a partir do envio: guarda o id para poder apagar depois.
    case 'video.asset.created': {
      if (data.id && data.upload_id) {
        await patchVideo(data.upload_id, { mux_asset_id: data.id });
      }
      break;
    }

    case 'video.asset.ready': {
      if (!data.id || !data.upload_id) break;
      const playback = data.playback_ids?.find((p) => p.policy === 'public');
      const tooLong = (data.duration ?? 0) > MAX_SECONDS;
      const vertical = ratio(data.aspect_ratio) < 1;
      const owner = UUID.test(data.passthrough ?? '') ? data.passthrough : undefined;

      if (!playback || tooLong || vertical) {
        await deleteAsset(data.id);
        await patchVideo(data.upload_id, { status: 'failed', mux_asset_id: null }, owner);
        break;
      }

      const updated = await patchVideo(
        data.upload_id,
        {
          status: 'ready',
          video_url: `https://stream.mux.com/${playback.id}.m3u8`,
          duration: data.duration ?? null,
          mux_asset_id: data.id,
        },
        owner,
      );
      // O post ou a mensagem foi apagado (ou nunca existiu): não deixa vídeo órfão gerando custo.
      if (updated === 0) await deleteAsset(data.id);
      break;
    }

    case 'video.asset.errored': {
      if (data.upload_id) await patchVideo(data.upload_id, { status: 'failed' });
      break;
    }

    // Nestes dois, o id do aviso é o próprio id do envio.
    case 'video.upload.errored':
    case 'video.upload.cancelled': {
      if (data.id) await patchVideo(data.id, { status: 'failed' }, undefined, '&status=eq.processing');
      break;
    }
  }

  return json({ ok: true });
}

// ---------- Entrada ----------

export async function handler(req: Request): Promise<Response> {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    if (req.headers.has('mux-signature')) return await handleWebhook(req);

    const userId = await currentUser(req);
    if (!userId) return json({ error: 'not_authenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    if (body.action === 'upload') return await startUpload(userId);
    if (body.action === 'delete') return await releaseVideo(userId, body.post_id);
    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    // Erro nosso: responde 500 para o Mux tentar o aviso de novo mais tarde.
    console.error('video_function_error', error);
    return json({ error: 'internal' }, 500);
  }
}

Deno.serve(handler);
