// Actual Director browser adapter -> route -> server -> owned PostgreSQL.
// Only external HTTP/Auth session discovery are substituted. SQL admission,
// canonical inputs, calculation, claim/checkpoints and publication are real.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {jsonLiteral,sqlResult} from './postgres17.mjs';
import {canonicalDirectorOddsRequest,canonicalDirectorOddsCommand} from '../../../lib/canonical-director-odds-client.js';
import {readCanonicalDirectorOdds,mutateCanonicalDirectorOdds} from '../../../lib/canonical-director-odds.js';
import {processCertificationOddsCalculationJob} from '../../../lib/certification-odds-server.js';
import {certificationProjectionRpc} from '../../../lib/certification-runtime-server.js';

export async function certificationOddsStack(fixture,{tournamentId='2026',authorization:override,loseResponse,loseRpcResponse,afterRpc,environment}={}){
 const {env,registrationManifest}=fixture.transportFixture,calls=[],requests=[],scheduled=[];
 const identity=fixture.envelope.authorization;
 let authorization=override??{status:'active',source:'entitlement',identity:{authUserId:identity.auth_user_id,
  actor:{id:identity.player_id,role:'DIRECTOR'},tournamentId}};
 const allowed=new Set(['read_certification_runtime_context_v1','dispatch_certification_odds_v1',
  'read_certification_odds_operation_v1','read_certification_projection_v1']);
 const certificationDependencies={registrationManifest,fetchImpl:async(url,init)=>{
  const target=new URL(url),name=target.pathname.split('/').at(-1);
  assert.equal(target.origin,fixture.resource.project_url);assert.ok(allowed.has(name),name);
  assert.equal(target.pathname,'/rest/v1/rpc/'+name);assert.equal(init.redirect,'error');
  assert.equal(init.headers.apikey,env.SUPABASE_SCORING_MIRROR_SECRET_KEY);
  const input=JSON.parse(init.body).input;calls.push({name,input});
  const result=sqlResult(fixture.cluster,fixture.database,
   `\\set VERBOSITY verbose\nset role service_role;select public.${name}(${jsonLiteral(input)});`,{role:'service_role'});
  if(result.status!==0){
   const error=/ERROR:\s+([0-9A-Z]{5}):\s*([^\n]+)/.exec(result.stderr);assert.ok(error,result.stderr);
   calls.at(-1).error={sqlstate:error[1],message:error[2],detail:result.stderr};
   return Response.json({code:error[1],message:error[2]},{status:400});
  }
  const value=JSON.parse(result.stdout.trim());
  await afterRpc?.(name,input,value);
  if(value.ok===false)calls.at(-1).error={message:value.code,detail:value};
  if(loseRpcResponse?.(name,input,value))throw new Error('SYNTHETIC_ODDS_DATABASE_ACK_LOSS');
  return Response.json(value);
 }};
 const runtimeEnv=environment||env;
 const worker=(jobId,options={})=>processCertificationOddsCalculationJob(jobId,{...options,env:runtimeEnv,dependencies:certificationDependencies});
 const key='certification-odds-proof-'+randomUUID();
 globalThis[key]={NextResponse:Response,after:task=>scheduled.push(task),withOperationalRoute:(_config,handler)=>handler,
  recordOperationalError:()=>{},authorizePreviewDirector:async()=>authorization,certificationRequested:()=>true,
  readCanonicalDirectorOdds:args=>readCanonicalDirectorOdds({...args,env:runtimeEnv},{certificationDependencies}),
  mutateCanonicalDirectorOdds:args=>mutateCanonicalDirectorOdds({...args,env:runtimeEnv},{certificationDependencies}),
  processCertificationOddsCalculationJob:worker,processOddsCalculationJob:()=>assert.fail('Legacy Odds worker must not be selected')};
 const source=(await readFile(new URL('../../../app/api/director/canonical-odds/route.js',import.meta.url),'utf8'))
  .replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];\n/gm,
   (_match,names)=>`const {${names.replace(/\bas\b/g,':')}}=globalThis[${JSON.stringify(key)}];\n`);
 let route;try{route=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+key);}
 finally{delete globalThis[key];}
 const request=async(url,init={})=>{
  assert.ok(url.startsWith('/api/director/canonical-odds'));requests.push({url,init});
  const response=await route[init.method||'GET'](new Request('http://localhost'+url,{...init,headers:{origin:'http://localhost',...init.headers}}));
  if(loseResponse?.(url,init,response))throw new Error('SYNTHETIC_ODDS_CLIENT_ACK_LOSS');
  return response;
 };
 const client=(input=null,options={})=>canonicalDirectorOddsRequest(input,{...options,fetchImpl:request});
 const published=()=>certificationProjectionRpc('READS.CURRENT_VIEW',{surface:'PUBLISHED_ODDS',target_tournament_id:tournamentId},{env},certificationDependencies);
 return{client,request,calls,requests,scheduled,worker,published,certificationDependencies,env,
  setAuthorization:value=>{authorization=value;},authorization};
}

export async function calculateAndPublishCertificationFinalOdds(fixture,{tournamentId,beforePublication}={}){
 const stack=await certificationOddsStack(fixture,{tournamentId});
 let stage='INITIAL_READ';
 try{
 const initial=await stack.client();
 assert.equal(initial.publication.revision,0);assert.equal(initial.publication.snapshotId,null);
 assert.equal(initial.publication.state,'NEVER_PUBLISHED');
 const calculate=canonicalDirectorOddsCommand({action:'calculate',phase:'Final Results',iterations:10000},initial,randomUUID());
 stage='CALCULATION_REQUEST';
 const requested=await stack.client(calculate);assert.equal(requested.accepted,true);assert.equal(requested.publicationCreated,false);
 stage='CALCULATION_WORKER';
 const completed=await stack.worker(requested.jobId);assert.equal(completed.completed,true);
 stage='OWNER_REVIEW';
 const reviewed=await stack.client(null,{jobId:requested.jobId});
 assert.equal(reviewed.jobs.length,1);assert.equal(reviewed.jobs[0].status,'SUCCEEDED');
 assert.equal(reviewed.publication.revision,0);assert.equal(reviewed.publication.snapshotId,null);
 const publish=canonicalDirectorOddsCommand({action:'publish',jobId:requested.jobId,confirmPublication:true},reviewed,randomUUID());
 stage='PREPUBLICATION_PROOF';
 if(beforePublication)await beforePublication({stack,jobId:requested.jobId,calculation:completed,publishCommand:publish});
 stage='OWNER_PUBLICATION';
 const publication=await stack.client(publish);assert.equal(publication.publicationCreated,true);
 const canonical=await stack.published();assert.equal(canonical.payload.ok,true);
 const snapshots=canonical.payload.data.snapshots;
 assert.ok(snapshots.some(row=>row.milestone==='Final Results'&&row.publication_verified===true));
 const repeat=await stack.client(publish);assert.equal(repeat.snapshotId,publication.snapshotId);assert.equal(repeat.duplicate,true);
 const recovered=await stack.client({action:'status',originalAction:'publish',operationRequestId:publish.operationRequestId});
 assert.equal(recovered.state,'COMMITTED');assert.equal(recovered.receipt.snapshotId,publication.snapshotId);
 assert.ok(stack.calls.every(call=>!call.name.toLowerCase().includes('google')));
 return{tournamentId,calculationJobId:requested.jobId,phase:'Final Results',realEngine:true,
  calculationOperationId:calculate.operationRequestId,publicationOperationId:publish.operationRequestId,
  firstPublicationState:initial.publication,completedWithoutPublication:true,explicitOwnerPublication:true,
  publication,canonicalReadVerified:true,duplicatePublication:repeat.duplicate,recovered:recovered.state,
  checkpoints:completed.checkpoints,attempts:completed.attempts,resultFingerprint:completed.resultFingerprint,
  googleCalls:0,legacyWorkerCalls:0,rpcCalls:stack.calls.length};
 }catch(error){
  // Retain the actual local PostgreSQL rejection, not a guessed interpretation
  // of its intentionally bounded client error. Never copy request/headers or
  // SQL statements (which can contain invocation inputs) into this evidence.
  const failure=stack.calls.findLast(call=>call.error);
  error.certificationOddsEvidence={tournamentId,stage,failedRpc:failure?{
   name:failure.name,operation:failure.input.operation_id||failure.input.operation||null,
   sqlstate:failure.error.sqlstate||null,message:failure.error.message||null,
   detail:typeof failure.error.detail==='string'?failure.error.detail.split('\n')
    .filter(line=>/^(?:CONTEXT:.*PL\/pgSQL function|PL\/pgSQL function)/.test(line)).slice(0,12)
    :{code:failure.error.detail?.code||null},
  }:null};
  throw error;
 }
}
