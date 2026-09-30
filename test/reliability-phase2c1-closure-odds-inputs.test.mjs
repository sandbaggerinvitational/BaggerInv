// API / UNIT. Actual handler with deterministic canonical dependencies; no hosted proof.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
async function handler(overrides={}) {
  const key=`odds-input-closure-${randomUUID()}`;
  const dependencies={env:{VERCEL_ENV:'preview'},NextResponse:Response,withOperationalRoute:(_,fn)=>fn,recordOperationalError:()=>{},
    authorizePreviewDirector:async()=>({status:'active',identity:{tournamentId:'2098'}}),
    loadSupabaseOddsInputs:async id=>{assert.equal(id,'2098');return {sheets:{tournaments:[{Year:2098}]},metadata:{authority:'supabase'}};},
    readPublishedOddsView:async scope=>{assert.equal(scope.tournamentId,'2098');return {payload:{ok:true,data:{}}};},
    publishedOddsSnapshotsFromView:()=>[],simulateTournamentOdds:()=>({synthetic:true}),compareOddsDeterministicParity:()=>({equal:true}),...overrides};
  globalThis[key]=dependencies;
  const source=(await readFile(new URL('../app/api/odds/inputs/route.js',import.meta.url),'utf8'))
    .replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];\n/gm,(_,bindings)=>`const {${bindings}}=globalThis[${JSON.stringify(key)}];\n`)
    .replaceAll('process.env',`globalThis[${JSON.stringify(key)}].env`);
  const route=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${key}`);
  return {route,cleanup:()=>delete globalThis[key]};
}
const request=action=>new Request('http://localhost/api/odds/inputs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});
test('API legacy Odds refresh is terminal410 before any provider or canonical write',async t=>{
 const h=await handler({loadSupabaseOddsInputs:()=>assert.fail('retired import cannot read or write')});t.after(h.cleanup);
 const response=await h.route.POST(request('refresh'));assert.equal(response.status,410);assert.equal((await response.json()).code,'ODDS_LEGACY_IMPORT_RETIRED');
});
test('API zero-Google Odds verification reads current canonical scope without an import',async t=>{
 const h=await handler();t.after(h.cleanup);const response=await h.route.POST(request('verify-current'));assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.ok,true);assert.equal(body.action,'verify-current');assert.equal(body.reason,'NO_RETAINED_PUBLICATION');
});
test('SECURITY Odds verification denies unauthenticated callers before canonical read',async t=>{
 const h=await handler({authorizePreviewDirector:async()=>({status:'inactive'}),loadSupabaseOddsInputs:()=>assert.fail('unauthorized read')});t.after(h.cleanup);
 assert.equal((await h.route.POST(request('verify-current'))).status,401);
});
test('SOURCE current Odds verification control never selects retired refresh',async()=>{
 const client=await readFile(new URL('../app/odds-center/admin/OddsAdmin.js',import.meta.url),'utf8');
 assert.match(client,/verifySupabaseInputs/);assert.match(client,/action: "verify-current"/);assert.doesNotMatch(client,/action: "refresh"|refreshSupabaseInputs/);
});
