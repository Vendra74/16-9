// Testes da função "safety", com Supabase, Storage, Mux e push da Expo simulados.
// Rodar: node --experimental-strip-types supabase/functions/safety/test.mjs
import assert from 'node:assert/strict';

const envs = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', MUX_TOKEN_ID: 'id', MUX_TOKEN_SECRET: 's' };
globalThis.Deno = { env: { get: (n) => envs[n] }, serve: () => {} };

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const CONV = 'dddddddd-0000-0000-0000-000000000001';

let calls, tables, folders, authDelete;
function reset() {
  calls = [];
  authDelete = 200;
  tables = {
    conversations: [{ id: CONV }],
    posts: [
      { image_path: `${A}/p1.jpg`, extra_images: [`${A}/p2.jpg`], mux_asset_id: null, mux_upload_id: null, status: 'ready' },
      { image_path: `${A}/v1.jpg`, extra_images: [], mux_asset_id: 'asset1', mux_upload_id: 'up1', status: 'ready' },
      { image_path: `${A}/v2.jpg`, extra_images: [], mux_asset_id: null, mux_upload_id: 'up2', status: 'processing' },
    ],
    messages: [{ image_path: `${CONV}/${B}/m.jpg`, mux_asset_id: 'asset2', mux_upload_id: 'up3', status: 'ready' }],
    reports: [{ id: 1, reason: 'Conteúdo impróprio', post_id: 'p', comment_id: null, message_id: null, reported_user: B, created_at: new Date().toISOString() }],
    team: [{ user_id: B }],
    push_tokens: [{ token: 'ExponentPushToken[b]' }],
    posts_hidden: [{ hidden: true }],
  };
  folders = { posts: [`p1.jpg`, `orfao.jpg`], avatars: ['a.jpg'] };
}

globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const method = init.method ?? 'GET';
  calls.push({ url, method, body: init.body });
  const ok = (body, status = 200) => new Response(JSON.stringify(body), { status });
  if (url.endsWith('/auth/v1/user')) {
    return init.headers.authorization === 'Bearer tokenA' ? ok({ id: A }) : ok({}, 401);
  }
  if (url.includes('/auth/v1/admin/users/')) return ok({}, authDelete);
  if (url.includes('/storage/v1/object/list/')) {
    const bucket = url.split('/').pop();
    return ok((folders[bucket] ?? []).map((name) => ({ name, id: 'x' })).concat([{ name: 'sub', id: null }]));
  }
  if (url.includes('/storage/v1/object/')) return ok([]);
  if (url.startsWith('https://api.mux.com')) return method === 'DELETE' ? new Response(null, { status: 204 }) : ok({});
  if (url.startsWith('https://exp.host')) return ok({ data: [] });
  const table = url.split('/rest/v1/')[1].split('?')[0];
  if (table === 'posts' && url.includes('select=hidden')) return ok(tables.posts_hidden);
  return ok(tables[table] ?? []);
};

const { handler, describeReport } = await import('./index.ts');
const call = (body, token = 'tokenA') =>
  handler(new Request('https://f.test', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));

// Sem login: recusa.
reset();
assert.equal((await call({ action: 'delete_account' }, 'outro')).status, 401);
assert.ok(!calls.some((c) => c.url.includes('admin/users')));

// Apagar conta: Mux, Storage e login, nesta ordem.
reset();
let res = await call({ action: 'delete_account' });
assert.equal(res.status, 200);
const mux = calls.filter((c) => c.url.startsWith('https://api.mux.com')).map((c) => `${c.method} ${c.url.replace('https://api.mux.com', '')}`);
assert.deepEqual(mux, ['DELETE /video/v1/assets/asset1', 'PUT /video/v1/uploads/up2/cancel', 'DELETE /video/v1/assets/asset2']);
const removed = calls.filter((c) => c.method === 'DELETE' && c.url.includes('/storage/v1/object/'));
const postsRemoved = JSON.parse(removed.find((c) => c.url.endsWith('/posts')).body).prefixes;
assert.deepEqual(postsRemoved.sort(), [`${A}/orfao.jpg`, `${A}/p1.jpg`, `${A}/p2.jpg`, `${A}/v1.jpg`, `${A}/v2.jpg`].sort());
assert.deepEqual(JSON.parse(removed.find((c) => c.url.endsWith('/avatars')).body).prefixes, [`${A}/a.jpg`]);
assert.deepEqual(JSON.parse(removed.find((c) => c.url.endsWith('/messages')).body).prefixes, [`${CONV}/${B}/m.jpg`]);
const authIdx = calls.findIndex((c) => c.url.endsWith(`/auth/v1/admin/users/${A}`) && c.method === 'DELETE');
assert.ok(authIdx > calls.findIndex((c) => c.url.startsWith('https://api.mux.com')), 'login apagado depois do Mux');
assert.equal(authIdx, calls.length - 1, 'login é a última coisa');

// Se o login falhar, responde erro (o app avisa e a pessoa tenta de novo).
reset();
authDelete = 500;
assert.equal((await call({ action: 'delete_account' })).status, 500);

// Denúncia: avisa a equipe por push.
reset();
res = await call({ action: 'report' });
assert.deepEqual(await res.json(), { ok: true, sent: 1 });
const push = JSON.parse(calls.find((c) => c.url.startsWith('https://exp.host')).body);
assert.equal(push[0].to, 'ExponentPushToken[b]');
assert.match(push[0].body, /Conteúdo impróprio: um post \(já escondido\)/);

// Denúncia antiga não gera aviso.
reset();
tables.reports[0].created_at = new Date(Date.now() - 10 * 60 * 1000).toISOString();
assert.deepEqual(await (await call({ action: 'report' })).json(), { skipped: 'no_recent_report' });

// Sem equipe cadastrada: nada a enviar.
reset();
tables.team = [];
assert.deepEqual(await (await call({ action: 'report' })).json(), { skipped: 'no_team' });

assert.equal(describeReport({ reason: '', comment_id: 'c' }, false).body, 'Sem motivo: um comentário. Veja na tabela reports.');

console.log('safety: todos os testes passaram');
