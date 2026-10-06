// Shipping browser transport -> real route -> real server adapter -> owned SQL.
// Only HTTP and the external session lookup are replaced. Database actor/link/
// entitlement/resource checks run normally. No envelope rewriting or network.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {jsonLiteral,sqlResult} from './postgres17.mjs';
import {readIsolatedDirectorOperations,mutateIsolatedDirectorOperations,resolveIsolatedDirectorOperation} from '../../../lib/isolated-director-operations.js';
import {createCanonicalDirectorOperationsTransport} from '../../../lib/canonical-director-operations-client.js';

export async function certificationDirectorStack(fixture,{loseResponse,afterDatabase,beforeDatabase,authorization:override,environment}={}){
 const {env,registrationManifest}=fixture.transportFixture,calls=[],requests=[];
 const identity=fixture.envelope.authorization;
 let authorization=override??{status:'active',source:'entitlement',identity:{authUserId:identity.auth_user_id,
  actor:{id:identity.player_id,role:'DIRECTOR'},tournamentId:identity.tournament_id}};
 const allowed=new Set(['read_certification_runtime_context_v1','read_certification_operation_v1',
  'execute_certification_operation_v1','admit_certification_operation_v1','mark_certification_ingress_unknown_v1',
  'read_certification_director_recovery_material_v1']);
 const certificationDependencies={registrationManifest,fetchImpl:async(url,init)=>{
  const target=new URL(url),name=target.pathname.split('/').at(-1);
  assert.equal(target.origin,fixture.resource.project_url);assert.ok(allowed.has(name),name);
  assert.equal(target.pathname,'/rest/v1/rpc/'+name);assert.equal(init.redirect,'error');
  assert.equal(init.headers.apikey,env.SUPABASE_SCORING_MIRROR_SECRET_KEY);
  const input=JSON.parse(init.body).input;calls.push({name,input});
  await beforeDatabase?.(name,input);
  const result=sqlResult(fixture.cluster,fixture.database,
   `\\set VERBOSITY verbose\nset role service_role;select public.${name}(${jsonLiteral(input)});`,{role:'service_role'});
  if(result.status!==0){
   const error=/ERROR:\s+([0-9A-Z]{5}):\s*([^\n]+)/.exec(result.stderr);assert.ok(error,result.stderr);
   calls.at(-1).error={sqlstate:error[1],message:error[2],detail:result.stderr};
   return Response.json({code:error[1],message:error[2]},{status:400});
  }
  const value=JSON.parse(result.stdout.trim());
  await afterDatabase?.(name,input,value);
  if(value.ok===false)calls.at(-1).error={sqlstate:null,message:value.code,detail:value};
  return Response.json(value);
 }};
 const key='certification-director-proof-'+randomUUID();
 globalThis[key]={NextResponse:Response,withOperationalRoute:(_config,handler)=>handler,recordOperationalError:()=>{},
  authorizePreviewDirector:async()=>authorization,
  readIsolatedDirectorOperations:args=>readIsolatedDirectorOperations({...args,env:environment||env},{certificationDependencies}),
  mutateIsolatedDirectorOperations:args=>mutateIsolatedDirectorOperations({...args,env:environment||env},{certificationDependencies}),
  resolveIsolatedDirectorOperation:args=>resolveIsolatedDirectorOperation({...args,env:environment||env},{certificationDependencies})};
 const source=(await readFile(new URL('../../../app/api/director/canonical-operations/route.js',import.meta.url),'utf8'))
  .replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];\n/gm,
   (_match,names)=>`const {${names.replace(/\bas\b/g,':')}}=globalThis[${JSON.stringify(key)}];\n`);
 let route;try{route=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+key);}
 finally{delete globalThis[key];}
 const request=async(url,init={})=>{
  assert.ok(url.startsWith('/api/director/canonical-operations'));requests.push({url,init});
  const response=await route[init.method||'GET'](new Request('http://localhost'+url,
   {...init,headers:{origin:'http://localhost',...init.headers}}));
  if(loseResponse?.(url,init,response))throw new Error('SYNTHETIC_POST_HANDLER_ACK_LOSS');
  return response;
 };
 return{transport:createCanonicalDirectorOperationsTransport({fetchImpl:request}),request,calls,requests,
  setAuthorization:value=>{authorization=value;},authorization,certificationDependencies,env};
}

export function provisionCertificationFinancialFixture(fixture){
 // Initial owner-approved synthetic financial configuration only. This is not
 // evidence for an exposed configuration mutation; that capability is absent.
 // All normal constraints/triggers stay enabled, and provenance is the real
 // registered Certification resource rather than a fabricated Production row.
 const cfg={contract_version:'production-calcutta-v1',
  point_structure:Array.from({length:24},(_,i)=>({place:i+1,round_1_award:String((24-i)*4),
   round_2_award:String(i<12?(12-i)*12-3:0),round_3_award:String((24-i)*5)})),
  payout_structure:Array.from({length:24},(_,i)=>({place:i+1,round_1_fraction:['0.0125','0.01','0.0075'][i]||'0',
   round_2_fraction:['0.025','0.015'][i]||'0',round_3_fraction:['0.0125','0.01','0.0075'][i]||'0',
   overall_fraction:i===23?'0.05':['0.225','0.2','0.15','0.12','0.09','0.065'][i]||'0'}))};
 const {q,envelope}=fixture,context=fixture.context();
 q(`begin;set local request.jwt.claim.role='service_role';
 select production_control.push_certification_context_v1(${jsonLiteral(envelope)},'DIRECTOR',false);
 with prepared as(select production_control.build_production_calcutta_v1_configuration(${jsonLiteral(cfg)}) manifest),
 added as(insert into scoring_authority.calcutta_v1_configuration_revisions(
 tournament_id,configuration_revision,contract_version,state,configuration_manifest,configuration_fingerprint,
 resource_fingerprint,activation_revision,authority_epoch_id,configured_by_player_id,configured_by_auth_user_id,
 request_fingerprint,request_payload_hash,configured_at)
 select '2026',coalesce((select max(configuration_revision)from scoring_authority.calcutta_v1_configuration_revisions where tournament_id='2026'),0)+1,
 'production-calcutta-v1','CONFIGURED',manifest,production_control.calcutta_v1_hash(manifest),
 production_control.calcutta_v1_hash(${jsonLiteral(envelope.resource)}),${context.activation_revision},'${context.authority_epoch_id}',
 '${envelope.authorization.player_id}','${envelope.authorization.auth_user_id}',
 production_control.calcutta_v1_hash(jsonb_build_object('fixture','certification-financial-initial-v1','resource',${jsonLiteral(envelope.resource)})),
 production_control.calcutta_v1_hash(${jsonLiteral(cfg)}),clock_timestamp()from prepared returning *)
 insert into scoring_authority.calcutta_v1_current(tournament_id,configuration_revision_id,configuration_revision,configuration_fingerprint,state)
 select tournament_id,configuration_revision_id,configuration_revision,configuration_fingerprint,'CONFIGURED'from added
 on conflict(tournament_id)do update set configuration_revision_id=excluded.configuration_revision_id,
 configuration_revision=excluded.configuration_revision,configuration_fingerprint=excluded.configuration_fingerprint,state='CONFIGURED';
 select production_control.pop_certification_context_v1();commit;`);
 assert.equal(q('select count(*)from production_control.resource_scope'),'0');
 assert.equal(q('select count(*)from production_control.cutover_activation_state'),'0');
}
