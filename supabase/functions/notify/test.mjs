// Testes da função "notify", com o Supabase e o serviço de push da Expo simulados.
// Rodar: node --experimental-strip-types supabase/functions/notify/test.mjs
import assert from 'node:assert/strict';

const envs = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
globalThis.Deno = { env: { get: (n) => envs[n] }, serve: () => {} };

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const POST = 'aaaaaaaa-0000-0000-0000-000000000001';
const MSG = 'bbbbbbbb-0000-0000-0000-000000000001';
const COMMENT = 'cccccccc-0000-0000-0000-000000000001';
const CONV = 'dddddddd-0000-0000-0000-000000000001';
const now = () => new Date().toISOString();

let tables, sentBatches, ticketFor;
function reset() {
  sentBatches = [];
  ticketFor = () => ({ status: 'ok' });
  tables = {
    profiles: [{ id: A, display_name: 'Andre', username: 'andre' }, { id: B, display_name: 'Paulo', username: 'paulo' }],
    conversations: [{ id: CONV, user_a: A, user_b: B }],
    messages: [{ id: MSG, conversation_id: CONV, sender_id: A, body: 'Viu o ensaio?', created_at: now() }],
    posts: [{ id: POST, user_id: B, title: 'Ensaio na praia' }],
    comments: [{ id: COMMENT, post_id: POST, user_id: A, body: 'Que luz!', created_at: now() }],
    likes: [{ post_id: POST, user_id: A, created_at: now() }],
    blocks: [],
    push_tokens: [{ token: 'ExponentPushToken[b1]', user_id: B }, { token: 'ExponentPushToken[b2]', user_id: B }],
  };
}

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const method = init.method ?? 'GET';
  const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
  if (u.host === 'sb.test' && u.pathname === '/auth/v1/user') {
    const who = { 'Bearer a': A, 'Bearer b': B }[init.headers.authorization];
    return who ? J({ id: who }) : J({}, 401);
  }
  if (u.host === 'sb.test' && u.pathname.startsWith('/rest/v1/')) {
    const table = u.pathname.split('/').pop();
    const params = [...u.searchParams].filter(([k]) => !['select', 'limit'].includes(k));
    let rows = tables[table];
    for (const [k, v] of params) {
      if (k === 'or') {
        // or=(and(blocker.eq.X,blocked.eq.Y),and(blocker.eq.Y,blocked.eq.X))
        const pairs = [...v.matchAll(/blocker\.eq\.([0-9a-f-]+),blocked\.eq\.([0-9a-f-]+)/g)];
        rows = rows.filter((r) => pairs.some(([, x, y]) => r.blocker === x && r.blocked === y));
      } else rows = rows.filter((r) => String(r[k]) === v.replace(/^eq\./, ''));
    }
    if (method === 'DELETE') tables[table] = tables[table].filter((r) => !rows.includes(r));
    return J(rows);
  }
  if (u.host === 'exp.host') {
    const batch = JSON.parse(init.body);
    sentBatches.push(batch);
    return J({ data: batch.map((m) => ticketFor(m)) });
  }
  throw new Error('unexpected ' + url);
};

const { handler } = await import(new URL('./index.ts', import.meta.url).href);
const call = async (auth, body) => {
  const res = await handler(new Request('https://fn/notify', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

// login obrigatório
reset();
assert.equal((await call(null, { kind: 'message', id: MSG })).status, 401);
assert.equal((await call('Bearer x', { kind: 'message', id: MSG })).status, 401);

// mensagem: vai para a outra pessoa, nos dois aparelhos dela
reset();
let r = await call('Bearer a', { kind: 'message', id: MSG });
assert.deepEqual(r.body, { sent: 2 });
assert.equal(sentBatches[0].length, 2);
assert.deepEqual(
  { to: sentBatches[0][0].to, title: sentBatches[0][0].title, body: sentBatches[0][0].body, data: sentBatches[0][0].data },
  { to: 'ExponentPushToken[b1]', title: 'Andre', body: 'Viu o ensaio?', data: { type: 'message', c: CONV } },
);

// post compartilhado (mensagem sem texto)
reset(); tables.messages[0].body = '';
await call('Bearer a', { kind: 'message', id: MSG });
assert.equal(sentBatches[0][0].body, 'Compartilhou um trabalho com você');

// não dá para notificar a mensagem de outra pessoa
reset();
r = await call('Bearer b', { kind: 'message', id: MSG });
assert.deepEqual(r.body, { skipped: 'not_found' }); assert.equal(sentBatches.length, 0);

// coisa antiga não notifica (evita repetição)
reset(); tables.messages[0].created_at = new Date(Date.now() - 10 * 60e3).toISOString();
assert.deepEqual((await call('Bearer a', { kind: 'message', id: MSG })).body, { skipped: 'stale' });

// comentário e curtida vão para o dono do post
reset();
await call('Bearer a', { kind: 'comment', id: COMMENT });
assert.equal(sentBatches[0][0].title, 'Novo comentário'); assert.equal(sentBatches[0][0].body, 'Andre: Que luz!');
assert.deepEqual(sentBatches[0][0].data, { type: 'comment', post: POST });
reset();
await call('Bearer a', { kind: 'like', post_id: POST });
assert.equal(sentBatches[0][0].body, 'Andre curtiu "Ensaio na praia"');
reset(); tables.posts[0].title = '';
await call('Bearer a', { kind: 'like', post_id: POST });
assert.equal(sentBatches[0][0].body, 'Andre curtiu seu trabalho');

// cada aparelho recebe no próprio idioma; idioma desconhecido ou ausente cai no português
reset(); tables.push_tokens = [
  { token: 'ExponentPushToken[b1]', user_id: B, language: 'en' },
  { token: 'ExponentPushToken[b2]', user_id: B, language: 'de' },
  { token: 'ExponentPushToken[b3]', user_id: B, language: 'xx' },
  { token: 'ExponentPushToken[b4]', user_id: B },
];
await call('Bearer a', { kind: 'like', post_id: POST });
assert.deepEqual(sentBatches[0].map((m) => [m.title, m.body]), [
  ['New like', 'Andre liked "Ensaio na praia"'],
  ['Neues Like', 'Andre gefällt "Ensaio na praia"'],
  ['Nova curtida', 'Andre curtiu "Ensaio na praia"'],
  ['Nova curtida', 'Andre curtiu "Ensaio na praia"'],
]);
reset(); tables.push_tokens = [{ token: 'ExponentPushToken[b1]', user_id: B, language: 'es' }];
tables.messages[0].body = ''; tables.messages[0].kind = 'photo'; tables.profiles[0] = { id: A, display_name: '', username: '' };
await call('Bearer a', { kind: 'message', id: MSG });
assert.deepEqual([sentBatches[0][0].title, sentBatches[0][0].body], ['Alguien', 'Envió una foto']);
tables.messages[0].kind = 'audio';
await call('Bearer a', { kind: 'message', id: MSG });
assert.equal(sentBatches[1][0].body, 'Envió un mensaje de voz');
sentBatches.shift();
tables.comments[0].parent_id = null;
await call('Bearer a', { kind: 'comment', id: COMMENT });
assert.deepEqual([sentBatches[1][0].title, sentBatches[1][0].body], ['Nuevo comentario', 'Alguien: Que luz!']);

// curtir o próprio post não notifica
reset(); tables.posts[0].user_id = A;
assert.deepEqual((await call('Bearer a', { kind: 'like', post_id: POST })).body, { skipped: 'self' });

// curtida que não existe (inventada)
reset(); tables.likes = [];
assert.deepEqual((await call('Bearer a', { kind: 'like', post_id: POST })).body, { skipped: 'not_found' });

// bloqueio, em qualquer direção
reset(); tables.blocks = [{ blocker: B, blocked: A }];
assert.deepEqual((await call('Bearer a', { kind: 'like', post_id: POST })).body, { skipped: 'blocked' });
reset(); tables.blocks = [{ blocker: A, blocked: B }];
assert.deepEqual((await call('Bearer a', { kind: 'comment', id: COMMENT })).body, { skipped: 'blocked' });
assert.equal(sentBatches.length, 0);

// sem aparelho registrado
reset(); tables.push_tokens = [];
assert.deepEqual((await call('Bearer a', { kind: 'message', id: MSG })).body, { sent: 0 });

// aparelho que saiu: token removido
reset(); ticketFor = (m) => (m.to.includes('b1') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' });
assert.deepEqual((await call('Bearer a', { kind: 'message', id: MSG })).body, { sent: 1 });
assert.deepEqual(tables.push_tokens.map((t) => t.token), ['ExponentPushToken[b2]']);

// entradas ruins
reset();
assert.deepEqual((await call('Bearer a', { kind: 'message', id: "x' or 1=1" })).body, { skipped: 'bad_id' });
assert.deepEqual((await call('Bearer a', { kind: 'nope' })).body, { skipped: 'unknown_kind' });

console.log('all notify tests passed');
