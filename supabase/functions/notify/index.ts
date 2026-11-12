// 16:9: função "notify" do Supabase (Edge Function).
//
// Envia a notificação push de algo que a pessoa acabou de fazer no app:
//   { kind: 'message', id }        → para a outra pessoa da conversa
//   { kind: 'comment', id }        → para quem publicou o post
//   { kind: 'like', post_id }      → para quem publicou o post
//
// O app só diz "acabei de fazer isto". A função confere no banco que o
// registro existe, é de quem chamou e é recente, e decide sozinha quem recebe
// e o que está escrito. Assim ninguém consegue mandar notificação inventada.
//
// Não precisa de segredos próprios: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
// já vêm prontos. Publicar com "Verify JWT" desligado (o login é conferido aqui).
//
// Sem dependências, de propósito: só fetch.

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

/** Só notifica o que acabou de acontecer; pedidos sobre coisas antigas são ignorados. */
const FRESH_SECONDS = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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

// ---------- Banco (PostgREST com a chave de serviço) ----------

async function db<T>(method: string, table: string, query: string): Promise<T[]> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/${table}?${query}`, {
    method,
    headers: { apikey: key, authorization: `Bearer ${key}`, prefer: 'return=representation' },
  });
  if (!res.ok) throw new Error(`db_${table}_${res.status}:${await res.text()}`);
  return res.json();
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

function isFresh(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < FRESH_SECONDS * 1000;
}

async function displayName(userId: string) {
  const [profile] = await db<{ display_name: string; username: string }>(
    'GET',
    'profiles',
    `select=display_name,username&id=eq.${userId}`,
  );
  return profile?.display_name || (profile?.username ? `@${profile.username}` : null);
}

/** Verdadeiro se qualquer um dos dois bloqueou o outro. */
async function blocked(a: string, b: string) {
  const rows = await db<{ blocker: string }>(
    'GET',
    'blocks',
    `select=blocker&or=(and(blocker.eq.${a},blocked.eq.${b}),and(blocker.eq.${b},blocked.eq.${a}))&limit=1`,
  );
  return rows.length > 0;
}

function clip(text: string, max = 140) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

// ---------- O que notificar ----------

// ---------- Textos, no idioma de cada aparelho ----------

const TEXTS = {
  pt: {
    someone: 'Alguém',
    photo: 'Enviou uma foto',
    video: 'Enviou um vídeo',
    shared: 'Compartilhou um trabalho com você',
    reply: 'Responderam seu comentário',
    comment: 'Novo comentário',
    like: 'Nova curtida',
    liked: '{name} curtiu {work}',
    yourWork: 'seu trabalho',
  },
  en: {
    someone: 'Someone',
    photo: 'Sent a photo',
    video: 'Sent a video',
    shared: 'Shared a work with you',
    reply: 'New reply to your comment',
    comment: 'New comment',
    like: 'New like',
    liked: '{name} liked {work}',
    yourWork: 'your work',
  },
  es: {
    someone: 'Alguien',
    photo: 'Envió una foto',
    video: 'Envió un video',
    shared: 'Compartió un trabajo contigo',
    reply: 'Respondieron a tu comentario',
    comment: 'Nuevo comentario',
    like: 'Nuevo me gusta',
    liked: 'A {name} le gustó {work}',
    yourWork: 'tu trabajo',
  },
  fr: {
    someone: 'Quelqu’un',
    photo: 'A envoyé une photo',
    video: 'A envoyé une vidéo',
    shared: 'A partagé un travail avec vous',
    reply: 'Nouvelle réponse à votre commentaire',
    comment: 'Nouveau commentaire',
    like: 'Nouveau j’aime',
    liked: '{name} a aimé {work}',
    yourWork: 'votre travail',
  },
  it: {
    someone: 'Qualcuno',
    photo: 'Ha inviato una foto',
    video: 'Ha inviato un video',
    shared: 'Ha condiviso un lavoro con te',
    reply: 'Nuova risposta al tuo commento',
    comment: 'Nuovo commento',
    like: 'Nuovo mi piace',
    liked: 'A {name} piace {work}',
    yourWork: 'il tuo lavoro',
  },
  de: {
    someone: 'Jemand',
    photo: 'Hat ein Foto gesendet',
    video: 'Hat ein Video gesendet',
    shared: 'Hat eine Arbeit mit dir geteilt',
    reply: 'Neue Antwort auf deinen Kommentar',
    comment: 'Neuer Kommentar',
    like: 'Neues Like',
    liked: '{name} gefällt {work}',
    yourWork: 'deine Arbeit',
  },
};

type Language = keyof typeof TEXTS;
type Texts = (typeof TEXTS)[Language];

/** Idioma gravado com o aparelho; sem idioma (aparelho antigo), português. */
function textsFor(language: string | undefined): Texts {
  return TEXTS[(language ?? '') as Language] ?? TEXTS.pt;
}

/** `write` monta o título e o texto no idioma do aparelho que vai receber. */
type Push = {
  to: string;
  data: Record<string, string>;
  write: (texts: Texts) => { title: string; body: string };
};

/** Monta a notificação, ou devolve o motivo de não enviar. */
async function compose(userId: string, input: Record<string, unknown>): Promise<Push | { skipped: string }> {
  // Quem não tem nome vira "Alguém" no idioma de quem recebe.
  const sender = async () => {
    const name = await displayName(userId);
    return (texts: Texts) => name ?? texts.someone;
  };

  if (input.kind === 'message') {
    if (typeof input.id !== 'string' || !UUID.test(input.id)) return { skipped: 'bad_id' };
    const [message] = await db<{ conversation_id: string; body: string; kind?: string; created_at: string }>(
      'GET',
      'messages',
      `select=*&id=eq.${input.id}&sender_id=eq.${userId}`,
    );
    if (!message) return { skipped: 'not_found' };
    if (!isFresh(message.created_at)) return { skipped: 'stale' };
    const [conversation] = await db<{ user_a: string; user_b: string }>(
      'GET',
      'conversations',
      `select=user_a,user_b&id=eq.${message.conversation_id}`,
    );
    if (!conversation) return { skipped: 'not_found' };
    const to = conversation.user_a === userId ? conversation.user_b : conversation.user_a;
    const name = await sender();
    return {
      to,
      data: { type: 'message', c: message.conversation_id },
      write: (texts) => ({
        title: name(texts),
        body: message.body
          ? clip(message.body)
          : message.kind === 'photo'
            ? texts.photo
            : message.kind === 'video'
              ? texts.video
              : texts.shared,
      }),
    };
  }

  if (input.kind === 'comment') {
    if (typeof input.id !== 'string' || !UUID.test(input.id)) return { skipped: 'bad_id' };
    const [comment] = await db<{ post_id: string; body: string; parent_id?: string | null; created_at: string }>(
      'GET',
      'comments',
      `select=*&id=eq.${input.id}&user_id=eq.${userId}`,
    );
    if (!comment) return { skipped: 'not_found' };
    if (!isFresh(comment.created_at)) return { skipped: 'stale' };
    // Resposta avisa quem escreveu o comentário; comentário novo avisa o dono do post.
    if (comment.parent_id) {
      const [parent] = await db<{ user_id: string }>('GET', 'comments', `select=user_id&id=eq.${comment.parent_id}`);
      if (!parent) return { skipped: 'not_found' };
      const name = await sender();
      return {
        to: parent.user_id,
        data: { type: 'comment', post: comment.post_id },
        write: (texts) => ({ title: texts.reply, body: `${name(texts)}: ${clip(comment.body, 110)}` }),
      };
    }
    const [post] = await db<{ user_id: string }>('GET', 'posts', `select=user_id&id=eq.${comment.post_id}`);
    if (!post) return { skipped: 'not_found' };
    const name = await sender();
    return {
      to: post.user_id,
      data: { type: 'comment', post: comment.post_id },
      write: (texts) => ({ title: texts.comment, body: `${name(texts)}: ${clip(comment.body, 110)}` }),
    };
  }

  if (input.kind === 'like') {
    if (typeof input.post_id !== 'string' || !UUID.test(input.post_id)) return { skipped: 'bad_id' };
    const [like] = await db<{ created_at: string }>(
      'GET',
      'likes',
      `select=created_at&post_id=eq.${input.post_id}&user_id=eq.${userId}`,
    );
    if (!like) return { skipped: 'not_found' };
    if (!isFresh(like.created_at)) return { skipped: 'stale' };
    const [post] = await db<{ user_id: string; title: string }>(
      'GET',
      'posts',
      `select=user_id,title&id=eq.${input.post_id}`,
    );
    if (!post) return { skipped: 'not_found' };
    const name = await sender();
    const postId = input.post_id;
    return {
      to: post.user_id,
      data: { type: 'like', post: postId },
      write: (texts) => ({
        title: texts.like,
        body: texts.liked
          .replace('{name}', () => name(texts))
          .replace('{work}', () => (post.title ? `"${clip(post.title, 60)}"` : texts.yourWork)),
      }),
    };
  }

  return { skipped: 'unknown_kind' };
}

// ---------- Envio (serviço de push da Expo) ----------

async function send(push: Push) {
  // select=* para funcionar também antes de a coluna de idioma existir no banco.
  const tokens = await db<{ token: string; language?: string }>('GET', 'push_tokens', `select=*&user_id=eq.${push.to}`);
  if (tokens.length === 0) return { sent: 0 };

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(
      tokens.map(({ token, language }) => ({ to: token, ...push.write(textsFor(language)), data: push.data, sound: 'default' })),
    ),
  });
  if (!res.ok) {
    console.error('expo_push_failed', res.status, await res.text());
    return { sent: 0 };
  }

  // Aparelho que desinstalou o app ou desligou as notificações: o token sai do banco.
  const { data } = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
  let sent = 0;
  for (const [i, ticket] of (data ?? []).entries()) {
    if (ticket.status === 'ok') sent++;
    else if (ticket.details?.error === 'DeviceNotRegistered') {
      await db('DELETE', 'push_tokens', `token=eq.${encodeURIComponent(tokens[i].token)}`);
    }
  }
  return { sent };
}

// ---------- Entrada ----------

export async function handler(req: Request): Promise<Response> {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const userId = await currentUser(req);
    if (!userId) return json({ error: 'not_authenticated' }, 401);

    const input = await req.json().catch(() => ({}));
    const push = await compose(userId, input);
    if ('skipped' in push) return json(push);
    // Nada de notificar a si mesmo, nem quem bloqueou ou foi bloqueado.
    if (push.to === userId) return json({ skipped: 'self' });
    if (await blocked(userId, push.to)) return json({ skipped: 'blocked' });

    return json(await send(push));
  } catch (error) {
    console.error('notify_function_error', error);
    return json({ error: 'internal' }, 500);
  }
}

Deno.serve(handler);
