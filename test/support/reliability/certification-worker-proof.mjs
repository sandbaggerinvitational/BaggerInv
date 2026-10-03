// Shipping polling loop, calculators, resource admission and PostgreSQL RPCs.
// Only HTTP transport is replaced with owned local service-role SQL. No domain
// projection/calculation is mocked and no outbound request is permitted.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createCurrentScoreDerivedDeliveryAdapter} from '../../../lib/score-derived-delivery.js';
import {runScoreDerivedWorker} from '../../../lib/score-derived-worker.js';
import {jsonLiteral,sqlResult} from './postgres17.mjs';

export function certificationWorkerTransport(fixture,{onRequest=()=>{}}={}){
 const {env,registrationManifest}=fixture.transportFixture;
 const calls=[];
 const allowed=new Set(['read_certification_runtime_context_v1','execute_certification_operation_v1',
  'read_certification_projection_v1']);
 const fetchImpl=async(url,init)=>{
  const target=new URL(url),name=target.pathname.split('/').at(-1);
  assert.equal(target.origin,fixture.resource.project_url,'No foreign resource transport');
  assert.ok(allowed.has(name),'Only supported current worker/projection RPCs: '+name);
  assert.equal(target.pathname,'/rest/v1/rpc/'+name);
  assert.equal(init.redirect,'error');assert.equal(init.method,'POST');
  assert.equal(init.headers.apikey,env.SUPABASE_SCORING_MIRROR_SECRET_KEY);
  const input=JSON.parse(init.body).input;
  onRequest({name,input});
  calls.push({name,operation:input.operation_id,phase:input.phase});
  const result=sqlResult(fixture.cluster,fixture.database,
   `\\set VERBOSITY verbose\nset role service_role;select public.${name}(${jsonLiteral(input)});`,{role:'service_role'});
  if(result.status!==0){
   const error=/ERROR:\s+([0-9A-Z]{5}):\s*([^\n]+)/.exec(result.stderr);
   assert.ok(error,'Typed local database failure required: '+result.stderr);
   return Response.json({code:error[1],message:error[2]},{status:400});
  }
  return Response.json(JSON.parse(result.stdout.trim()));
 };
 return{env,dependencies:{registrationManifest,fetchImpl},calls};
}

export async function drainCertificationAutomaticWorkers(fixture,{maximumCycles=80,onEvent=()=>{},onRequest=()=>{}}={}){
 const transport=certificationWorkerTransport(fixture,{onRequest}),events=[];
 const adapter=await createCurrentScoreDerivedDeliveryAdapter({env:transport.env,certificationDependencies:transport.dependencies});
 const controller=new AbortController();let settledTicks=0;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=()=>{throw new Error('RETIREMENT_CONTRACT_VIOLATION_UNEXPECTED_NETWORK');};
 let result;
 try{
  result=await runScoreDerivedWorker({...adapter,signal:controller.signal,intervalMs:10,maximumCycles,
   workerId:'certification-proof-'+randomUUID(),emit:event=>{
    events.push(event);onEvent(event);
    // This helper certifies a clean drain. Preserve the first actual failure;
    // fault/retry/dead-letter tests use their own deliberate failure harness.
    if(['failed','tick-failed','halted'].includes(event.type))controller.abort();
    if(event.type==='tick'){
     const settled=!event.cancelled&&!event.statusIncomplete&&event.pendingAutomatic===0
      &&event.blockedAutomatic===0&&event.activeLeases===0&&!Object.values(event.ready).some(Boolean);
     settledTicks=settled?settledTicks+1:0;
     if(settledTicks>=2)controller.abort();
    }
   }});
 }finally{globalThis.fetch=originalFetch;}
 const failures=events.filter(e=>['failed','tick-failed','halted'].includes(e.type));
 assert.equal(result.ok,true,JSON.stringify({result,failures}));
 assert.equal(failures.length,0,'Required workers failed: '+JSON.stringify(failures));
 assert.ok(settledTicks>=2,'Required workers did not settle: '+JSON.stringify(events.slice(-12)));
 assert.ok(transport.calls.some(c=>c.operation==='WORKERS.DELIVERY_TICK'));
 return{environment:'OWNED_LOCAL_POSTGRESQL17',cycles:result.cycles,events,calls:transport.calls,
  automaticFamilies:['CALCUTTA','COMPETITION','INTELLIGENCE'],googleCalls:0,externalNetworkCalls:0,
  requiredAutomaticWork:0,calculators:'SHIPPING_IMPLEMENTATION',projections:'ACTUAL_CANONICAL_RPC'};
}
