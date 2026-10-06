// Shipping browser -> actual Director route -> server adapter -> owned PG17.
// External session lookup alone is modeled; SQL repeats real actor/resource/CAS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createSupervisorFixture} from './support/reliability/certification-supervisor-fixture.mjs';
import {certificationDirectorStack} from './support/reliability/certification-director-proof.mjs';
import {enableOwnedSafeupdate} from './support/reliability/pg-safeupdate.mjs';
import {destroyIsolatedCluster,jsonLiteral,sql,sqlFile,repositoryRoot} from './support/reliability/postgres17.mjs';
import {entryDraft,entrySaveRequest} from '../lib/net-skins-entry-workspace.js';
import {fixtureIdentities} from '../tools/reliability/certification-part2a-fixture.mjs';
const artifact=repositoryRoot+'/supabase/production_incremental/certification-net-skins-configuration-v1.sql';
const metadata=`select jsonb_agg(jsonb_build_object('name',oid::regprocedure::text,'owner',proowner,'acl',proacl,
 'security',prosecdef,'config',proconfig,'language',prolang,'volatile',provolatile,'parallel',proparallel,'strict',proisstrict)order by oid)
 from pg_proc where oid in('public.configure_production_net_skins_v1(jsonb)'::regprocedure,
 'production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean)'::regprocedure,
 'production_control.certification_operation_phase_v1(text,boolean)'::regprocedure,
 'production_control.certification_ingress_required_v1(text)'::regprocedure,
 'production_control.certification_ingress_canonical_receipt_v1(production_control.certification_ingress_leases_v1)'::regprocedure,
 'public.read_certification_director_recovery_material_v1(jsonb)'::regprocedure)`;
const rls=`select jsonb_agg(jsonb_build_object('oid',c.oid,'rls',relrowsecurity,'force',relforcerowsecurity,'acl',relacl)order by c.oid)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('production_control','scoring_authority','participant_identity')and relkind='r'`;

test('full Net Skins configuration: real Certification route/core/receipts with safeupdate, no hosted access',async t=>{
 const f=await createSupervisorFixture();
 f.envelope={...f.bound,authorization:f.authorization};f.transportFixture={env:f.env,registrationManifest:f.dependencies.registrationManifest};
 const rpc=(name,input,role='service_role')=>JSON.parse(sql(f.cluster,f.database,`set role ${role};select public.${name}(${jsonLiteral(input)})`,{role}));
 const q=f.q;
 let stack,input,configured,entryBefore,command;
 const installed=()=>sqlFile(f.cluster,f.database,artifact,{role:''});
 const raw=(body,transport=stack)=>transport.request('/api/director/canonical-operations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const outcome=async response=>({status:response.status,payload:await response.json()});
 const jobs=()=>q("select coalesce(jsonb_agg(to_jsonb(j)order by job_id),'[]')from scoring_authority.net_skins_v1_recalculation_jobs j");
 try{
  f.toggle(false);await enableOwnedSafeupdate(f);
  const beforeMetadata=q(metadata),beforeRls=q(rls);
  await t.test('forward install: mismatch rolls back atomically; safeupdate enabled; all six original metadata records preserved',()=>{
   const definition=q("select pg_get_functiondef('production_control.certification_operation_phase_v1(text,boolean)'::regprocedure)");
   q(definition.replace("message='CERTIFICATION_OPERATION_NOT_ADMITTED'","message='LOCAL_PREDECESSOR_DRIFT'"));
   assert.throws(installed,/PREDECESSOR_MISMATCH/);
   assert.equal(q("select to_regprocedure('production_control.canonical_configure_net_skins_v1(jsonb,jsonb)')is null"),'t');
   q(definition);installed();assert.equal(q(metadata),beforeMetadata);assert.equal(q(rls),beforeRls);
   assert.equal(q("select current_setting('safeupdate.enabled')"),'on');
   assert.throws(()=>q('update production_control.certification_admission_v1 set enabled=enabled'),/UPDATE requires a WHERE clause/);
  });
  await t.test('forward replay converges exactly, no schema/history/ACL/RLS change',()=>{
   const before=q("select jsonb_agg(jsonb_build_object('oid',oid,'body',prosrc,'acl',proacl)order by oid)from pg_proc where proname like '%net_skins%'or proname like '%certification%'");
   installed();assert.equal(q("select jsonb_agg(jsonb_build_object('oid',oid,'body',prosrc,'acl',proacl)order by oid)from pg_proc where proname like '%net_skins%'or proname like '%certification%'"),before);
  });
  await t.test('private helper ACL drift fails replay atomically rather than silently normalizing it',()=>{
   q('grant execute on function production_control.canonical_configure_net_skins_v1(jsonb,jsonb)to anon');
   assert.throws(installed,/PRIVATE_ACL_DRIFT/);
   assert.equal(q(metadata),beforeMetadata);
   q('revoke execute on function production_control.canonical_configure_net_skins_v1(jsonb,jsonb)from anon');
   installed();
  });
  f.toggle(true);stack=await certificationDirectorStack(f);
  await t.test('entry revision 1 created via shipping save, full financial config initially absent',async()=>{
   const round=(await stack.transport.entriesRequest()).rounds.find(r=>r.roundNumber===3),draft=entryDraft(round);
   draft.configured=true;draft.entries[0].entered=true;
   assert.equal((await stack.transport.entriesRequest(entrySaveRequest(round,draft,randomUUID()))).revision,1);
   entryBefore=q("select to_jsonb(r)from production_control.net_skins_entry_revisions_v1 r where tournament_id='2026'and round_number=3 and revision=1");
   assert.equal((await stack.transport.netSkinsConfigurationRequest()).configuration_revision,0);
  });
  await t.test('Director config reuses saved entries and canonical manifest; current pointer, receipt and both audits commit',async()=>{
   const beforeJobs=jobs(),id=randomUUID();
   input={family:'NET_SKINS_CONFIGURATION',action:'configure',payload:{expectedConfigurationRevision:0,eligibleRoundNumbers:[3],entryRevisions:{3:1}},
    operationRequestId:id,expectedContextToken:(await stack.transport.read()).context.contextToken};
   const result=await outcome(await raw(input));assert.equal(result.status,200,JSON.stringify(result.payload));configured=result.payload;
   assert.equal(configured.committed,true);assert.equal(configured.readbackVerified,true);
   assert.equal(configured.receipt.code,'PRODUCTION_NET_SKINS_V1_CONFIGURED');assert.equal(configured.receipt.configuration_revision,1);
   assert.equal(configured.data.rounds.length,1);assert.equal(configured.data.rounds[0].entries.length,1);
   assert.equal(configured.data.rounds[0].publication_policy,'OFFICIAL_ONLY'); // fixed overall policy, not client-selected per-round input
   assert.deepEqual(configured.data.rounds[0].eligible_holes,Array.from({length:18},(_,i)=>i+1));
   assert.equal(configured.data.rounds[0].buy_in_per_entry,25);assert.equal(configured.data.rounds[0].expected_pot,25);
   assert.equal(configured.data.rounds[0].entry_revision,1);
   assert.equal(configured.data.rounds[0].tie_rule,'NO_SKIN_NO_CARRY');assert.equal(configured.data.rounds[0].carry_rule,'NO_CARRY');
   assert.equal(configured.data.rounds[0].completion_rule,'ALL_ELIGIBLE_ENTRIES_18_HOLES_AND_REFERENCED_MATCHES_OFFICIAL');
   assert.equal(q("select publication_policy from scoring_authority.net_skins_v1_configuration_revisions"),'OFFICIAL_ONLY');
   assert.equal(q("select count(*)from scoring_authority.net_skins_configuration_entries"),'1');
   assert.equal(q("select count(*)from scoring_authority.audit_events where action='PRODUCTION_NET_SKINS_V1_CONFIGURED'"),'1');
   assert.equal(q("select count(*)from production_control.operation_audit_events where event_type='PRODUCTION_NET_SKINS_V1_CONFIGURED'"),'1');
   assert.equal(entryBefore,q("select to_jsonb(r)from production_control.net_skins_entry_revisions_v1 r where tournament_id='2026'and round_number=3 and revision=1"));
   assert.equal(jobs(),beforeJobs,'configuration creates no immediate job/publication demand');
   command=stack.calls.find(c=>c.input.operation_id==='DIRECTOR.CONFIGURE_NET_SKINS'&&c.name==='admit_certification_operation_v1').input;
   assert.equal(command.resource.resource_id,f.resource.resource_id);assert.equal(command.deployment.deployment_id,f.deployment.deployment_id);
  });
  await t.test('exact replay and restarted publisher return original committed configuration, no duplicate audits or revisions',async()=>{
   const replay=await outcome(await raw(input));assert.equal(replay.status,200);assert.equal(replay.payload.receipt.configuration_fingerprint,configured.receipt.configuration_fingerprint);assert.equal(replay.payload.receipt.configuration_revision,configured.receipt.configuration_revision);
   const restart=await certificationDirectorStack(f);const replay2=await outcome(await raw({...input,mode:'status'},restart));
   assert.equal(replay2.status,200,JSON.stringify(replay2));assert.equal(replay2.payload.outcome,'COMMITTED');
   assert.equal(replay2.payload.receipt.configuration_fingerprint,configured.receipt.configuration_fingerprint);
   assert.equal(q('select count(*)from scoring_authority.net_skins_v1_configuration_revisions'),'1');
   assert.equal(q("select count(*)from scoring_authority.audit_events where action='PRODUCTION_NET_SKINS_V1_CONFIGURED'"),'1');
  });
  await t.test('same operation ID with changed DTO conflicts; stale config revision denied',async()=>{
   const conflict=await outcome(await raw({...input,payload:{...input.payload,eligibleRoundNumbers:[2],entryRevisions:{2:1}}}));
   assert.equal(conflict.status,409);assert.equal(conflict.payload.committed,false);
   const stale=await outcome(await raw({...input,operationRequestId:randomUUID()}));
   assert.equal(stale.status,409);assert.equal(stale.payload.domainCode,'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT');
   assert.equal(q('select count(*)from scoring_authority.net_skins_v1_configuration_revisions'),'1');
  });
  await t.test('wrong/stale saved entry revision denied without altering entry history or granting config',async()=>{
   const result=await outcome(await raw({...input,operationRequestId:randomUUID(),payload:{...input.payload,expectedConfigurationRevision:1,entryRevisions:{3:99}}}));
   assert.equal(result.status,409,JSON.stringify(result));assert.match(result.payload.domainCode,/ENTRY|ENTR/);
   assert.equal(q('select count(*)from scoring_authority.net_skins_v1_configuration_revisions'),'1');
  });
  await t.test('participant A/B, signed-out, anon, ordinary authenticated and bare service role denied',async()=>{
   for(const auth of[{status:'none'},{status:'inactive'},{status:'active',source:'service_role',identity:{}},
    ...fixtureIdentities.slice(1).map(id=>({status:'active',source:'entitlement',identity:{authUserId:id.auth_user_id,actor:{id:id.player_id,role:'PLAYER'},tournamentId:'2026'}}))]){
    const denied=await certificationDirectorStack(f,{authorization:auth});const result=await outcome(await raw({...input,operationRequestId:randomUUID()},denied));
    assert.equal(result.status,403,JSON.stringify(result));assert.equal(denied.calls.length,0);
   }
   for(const role of['anon','authenticated'])assert.throws(()=>rpc('admit_certification_operation_v1',command,role),/permission denied/);
   assert.throws(()=>rpc('admit_certification_operation_v1',{...command,operation_request_id:randomUUID(),authorization:{role:'DIRECTOR',tournament_id:'2026'}}),/IDENTITY_INVALID|AUTHORIZATION/);
   const participant=fixtureIdentities[1];assert.throws(()=>rpc('admit_certification_operation_v1',{...command,operation_request_id:randomUUID(),authorization:{...command.authorization,auth_user_id:participant.auth_user_id,player_id:participant.player_id}}),/AUTHORIZATION/);
  });
  await t.test('client-selected resource/tournament/project/deployment/release/financial rules are impossible DTO fields',async()=>{
   for(const [key,value]of Object.entries({resource:{resource_class:'PRODUCTION'},project_ref:'idgigvjjqkfbqjeredpb',deployment:'dpl_foreign',release:'foreign',tournament_id:'2027',publication_policy:'PUBLIC',buy_in_per_entry:1,eligible_holes:[1]})){
    const result=await outcome(await raw({...input,operationRequestId:randomUUID(),payload:{...input.payload,[key]:value}}));assert.equal(result.status,400,key);
   }
  });
  await t.test('database independently denies wrong resource/project/release/deployment/registration and tournament/Director',()=>{
   for(const altered of[
    {resource:{...command.resource,resource_id:'CERTIFICATION:'+randomUUID()}},
    {resource:{...command.resource,resource_class:'PRODUCTION'}},
    {resource:{...command.resource,project_ref:'idgigvjjqkfbqjeredpb',project_url:'https://idgigvjjqkfbqjeredpb.supabase.co'}},
    {resource:{...command.resource,registration_revision:command.resource.registration_revision+1}},
    {deployment:{...command.deployment,deployment_id:'dpl_foreign'}},
    {deployment:{...command.deployment,release_commit:'f'.repeat(40)}},
    {authorization:{...command.authorization,tournament_id:'2027'}},
    {authorization:{...command.authorization,player_id:'P02'}},
   ])assert.throws(()=>rpc('admit_certification_operation_v1',{...command,operation_request_id:randomUUID(),...altered}),/DENIED|STALE|CONTEXT|AUTHORIZATION/);
  });
  await t.test('server registry rejects Production/development, foreign Preview project, wrong deployment/SHA; no fallback',async()=>{
   const {mutateIsolatedDirectorOperations}=await import('../lib/isolated-director-operations.js');
   for(const changed of[{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{VERCEL_DEPLOYMENT_ID:'dpl_foreign'},
    {SUPABASE_SCORING_MIRROR_URL:'https://idgigvjjqkfbqjeredpb.supabase.co'},{BAGGER_CERTIFICATION_RESOURCE_ID:'PRODUCTION:foreign'},
    {VERCEL_GIT_COMMIT_SHA:'f'.repeat(40)}])await assert.rejects(mutateIsolatedDirectorOperations({authorization:stack.authorization,input,
     env:{...f.env,...changed}},{certificationDependencies:stack.certificationDependencies}));
   const env={...f.env};delete env.BAGGER_CERTIFICATION_RESOURCE_ID;
   await assert.rejects(mutateIsolatedDirectorOperations({authorization:stack.authorization,input,env},{certificationDependencies:stack.certificationDependencies}),{code:'DIRECTOR_OPERATIONS_CONTEXT_REQUIRED'});
  });
  await t.test('Director private read allowed; participant private read denied; all private cores/table access stays closed',async()=>{
   assert.equal((await stack.transport.netSkinsConfigurationRequest()).configuration_revision,1);
   const participant=fixtureIdentities[1];
   assert.throws(()=>rpc('read_certification_operation_v1',{...command,operation_id:'DIRECTOR.READ_NET_SKINS_CONFIGURATION',
    authorization:{...command.authorization,player_id:participant.player_id,auth_user_id:participant.auth_user_id,role:'PLAYER'},payload:{family:'NET_SKINS_CONFIGURATION',action:'read'}}),/AUTHORIZATION/);
   for(const role of['anon','authenticated','service_role']){
    assert.throws(()=>q(`set role ${role};select production_control.canonical_configure_net_skins_v1('{}',null)`),/permission denied/);
    assert.throws(()=>q(`set role ${role};select production_control.dispatch_certification_net_skins_configuration_v1('{}','{}',true)`),/permission denied/);
    if(role!=='service_role')assert.throws(()=>q(`set role ${role};select*from scoring_authority.net_skins_v1_configuration_revisions`),/permission denied/);
    // Existing backend table SELECT is not Director/client operation authority.
    // Table ACL/RLS equality with the predecessor is asserted separately.

   }
   const projection=rpc('read_certification_projection_v1',{contract_version:'certification-runtime-v1',phase:'READS',...f.bound,
    operation:'READS.CURRENT_VIEW',payload:{surface:'NET_SKINS_RESULT'}});
   assert.equal(projection.ok,true);assert.equal(JSON.stringify(projection).includes('configured_by_auth_user_id'),false);
   assert.equal(JSON.stringify(projection).includes('request_payload_hash'),false);
  });
  await t.test('lost committed response recovers original receipt after admission disabled; no second configuration',async()=>{
   const lost=await certificationDirectorStack(f,{loseResponse:(url,init)=>init.method==='POST'&&JSON.parse(init.body).mode!=='status'});
   await lost.transport.read();const id=randomUUID();
   await assert.rejects(lost.transport.netSkinsConfigurationRequest({...input.payload,expectedConfigurationRevision:1,operationRequestId:id}));
   f.toggle(false);
   const result=await lost.transport.resolve(id);assert.equal(result.outcome,'COMMITTED');assert.equal(result.receipt.configuration_revision,2);
   assert.equal(q('select count(*)from scoring_authority.net_skins_v1_configuration_revisions'),'2');
   assert.equal(q("select count(*)from production_control.net_skins_entry_revisions_v1 where round_number=3"),'1');
  });
  await t.test('disabled admission/paused ingress prevents new config; failures reconcile NOT_COMMITTED, final work state unchanged',async()=>{
   assert.equal((await outcome(await raw({...input,operationRequestId:randomUUID()}))).status,403);
   const unresolved=JSON.parse(q("select coalesce(jsonb_agg(to_jsonb(l)),'[]')from production_control.certification_ingress_leases_v1 l where state in('ADMITTED','UNKNOWN')"));
   for(const lease of unresolved){const result=rpc('resolve_certification_ingress_v1',{contract_version:'certification-runtime-v1',...f.envelope,phase:'DIRECTOR',operation_id:lease.operation_id,operation_request_id:lease.operation_request_id,payload:{}});assert.equal(result.state,'NOT_COMMITTED');}
   assert.equal(q("select count(*)from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN')"),'0');
   assert.equal(q(metadata),beforeMetadata);assert.equal(q(rls),beforeRls);
   assert.equal(q('select count(*)from production_control.resource_scope'),'0');assert.equal(q('select count(*)from production_control.cutover_activation_state'),'0');
   assert.equal(q('select count(*)from scoring_authority.odds_published_snapshots'),'0');assert.equal(q('select count(*)from scoring_authority.google_outbox_events'),'0');
   assert.equal(q("select state from scoring_authority.ingress_gates where tournament_id='2026'"),'PAUSED');
  });
  t.diagnostic(JSON.stringify({postgres:'17',safeupdate:'on',source:'real route/adapters/canonical shared core',entryRevision1:'preserved',newDemand:0,
   receiptAudits:true,hostedAccess:false,productionAccess:false,google:0,fullTournament:false}));
 }finally{await destroyIsolatedCluster(f.cluster);}
});
