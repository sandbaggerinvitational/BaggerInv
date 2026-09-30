import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {readIsolatedCanonicalDirectorOverview,mutateIsolatedCanonicalDirectorMatch} from '../lib/canonical-director-overview.js';
import {loadCanonicalDirectorOverview,submitCanonicalDirectorOperation,canonicalDirectorFailureOutcome,canonicalDirectorFailureDisposition} from '../lib/canonical-director-client.js';

const env={VERCEL_ENV:'preview',SUPABASE_SCORING_MIRROR_URL:'https://idgigvjjqkfbqjeredpb.supabase.co',SUPABASE_SCORING_MIRROR_SECRET_KEY:'synthetic-not-a-real-key'};
const authorization={status:'active',source:'entitlement',identity:{authUserId:'00000000-0000-4000-8000-000000000001',actor:{id:'D1',role:'DIRECTOR'},tournamentId:'2098'}};
const view={tournament:{tournament_id:'2098',tournament_year:2098,name:'Synthetic Future Tournament'},teams:[],rounds:[],matches:[]};
const dependencies={scoringShadowRpc:async()=>({payload:{ok:true,contract:'preview-director-canonical-controls-v1',google_runtime:'RETIRED',actions:['finalize','reopen']}}),readTournamentLiveView:async(id,options)=>{assert.equal(id,'2098');assert.equal(options.env,env);return {payload:{ok:true,data:view}};}};
async function route(deps={}){
 const key=`director-closure-${randomUUID()}`;
 globalThis[key]={NextResponse:Response,withOperationalRoute:(_,fn)=>fn,recordOperationalError:()=>{},authorizePreviewDirector:async()=>authorization,
 readIsolatedCanonicalDirectorOverview:({authorization:a})=>readIsolatedCanonicalDirectorOverview({authorization:a,env},dependencies),...deps};
 const src=(await readFile(new URL('../app/api/director/canonical-overview/route.js',import.meta.url),'utf8')).replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];\n/gm,(_,b)=>`const {${b.replace(/\bas\b/g,':')}}=globalThis[${JSON.stringify(key)}];\n`);
 try{return await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}#${key}`);}finally{delete globalThis[key];}
}

test('INTEGRATION NA-2026-DIRECTOR-CANONICAL-ROUTING: shipping client reaches canonical route with zero Google',async()=>{
 const handler=await route();const paths=[];
 const data=await loadCanonicalDirectorOverview({fetchImpl:async(path,init)=>{paths.push(path);assert.equal(init.credentials,'same-origin');return handler.GET(new Request(`http://localhost${path}`));}});
 assert.deepEqual(paths,['/api/director/canonical-overview']);assert.equal(data.tournament.id,'2098');assert.equal(data.googleRequests,0);assert.equal(data.fallbackUsed,false);
 assert.equal(data.workerHealth.status,'NOT_OBSERVED');assert.equal(data.capabilities.matchControls,true);
});
for(const status of ['inactive','forbidden','unavailable'])test(`SECURITY Director ${status} denied before canonical read`,async()=>{
 const handler=await route({authorizePreviewDirector:async()=>({status}),readIsolatedCanonicalDirectorOverview:()=>assert.fail('unauthorized read')});
 const response=await handler.GET(new Request('http://localhost/api/director/canonical-overview'));
 assert.equal(response.status,status==='unavailable'?503:403);
});
for(const change of [{source:'production-shadow-entitlement'},{identity:{...authorization.identity,impersonating:true}},{identity:{...authorization.identity,actor:{id:'P1',role:'PLAYER'}}}])test(`SECURITY Director read denies ${JSON.stringify(change)}`,async()=>{
 await assert.rejects(readIsolatedCanonicalDirectorOverview({authorization:{...authorization,...change},env},dependencies),{code:'DIRECTOR_AUTHORIZATION_REQUIRED'});
});
test('SECURITY Production URL cannot be used by isolated Director adapter',async()=>{
 await assert.rejects(readIsolatedCanonicalDirectorOverview({authorization,env:{...env,SUPABASE_SCORING_MIRROR_URL:'https://production.invalid'}},dependencies),{code:'DIRECTOR_CANONICAL_AUTHORITY_REQUIRED'});
});
test('API canonical outage stays local and never selects legacy fallback',async()=>{
 const handler=await route({readIsolatedCanonicalDirectorOverview:async()=>{throw new Error('private provider diagnostics');}});
 const response=await handler.GET(new Request('http://localhost/api/director/canonical-overview'));
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{code:'DIRECTOR_CANONICAL_READ_UNAVAILABLE',error:'Canonical Director data is temporarily unavailable. Refresh this view to retry.'});
});
test('SECURITY canonical result for another tournament fails closed',async()=>{
 await assert.rejects(readIsolatedCanonicalDirectorOverview({authorization,env},{readTournamentLiveView:async()=>({payload:{ok:true,data:{...view,tournament:{tournament_id:'2026'}}}})}),{code:'DIRECTOR_CANONICAL_SCOPE_MISMATCH'});
});
test('UNIT client rejects a forged fallback success instead of retrying Google',async()=>{
 let calls=0;await assert.rejects(loadCanonicalDirectorOverview({fetchImpl:async()=>{calls++;return Response.json({data:{contract:'canonical-director-overview-v1',authority:'google',googleRequests:1}});}}),{code:'DIRECTOR_CANONICAL_RESPONSE_INVALID'});assert.equal(calls,1);
});
test('SOURCE guard: active Director page selects canonical console and no retired route',async()=>{
 const page=await readFile(new URL('../app/admin/director/page.js',import.meta.url),'utf8');
 const client=await readFile(new URL('../app/admin/director/CanonicalDirectorConsole.js',import.meta.url),'utf8');
 assert.doesNotMatch(page,/DirectorDashboard/);assert.match(page,/CanonicalDirectorConsole/);assert.match(page,/result\.status === "inactive" \|\| result\.status === "forbidden"/);
 assert.doesNotMatch(client,/google|scoring-authority|\/api\/director["']/i);
});

for (const method of ['GET','POST']) test(`API ${method} thrown authorization failure is sanitized and feature-local`,async()=>{
 const handler=await route({authorizePreviewDirector:async()=>{throw new Error('private account detail');},readIsolatedCanonicalDirectorOverview:()=>assert.fail('read after failed auth'),mutateIsolatedCanonicalDirectorMatch:()=>assert.fail('write after failed auth')});
 const response=await handler[method](new Request('http://localhost/api/director/canonical-overview',{method,headers:{origin:'http://localhost'},...(method==='POST'?{body:'{}'}:{})}));
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{code:'DIRECTOR_AUTHORIZATION_UNAVAILABLE',error:'Director verification is temporarily unavailable.'});
});
for (const origin of [undefined,'https://untrusted.invalid']) test(`SECURITY POST rejects ${origin||'missing'} origin before authorization`,async()=>{
 const handler=await route({authorizePreviewDirector:()=>assert.fail('origin must be checked first')});
 const response=await handler.POST(new Request('http://localhost/api/director/canonical-overview',{method:'POST',headers:origin?{origin}:{},body:'{}'}));
 assert.equal(response.status,403);assert.equal((await response.json()).code,'DIRECTOR_CANONICAL_ORIGIN_REQUIRED');
});
for (const [index,call] of [loadCanonicalDirectorOverview,()=>submitCanonicalDirectorOperation({}, {fetchImpl:async()=>new Response('not json')})].entries()) test(`UNIT malformed canonical ${index===0?'read':'mutation'} JSON returns typed error without fallback`,async()=>{
 await assert.rejects(call===loadCanonicalDirectorOverview?()=>call({fetchImpl:async()=>new Response('not json')}):call,{code:'DIRECTOR_CANONICAL_RESPONSE_INVALID'});
});
test('FAILURE_INJECTION committed Director operation survives canonical readback transport failure',async()=>{
 let reads=0,writes=0;const input={action:'finalize',matchId:'M1',operationRequestId:'same-operation',expectedMatchRevision:3,expectedPermissionRevision:1};
 const deps={scoringShadowRpc:async(name)=>({payload:name==='read_preview_director_capabilities_v1'?{ok:true,contract:'preview-director-canonical-controls-v1',google_runtime:'RETIRED',actions:['finalize','reopen']}:{ok:true,committed:false}}),
 readCanonicalScoringAuthority:async()=>{if(++reads>1)throw new Error('connection lost after commit');return {payload:{ok:true,data:{tournament_id:'2098',match_id:'M1'}}};},
 finalizeCanonicalMatch:async()=>{writes++;return {payload:{ok:true,match_revision:4}};}};
 await assert.rejects(mutateIsolatedCanonicalDirectorMatch({authorization,input,env},deps),{code:'DIRECTOR_CANONICAL_READBACK_UNCONFIRMED',committed:true,operationRequestId:'same-operation'});
 assert.equal(writes,1);
 const handler=await route({mutateIsolatedCanonicalDirectorMatch:async()=>{throw Object.assign(new Error('readback unavailable'),{code:'DIRECTOR_CANONICAL_READBACK_UNCONFIRMED',committed:true,operationRequestId:input.operationRequestId});}});
 const response=await handler.POST(new Request('http://localhost/api/director/canonical-overview',{method:'POST',headers:{origin:'http://localhost'},body:JSON.stringify(input)}));
 assert.equal(response.status,503);const body=await response.json();assert.equal(body.committed,true);assert.equal(body.operationRequestId,input.operationRequestId);assert.equal(body.recovery,'CHECK_STATUS_RETRY_SAME_OPERATION');
});

test('FAILURE_INJECTION shipping Director mutation client retains same identity on response loss and committed readback failure',async()=>{
 const input={operationRequestId:'stable-operation'};
 await assert.rejects(submitCanonicalDirectorOperation(input,{fetchImpl:async()=>{throw new Error('network lost');}}),{code:'DIRECTOR_CANONICAL_OPERATION_UNAVAILABLE',operationRequestId:'stable-operation',outcome:'UNKNOWN',recovery:'CHECK_STATUS_RETRY_SAME_OPERATION'});
 await assert.rejects(submitCanonicalDirectorOperation(input,{fetchImpl:async()=>Response.json({code:'DIRECTOR_CANONICAL_READBACK_UNCONFIRMED',committed:true,operationRequestId:'stable-operation'},{status:503})}),{code:'DIRECTOR_CANONICAL_READBACK_UNCONFIRMED',committed:true,operationRequestId:'stable-operation',outcome:'COMMITTED',recovery:'CHECK_STATUS_RETRY_SAME_OPERATION'});
});

test('UNIT Director clears rejected predecessor only after explicit canonical NOT_COMMITTED classification',async()=>{
 for(const [code,status] of [['DIRECTOR_CANONICAL_INPUT_INVALID',400],['DIRECTOR_AUTHORIZATION_REQUIRED',403],['DIRECTOR_CANONICAL_OPERATION_REJECTED',409],['DIRECTOR_CANONICAL_OPERATION_CONFLICT',409],['DIRECTOR_AUTHORIZATION_UNAVAILABLE',503]]) {
  assert.equal(canonicalDirectorFailureOutcome({code},status),'NOT_COMMITTED');
  await assert.rejects(submitCanonicalDirectorOperation({operationRequestId:'rejected-predecessor'},{fetchImpl:async()=>Response.json({code},{status})}), error=>{
   assert.equal(error.outcome,'NOT_COMMITTED');assert.deepEqual(canonicalDirectorFailureDisposition(error),{retainOperation:false,refreshAuthority:true});return true;
  });
 }
 for(const [payload,status] of [[{code:'PROXY_REJECTED'},409],[{},403],[{code:'DIRECTOR_CANONICAL_OPERATION_REJECTED'},503],[{ok:true},200]]) {
  assert.equal(canonicalDirectorFailureOutcome(payload,status),'UNKNOWN');
  assert.deepEqual(canonicalDirectorFailureDisposition({outcome:'UNKNOWN'}),{retainOperation:true,refreshAuthority:false});
 }
 assert.equal(canonicalDirectorFailureOutcome({committed:true,code:'DIRECTOR_CANONICAL_OPERATION_REJECTED'},409),'COMMITTED');
 assert.deepEqual(canonicalDirectorFailureDisposition({outcome:'COMMITTED'}),{retainOperation:true,refreshAuthority:false});
 const component=await readFile(new URL('../app/admin/director/CanonicalDirectorConsole.js',import.meta.url),'utf8');
 assert.match(component,/canonicalDirectorFailureDisposition\(failure\)/);assert.match(component,/if \(!disposition.retainOperation\)/);assert.match(component,/if \(disposition.refreshAuthority\)/);
});
