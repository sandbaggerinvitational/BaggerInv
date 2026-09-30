// Proof layers: UNIT / API / SECURITY / FAILURE_INJECTION.
// Account-provider authorization and RPC transport are injected. Database
// entitlement and domain invariants require the separate actual SQL suite.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {readIsolatedDirectorOperations,mutateIsolatedDirectorOperations,resolveIsolatedDirectorOperation} from '../lib/isolated-director-operations.js';
import {canonicalDirectorOperationsRequest,createCanonicalDirectorOperationsTransport} from '../lib/canonical-director-operations-client.js';

const uuid='11111111-1111-4111-8111-111111111111';
const op='22222222-2222-4222-8222-222222222222';
const env={VERCEL_ENV:'development',NODE_ENV:'test',SUPABASE_SCORING_MIRROR_URL:'http://127.0.0.1:54321',SUPABASE_SCORING_MIRROR_SECRET_KEY:'synthetic-private-key',BAGGER_ISOLATED_DIRECTOR_BINDING_ID:uuid};
const authorization={status:'active',source:'entitlement',identity:{authUserId:'33333333-3333-4333-8333-333333333333',actor:{id:'P01',role:'DIRECTOR'},tournamentId:'2026'}};
const context={contract:'isolated-director-operations-v1',bindingId:uuid,contextToken:'a'.repeat(64),tournamentId:'2026',governanceTournamentId:'2026',activationRevision:1,admissionRevision:1,authorityEpochId:'44444444-4444-4444-8444-444444444444',releaseCommit:'9'.repeat(40)};
const setup=revision=>({ok:true,data:{contractVersion:'production-tournament-setup-v1',revision,tournament:{id:'2026',year:2026,name:'Synthetic'},teams:[],roster:[],rounds:[],courses:[],matches:[],readiness:{state:'SETUP_REQUIRED',sections:[]},audit:[],capabilities:{}}});
const input={family:'TOURNAMENT_SETUP',action:'update-team',operationRequestId:op,expectedContextToken:context.contextToken,payload:{expectedRevision:0,teamId:'T1',teamName:'Synthetic Team',captainPlayerId:'P01'}};
function fixture(){
 const calls=[];let saved=false;
 return {calls,rpc:async(name,{input:command},options)=>{calls.push({name,command,options});
  if(name==='read_isolated_director_operation_context_v1')return {payload:{ok:true,context,data:setup(saved?1:0)}};
  assert.equal(name,'execute_isolated_director_operation_v1');saved=true;
  return {payload:{ok:true,context,family:command.family,action:command.action,operationRequestId:command.operation_request_id,receipt:{ok:true,action:'UPDATE_TEAM',revision:1,idempotent:false}}};
 }};
}
async function handler(dependencies={}){
 const key='p0f-api-'+randomUUID();
 globalThis[key]={NextResponse:Response,withOperationalRoute:(_,fn)=>fn,recordOperationalError:()=>{},authorizePreviewDirector:async()=>authorization,
  readIsolatedDirectorOperations:args=>readIsolatedDirectorOperations({...args,env},dependencies),
  mutateIsolatedDirectorOperations:args=>mutateIsolatedDirectorOperations({...args,env},dependencies),
  resolveIsolatedDirectorOperation:args=>resolveIsolatedDirectorOperation({...args,env},dependencies),...dependencies.route};
 const source=(await readFile(new URL('../app/api/director/canonical-operations/route.js',import.meta.url),'utf8')).replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];\n/gm,(_,names)=>`const {${names.replace(/\bas\b/g,':')}}=globalThis[${JSON.stringify(key)}];\n`);
 try{return await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+key);}finally{delete globalThis[key];}
}
const request=(path,body,origin='http://localhost')=>new Request('http://localhost'+path,{method:body?'POST':'GET',headers:{...(origin?{origin}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});

test('API server binds actor/resource/context and confirms receipt plus matching canonical readback',async()=>{
 const f=fixture();const result=await mutateIsolatedDirectorOperations({authorization,input,env},f);
 assert.equal(result.outcome,'COMMITTED');assert.equal(result.readbackVerified,true);assert.equal(result.receipt.revision,1);assert.equal(result.data.revision,1);
 assert.deepEqual(f.calls.map(c=>c.name),['read_isolated_director_operation_context_v1','execute_isolated_director_operation_v1','read_isolated_director_operation_context_v1']);
 for(const call of f.calls){assert.deepEqual(call.command.authorization,{auth_user_id:authorization.identity.authUserId,player_id:'P01',role:'DIRECTOR',tournament_id:'2026'});assert.deepEqual(call.command.resource,{binding_id:uuid,project_ref:'LOCAL_ISOLATED',project_url:'http://127.0.0.1:54321'});assert.equal(call.command.expected_context_token,context.contextToken);}
 const saved=f.calls[1].command;assert.equal(saved.operation_request_id,op);assert.equal(saved.payload.operation_request_id,op);assert.equal(saved.payload.operation,'UPDATE_TEAM');assert.equal(saved.payload.team_name,'Synthetic Team');
 assert.equal(JSON.stringify(result).includes('synthetic-private-key'),false);
});
for(const change of [{status:'inactive'},{status:'unavailable'},{source:'bootstrap'},{source:'production-shadow-entitlement'},{identity:{...authorization.identity,impersonating:true}},{identity:{...authorization.identity,actor:{id:'P01',role:'PLAYER'}}},{identity:{...authorization.identity,actor:{id:'P01',role:'SPECTATOR'}}}])test(`SECURITY local API boundary denies unauthorized shape ${JSON.stringify(change)}`,async()=>{
 await assert.rejects(readIsolatedDirectorOperations({authorization:{...authorization,...change},env},{rpc:()=>assert.fail('no RPC after denial')}),{code:'DIRECTOR_OPERATIONS_AUTHORIZATION_REQUIRED'});
});
for(const change of [{VERCEL_ENV:'production'},{SUPABASE_SCORING_MIRROR_URL:'https://production.invalid'},{BAGGER_ISOLATED_DIRECTOR_BINDING_ID:''},{PRODUCTION_SHADOW_CANDIDATE_ENABLED:'true'}])test(`SECURITY isolated writer rejects resource/context shape ${JSON.stringify(change)}`,async()=>{
 await assert.rejects(readIsolatedDirectorOperations({authorization,env:{...env,...change}},{rpc:()=>assert.fail('no RPC after denial')}),{code:'DIRECTOR_OPERATIONS_CONTEXT_REQUIRED'});
});
for(const field of ['authorization','resource','actor_auth_user_id','project_ref','tournament_id','request_fingerprint'])test(`SECURITY caller ${field} cannot be nested into a domain payload`,async()=>{
 await assert.rejects(mutateIsolatedDirectorOperations({authorization,input:{...input,payload:{...input.payload,nested:{[field]:'forged'}}},env},{rpc:()=>assert.fail('no RPC after spoof')}),{code:'DIRECTOR_OPERATIONS_INPUT_INVALID'});
});
test('SECURITY caller cannot add privileged top-level metadata or select arbitrary RPC',async()=>{
 for(const extra of [{resource:{}},{rpc:'submit_production_hole_score'},{actorAuthUserId:authorization.identity.authUserId}])await assert.rejects(mutateIsolatedDirectorOperations({authorization,input:{...input,...extra},env},{rpc:()=>assert.fail('no RPC')}),{code:'DIRECTOR_OPERATIONS_INPUT_INVALID'});
});
test('API financial configuration is outside approved minimum capability',async()=>{
 await assert.rejects(mutateIsolatedDirectorOperations({authorization,input:{...input,family:'CALCUTTA_MANAGEMENT',action:'configure',payload:{}},env},{rpc:()=>assert.fail('configure must not be dispatched')}),{code:'DIRECTOR_OPERATIONS_INPUT_INVALID'});
});
test('API context scope mismatch or stale context fails before execute',async()=>{
 for(const bad of [{...context,tournamentId:'2098'},{...context,contextToken:'b'.repeat(64)}]){
  let calls=0;await assert.rejects(mutateIsolatedDirectorOperations({authorization,input,env},{rpc:async name=>{calls++;assert.equal(name,'read_isolated_director_operation_context_v1');return{payload:{ok:true,context:bad,data:setup(0)}};}}),e=>e.outcome==='UNKNOWN'&&e.operationRequestId===op);assert.equal(calls,1);
 }
});
test('FAILURE_INJECTION timeout is typed while the operation outcome remains UNKNOWN',async()=>{
 await assert.rejects(mutateIsolatedDirectorOperations({authorization,input,env},{rpc:async()=>{throw {shadowDiagnostics:{code:'57014',message:'canceling statement due to statement timeout'}};}}),{code:'DIRECTOR_OPERATIONS_DATABASE_TIMEOUT',databaseSqlstate:'57014',operationRequestId:op,outcome:'UNKNOWN'});
});
test('FAILURE_INJECTION committed operation with lost readback is not reported as a successful capability',async()=>{
 const f=fixture();let reads=0;await assert.rejects(mutateIsolatedDirectorOperations({authorization,input,env},{rpc:async(...args)=>{if(args[0].startsWith('read')&&++reads===2)throw new Error('lost readback');return f.rpc(...args);}}),{outcome:'COMMITTED',committed:true,operationRequestId:op,recovery:'CHECK_STATUS_RETRY_SAME_OPERATION'});
});
test('API actual handler and shipping client confirm the provider-neutral route using injected canonical RPC',async()=>{
 const f=fixture(),route=await handler(f);const paths=[];
 const result=await canonicalDirectorOperationsRequest(input,{fetchImpl:async(path,init)=>{paths.push(path);return route.POST(request(path,JSON.parse(init.body)));}});
 assert.deepEqual(paths,['/api/director/canonical-operations']);assert.equal(result.operationRequestId,op);assert.equal(result.googleRequests,0);
});
for(const origin of ['', 'https://untrusted.invalid'])test(`SECURITY POST ${origin||'missing'} origin denied before auth/RPC`,async()=>{
 const route=await handler({route:{authorizePreviewDirector:()=>assert.fail('origin before auth')}});const result=await route.POST(request('/api/director/canonical-operations',input,origin));assert.equal(result.status,403);assert.equal((await result.json()).code,'DIRECTOR_OPERATIONS_ORIGIN_REQUIRED');
});
test('API unavailable authorization stays feature-local and does not dispatch',async()=>{
 const route=await handler({route:{authorizePreviewDirector:async()=>{throw new Error('private auth provider details');}}});const result=await route.GET(request('/api/director/canonical-operations'));assert.equal(result.status,503);const text=await result.text();assert.match(text,/DIRECTOR_OPERATIONS_AUTHORIZATION_UNAVAILABLE/);assert.doesNotMatch(text,/private auth provider/);
});
test('API malformed body/query fails locally without a provider fallback',async()=>{
 const route=await handler({rpc:()=>assert.fail('no RPC')});const post=await route.POST(new Request('http://localhost/api/director/canonical-operations',{method:'POST',headers:{origin:'http://localhost'},body:'invalid'}));assert.equal(post.status,400);
 for(const query of ['?family=TOURNAMENT_SETUP&family=MATCH_CONTROL','?actor=P99','?payload=bad'])assert.equal((await route.GET(request('/api/director/canonical-operations'+query))).status,400);
});
test('API telemetry sink failure cannot prevent a confirmed context read',async()=>{
 const route=await handler({...fixture(),route:{recordOperationalError:()=>{throw new Error('metrics down');}}});const result=await route.GET(request('/api/director/canonical-operations'));assert.equal(result.status,200);
});
test('CLIENT retry retains original context and operation ID after refreshed context changes',async()=>{
 let token='a'.repeat(64);const attempts=[];let writes=0;
 const transport=createCanonicalDirectorOperationsTransport({fetchImpl:async(path,init)=>{
  if(init.method==='GET')return Response.json({ok:true,contract:context.contract,authority:'supabase',googleRequests:0,fallbackUsed:false,context:{...context,contextToken:token},family:new URL(path,'http://localhost').searchParams.get('family')});
  attempts.push(JSON.parse(init.body));writes++;throw new Error('lost response');
 }});
 await assert.rejects(transport.mutate(input.family,input.action,input.payload,op),{outcome:'UNKNOWN',operationRequestId:op});
 token='b'.repeat(64);await transport.read();await assert.rejects(transport.mutate(input.family,input.action,input.payload,op),{outcome:'UNKNOWN',operationRequestId:op});
 assert.equal(writes,2);assert.deepEqual(attempts[1],{...attempts[0],mode:'status'});assert.equal(attempts[1].expectedContextToken,'a'.repeat(64));
 await assert.rejects(transport.mutate(input.family,input.action,{...input.payload,teamName:'Conflicting'},op),{code:'DIRECTOR_OPERATIONS_IDENTITY_CONFLICT'});assert.equal(writes,2);
});
test('CLIENT malformed or provider-forged success remains UNKNOWN; no Google fallback',async()=>{
 for(const body of [{ok:true},{ok:true,authority:'google'},{ok:true,contract:context.contract,authority:'supabase',context,googleRequests:0,fallbackUsed:false,family:input.family,action:input.action,operationRequestId:op,committed:true,readbackVerified:false}]){
  let calls=0;await assert.rejects(canonicalDirectorOperationsRequest(input,{fetchImpl:async()=>{calls++;return Response.json(body);}}),e=>e.operationRequestId===op&&['UNKNOWN','COMMITTED'].includes(e.outcome));assert.equal(calls,1);
 }
});

test('RECOVERY current admission resolves original exact receipt after context changes without execute',async()=>{
 const calls=[];const moved={...context,contextToken:'b'.repeat(64),activationRevision:2};
 const result=await resolveIsolatedDirectorOperation({authorization,input:{...input,mode:'status'},env},{rpc:async(name,{input:command})=>{
  calls.push(command);assert.equal(name,'read_isolated_director_operation_context_v1');
  return {payload:{ok:true,context:moved,data:command.mode==='status'?{ok:true,outcome:'COMMITTED',receipt:{ok:true,action:'UPDATE_TEAM',revision:1}}:setup(3)}};
 }});
 assert.equal(result.outcome,'COMMITTED');assert.equal(result.readbackVerified,true);assert.equal(result.context.contextToken,moved.contextToken);
 assert.equal(calls.length,3);assert.equal(calls[0].expected_context_token,undefined);assert.equal(calls[1].expected_context_token,input.expectedContextToken);assert.equal(calls[1].operation_request_id,op);
 assert.equal(calls[1].payload.team_name,'Synthetic Team');
});
test('RECOVERY absent exact receipt remains UNKNOWN and cannot imply rollback',async()=>{
 const result=await resolveIsolatedDirectorOperation({authorization,input:{...input,mode:'status'},env},{rpc:async(name,{input:command})=>({payload:{ok:true,context,data:command.mode==='status'?{ok:true,outcome:'UNKNOWN',receipt:null,code:'ISOLATED_DIRECTOR_RECEIPT_NOT_FOUND'}:setup(0)}})});
 assert.equal(result.outcome,'UNKNOWN');assert.equal(result.committed,false);assert.equal(result.receipt,null);assert.equal(result.operationRequestId,op);
});
test('RECOVERY shipping client retains original review when requesting read-only status',async()=>{
 const attempts=[];const transport=createCanonicalDirectorOperationsTransport({fetchImpl:async(path,init)=>{
  if(init.method==='GET')return Response.json({ok:true,contract:context.contract,authority:'supabase',googleRequests:0,fallbackUsed:false,context,family:null});
  const command=JSON.parse(init.body);attempts.push(command);
  if(!command.mode)throw new Error('lost response');
  return Response.json({ok:true,contract:context.contract,authority:'supabase',googleRequests:0,fallbackUsed:false,context:{...context,contextToken:'b'.repeat(64)},family:command.family,action:command.action,operationRequestId:op,mode:'status',outcome:'COMMITTED',committed:true,receipt:{ok:true},readbackVerified:false});
 }});
 await assert.rejects(transport.mutate(input.family,input.action,input.payload,op));
 assert.equal((await transport.resolve(op)).outcome,'COMMITTED');assert.deepEqual(attempts[1],{...attempts[0],mode:'status'});
 await assert.rejects(transport.resolve(randomUUID()),{code:'DIRECTOR_OPERATIONS_IDENTITY_REQUIRED',outcome:'UNKNOWN'});
});
test('RECOVERY API status remains same-origin and authorized while a telemetry sink fails',async()=>{
 const route=await handler({rpc:async(name,{input:command})=>({payload:{ok:true,context,data:command.mode==='status'?{ok:true,outcome:'UNKNOWN',receipt:null}:setup(0)}}),route:{recordOperationalError:()=>{throw new Error('metrics down');}}});
 const result=await route.POST(request('/api/director/canonical-operations',{...input,mode:'status'}));assert.equal(result.status,200);assert.equal((await result.json()).outcome,'UNKNOWN');
 const fail=await handler({route:{authorizePreviewDirector:async()=>{throw new Error('auth unavailable');},recordOperationalError:()=>{throw new Error('metrics down');}}});
 assert.equal((await fail.GET(request('/api/director/canonical-operations'))).status,503);
});

test('API structured canonical control denial preserves feature-local domain error',async()=>{
 for(const domainCode of ['PRODUCTION_MATCH_NOT_SCORING_READY','MATCH_REVISION_CONFLICT','PERMISSION_STALE','SCORING_LOCKED','IDEMPOTENCY_CONFLICT']){
  const f=fixture();await assert.rejects(mutateIsolatedDirectorOperations({authorization,input,env},{rpc:async(...args)=>args[0].startsWith('read')?f.rpc(...args):{payload:{ok:false,context,receipt:{ok:false,code:domainCode}}}}),{code:'DIRECTOR_OPERATIONS_DOMAIN_REJECTED',domainCode,status:409,outcome:'UNKNOWN',operationRequestId:op});
 }
});
test('CLIENT status not found contains original operation and never silently resubmits',async()=>{
 const attempts=[];const transport=createCanonicalDirectorOperationsTransport({fetchImpl:async(path,init)=>{
  if(init.method==='GET')return Response.json({ok:true,contract:context.contract,authority:'supabase',googleRequests:0,fallbackUsed:false,context,family:null});
  const body=JSON.parse(init.body);attempts.push(body);if(!body.mode)throw new Error('before or after commit is unknown');
  return Response.json({ok:true,contract:context.contract,authority:'supabase',googleRequests:0,fallbackUsed:false,context,mode:'status',family:body.family,action:body.action,operationRequestId:op,outcome:'UNKNOWN',committed:false,receipt:null,readbackVerified:false});
 }});
 await assert.rejects(transport.mutate(input.family,input.action,input.payload,op));
 await assert.rejects(transport.mutate(input.family,input.action,input.payload,op),{code:'DIRECTOR_OPERATIONS_RECONCILIATION_REQUIRED',outcome:'UNKNOWN',operationRequestId:op});
 assert.equal(attempts.filter(v=>!v.mode).length,1);assert.deepEqual(attempts[1],{...attempts[0],mode:'status'});
});


test('CLIENT malformed or foreign-provider response cannot assert a canonical commit',async()=>{
 for(const body of [{ok:true,committed:true,operationRequestId:op},{ok:true,authority:'google',committed:true,outcome:'COMMITTED',operationRequestId:op},{code:'DIRECTOR_OPERATIONS_UNAVAILABLE',authority:'google',committed:true,outcome:'COMMITTED',operationRequestId:op}]){
  await assert.rejects(canonicalDirectorOperationsRequest(input,{fetchImpl:async()=>Response.json(body,{status:body.code?503:200})}),{outcome:'UNKNOWN',committed:false});
 }
 await assert.rejects(canonicalDirectorOperationsRequest(input,{fetchImpl:async()=>Response.json({code:'DIRECTOR_OPERATIONS_READBACK_UNCONFIRMED',committed:true,outcome:'COMMITTED',operationRequestId:op},{status:503})}),{outcome:'COMMITTED',committed:true});
});
