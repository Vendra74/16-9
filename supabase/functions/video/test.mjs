// Testes da função "video", com o Mux e o Supabase simulados.
// Rodar: node --experimental-strip-types supabase/functions/video/test.mjs
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
const envs = { MUX_TOKEN_ID:'tid', MUX_TOKEN_SECRET:'tsec', MUX_WEBHOOK_SECRET:'whsec', SUPABASE_URL:'https://sb.test', SUPABASE_SERVICE_ROLE_KEY:'svc' };
globalThis.Deno = { env: { get: (n) => envs[n] }, serve: () => {} };
const A='11111111-1111-1111-1111-111111111111';
let posts, calls;
const reset = () => { calls=[]; posts=[{id:'aaaaaaaa-0000-0000-0000-000000000001', user_id:A, mux_upload_id:'up1', mux_asset_id:null, status:'processing'}]; };
globalThis.fetch = async (url, init={}) => {
  const u = new URL(url); const method = init.method ?? 'GET'; calls.push(`${method} ${u.host}${u.pathname}${u.search}`);
  const J = (b, s=200) => new Response(JSON.stringify(b), {status:s});
  if (u.host==='sb.test' && u.pathname==='/auth/v1/user') return init.headers.authorization==='Bearer good' ? J({id:A}) : J({},401);
  if (u.host==='sb.test' && u.pathname==='/rest/v1/posts') {
    const f = [...u.searchParams].filter(([k])=>k!=='select').map(([k,v])=>[k, v.replace(/^eq\./,'')]);
    const rows = posts.filter(p => f.every(([k,v]) => String(p[k])===v));
    if (method==='PATCH') rows.forEach(r => Object.assign(r, JSON.parse(init.body)));
    return J(rows);
  }
  if (u.host==='api.mux.com') {
    assert.equal(init.headers.authorization, 'Basic '+btoa('tid:tsec'));
    if (method==='POST' && u.pathname==='/video/v1/uploads') { const b=JSON.parse(init.body); assert.equal(b.new_asset_settings.passthrough, A); return J({data:{id:'upNEW', url:'https://storage.mux/put'}},201); }
    return J({}, 204 === 204 ? 200 : 0);
  }
  throw new Error('unexpected '+url);
};
const { handler, verifySignature } = await import(new URL('./index.ts', import.meta.url).href);
const post = (headers, body) => handler(new Request('https://fn/video', {method:'POST', headers, body: typeof body==='string'?body:JSON.stringify(body)}));
const hook = (event, {secret='whsec', t=Math.floor(Date.now()/1000)}={}) => { const raw=JSON.stringify(event); const v1=createHmac('sha256',secret).update(`${t}.${raw}`).digest('hex'); return post({'mux-signature':`t=${t},v1=${v1}`}, raw); };

reset(); let r = await post({}, {action:'upload'}); assert.equal(r.status, 401);
r = await post({authorization:'Bearer bad'}, {action:'upload'}); assert.equal(r.status, 401);
r = await post({authorization:'Bearer good'}, {action:'upload'}); assert.deepEqual(await r.json(), {upload_id:'upNEW', url:'https://storage.mux/put'});
r = await post({authorization:'Bearer good'}, {action:'nope'}); assert.equal(r.status, 400);
// webhook: bad signature, stale timestamp
r = await hook({type:'video.asset.ready'}, {secret:'wrong'}); assert.equal(r.status, 401);
r = await hook({type:'video.asset.ready'}, {t: Math.floor(Date.now()/1000)-3600}); assert.equal(r.status, 401);
// created → asset id stored
reset(); r = await hook({type:'video.asset.created', data:{id:'as1', upload_id:'up1'}}); assert.equal(r.status,200); assert.equal(posts[0].mux_asset_id,'as1');
// ready → published
r = await hook({type:'video.asset.ready', data:{id:'as1', upload_id:'up1', passthrough:A, duration:42.5, aspect_ratio:'16:9', playback_ids:[{id:'pb1', policy:'public'}]}});
assert.equal(posts[0].status,'ready'); assert.equal(posts[0].video_url,'https://stream.mux.com/pb1.m3u8'); assert.equal(posts[0].duration,42.5);
assert.ok(!calls.some(c=>c.startsWith('DELETE')));
// too long → failed + asset deleted
reset(); await hook({type:'video.asset.ready', data:{id:'as2', upload_id:'up1', passthrough:A, duration:95, aspect_ratio:'16:9', playback_ids:[{id:'pb', policy:'public'}]}});
assert.equal(posts[0].status,'failed'); assert.ok(calls.includes('DELETE api.mux.com/video/v1/assets/as2'));
// vertical → failed
reset(); await hook({type:'video.asset.ready', data:{id:'as3', upload_id:'up1', passthrough:A, duration:10, aspect_ratio:'9:16', playback_ids:[{id:'pb', policy:'public'}]}});
assert.equal(posts[0].status,'failed');
// someone else's passthrough → no match → asset deleted, post untouched
reset(); await hook({type:'video.asset.ready', data:{id:'as4', upload_id:'up1', passthrough:'22222222-2222-2222-2222-222222222222', duration:10, aspect_ratio:'16:9', playback_ids:[{id:'pb', policy:'public'}]}});
assert.equal(posts[0].status,'processing'); assert.ok(calls.includes('DELETE api.mux.com/video/v1/assets/as4'));
// errored
reset(); await hook({type:'video.asset.errored', data:{id:'as5', upload_id:'up1'}}); assert.equal(posts[0].status,'failed');
reset(); await hook({type:'video.upload.cancelled', data:{id:'up1'}}); assert.equal(posts[0].status,'failed');
// delete: asset known → delete; unknown → cancel upload; other user's post → 404
reset(); posts[0].mux_asset_id='as9'; r = await post({authorization:'Bearer good'}, {action:'delete', post_id:posts[0].id}); assert.equal(r.status,200); assert.ok(calls.includes('DELETE api.mux.com/video/v1/assets/as9'));
reset(); r = await post({authorization:'Bearer good'}, {action:'delete', post_id:posts[0].id}); assert.ok(calls.includes('PUT api.mux.com/video/v1/uploads/up1/cancel'));
reset(); posts[0].user_id='22222222-2222-2222-2222-222222222222'; r = await post({authorization:'Bearer good'}, {action:'delete', post_id:posts[0].id}); assert.equal(r.status,404);
r = await post({authorization:'Bearer good'}, {action:'delete', post_id:"x' or 1=1"}); assert.equal(r.status,400);
assert.equal(await verifySignature('garbage','{}','whsec',1), false);
console.log('all function tests passed');
