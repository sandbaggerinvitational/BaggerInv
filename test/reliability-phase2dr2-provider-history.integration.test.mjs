// Historical provider-fence protocol proof, entirely in owned local PostgreSQL.
// The synthetic provider observation payloads below are inputs to the historical
// database protocol, never assertions that a real Google/Vercel provider ran.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {repositoryRoot} from './support/reliability/postgres17.mjs';
const oldPath=path.join(repositoryRoot,'test/step11-production-scoring-admission-postgres.integration.test.mjs');
let source=await readFile(oldPath,'utf8');source=source.slice(0,source.indexOf('\ntest(\n'));
source=source.replace('"../lib/production-google-writer-provider-abort-evidence.js"',JSON.stringify(pathToFileURL(path.join(repositoryRoot,'lib/production-google-writer-provider-abort-evidence.js')).href));
source=source.replace(`const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);`,`const repositoryRoot=${JSON.stringify(repositoryRoot)};`);
source=`import {writeFile} from 'node:fs/promises';
import {createIsolatedCluster as ownedCreate,destroyIsolatedCluster as ownedDestroy} from ${JSON.stringify(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/postgres17.mjs')).href)};\n`+source;
const start=source.indexOf('async function createCluster() {'),end=source.indexOf('async function installProductionMigrations(',start);
assert.ok(start>0&&end>start);
source=source.slice(0,start)+`async function createCluster(){const owned=await ownedCreate();return {...owned,clusterRoot:owned.directory,dataDirectory:owned.data,socketDirectory:owned.socket,logFile:owned.log};}
async function destroyCluster(cluster){await ownedDestroy(cluster);}\n`+source.slice(end);
// Preserve the038 source/golden separately. This forward-preservation proof
// installs039–041 while actually dormant, then uses their supported V4 protocol.
// Only fixture helper timing changes: real DB elapsed-time waits replace every
// persisted observation-time rewrite in the helpers actually invoked below.
const quiesceStart=source.indexOf('function certifyQuiesceV4(');
const quiesceEnd=source.indexOf('function makeQuiesceFinalizeInput(',quiesceStart);
assert.ok(quiesceStart>0&&quiesceEnd>quiesceStart);
let quiesce=source.slice(quiesceStart,quiesceEnd).replace('function certifyQuiesceV4(','async function certifyQuiesceV4(');
const drain='  backdateQuiesceDrain(cluster, database, draining.evidence_id, 2100);';
assert.equal(quiesce.split(drain).length,2);
quiesce=quiesce.replace(drain,`  await waitHistoricalBoundary(cluster,database,
    "select greatest(0,301-extract(epoch from(clock_timestamp()-drain_started_at)))from production_control.vercel_writer_quiesce_evidence where evidence_id="+sqlLiteral(draining.evidence_id)+"::uuid",
    label+':quiesce-drain');`);
source=source.slice(0,quiesceStart)+quiesce+source.slice(quiesceEnd);
const rehearsalStart=source.indexOf('function certifyAclV2RehearsalV4(');
const rehearsalEnd=source.indexOf('function providerFenceFinishEvidence(',rehearsalStart);
assert.ok(rehearsalStart>0&&rehearsalEnd>rehearsalStart);
let rehearsal=source.slice(rehearsalStart,rehearsalEnd).replace('function certifyAclV2RehearsalV4(','async function certifyAclV2RehearsalV4(')
 .replaceAll('= certifyQuiesceV4(', '= await certifyQuiesceV4(');
const compressed=[];
rehearsal=rehearsal.replace(/  psql\(cluster, database, `[\s\S]*?`\);/g,block=>{
 if(!block.includes('set recorded_at = now() -')&&!block.includes("set owner_acknowledged_at = now() - interval '1811 seconds'"))return block;
 compressed.push(block);
 if(block.includes('aclReader.observation_id'))return `  await waitHistoricalBoundary(cluster,database,
   "select greatest(0,202-extract(epoch from(clock_timestamp()-recorded_at)))from production_control.google_writer_provider_fence_settlement_observations where observation_id="+sqlLiteral(aclReader.observation_id)+"::uuid",label+':acl-settlement');`;
 if(block.includes('readback1.observation_id'))return `  await waitHistoricalBoundary(cluster,database,
   "select greatest(0,11-extract(epoch from(clock_timestamp()-recorded_at)))from production_control.google_writer_provider_fence_settlement_observations where observation_id="+sqlLiteral(readback1.observation_id)+"::uuid",label+':second-readback');`;
 return `  await waitHistoricalBoundary(cluster,database,
   "select greatest(0,1811-extract(epoch from(clock_timestamp()-critical_active_at)))from production_control.vercel_writer_critical_waf_epochs where epoch_id="+sqlLiteral(forwardQuiesce.critical_waf_epoch_id)+"::uuid",label+':provider-wide-horizon');`;
});
assert.equal(compressed.length,3,'All three historical clock-compression blocks are replaced');
rehearsal=rehearsal.replace('  // Isolated clock compression for the provider-wide 1800s function ceiling.','  // Actual elapsed provider-wide horizon; persisted observations remain intact.');
let cutover=rehearsal.slice(0,rehearsal.indexOf('  // Actual elapsed provider-wide horizon;'));
cutover=cutover.replace('async function certifyAclV2RehearsalV4(', 'async function certifyAclV2CutoverV4(').replaceAll('"REHEARSAL"','"CUTOVER"');
const restoreStart=cutover.indexOf('  // The same critical-window epoch');
const vectorStart=cutover.indexOf('  const vector = aclV2TransitionVector(',restoreStart);
assert.ok(restoreStart>0&&vectorStart>restoreStart);
cutover=cutover.slice(0,restoreStart)+cutover.slice(vectorStart);
cutover=cutover.replaceAll('fingerprint(`${label}-start-source`)','current.expected_source_fingerprint');
cutover+='  return {fence,forwardQuiesce,closed};\n}\n';
assert.ok(!cutover.includes('set recorded_at')&&!rehearsal.includes('set owner_acknowledged_at'));
source=source.slice(0,rehearsalStart)+rehearsal+cutover+source.slice(rehearsalEnd);
source+=String.raw`
const historicalTiming=[];
const providerProfile=Object.freeze({throughOrdinal:152,excludedOrdinals:[],
 reason:'Complete ordered forward history through152, including144; no excluded migration ordinals.'});
const providerMigrationNames=(await readdir(migrationsDirectory)).filter(name=>/^\d{12}_.*\.sql$/.test(name)
 &&Number(name.slice(8,12))<=providerProfile.throughOrdinal&&!providerProfile.excludedOrdinals.includes(Number(name.slice(8,12)))).sort();
const providerExtraSources=[
 'test/reliability-phase2dr2-provider-history.integration.test.mjs',
 'test/step11-production-scoring-admission-postgres.integration.test.mjs',
 'test/support/reliability/postgres17.mjs',
 'lib/production-google-writer-provider-abort-evidence.js',
 'tools/reliability/phase2-network-deny.cjs',
 'candidates/scored-match-resume.sql',
 'supabase/production_incremental/net-skins-sql-expressions-v1.sql',
 'supabase/production_incremental/calcutta-exact-job-activation-recovery-v1.sql',
 'supabase/production_incremental/director-calcutta-management-read-v1.sql',
 'supabase/production_incremental/director-calcutta-clear-entry-v1.sql',
 'supabase/production_incremental/player-portrait-policy-v1.sql'];
for(const directory of ['test/fixtures','docs/evidence'])for(const name of await readdir(path.join(repositoryRoot,directory)))
 if(name.startsWith('step11')&&name.endsWith('.json'))providerExtraSources.push(directory+'/'+name);
async function providerSourceManifest(){const out={};for(const file of [...providerExtraSources,...providerMigrationNames.map(name=>'supabase/production_migrations/'+name)].sort())
 out[file]=createHash('sha256').update(await readFile(path.join(repositoryRoot,file))).digest('hex');return out;}
const protocolPsql=psql;
psql=(cluster,database,statement)=>{
 assert.doesNotMatch(statement,/update\s+production_control\.[a-z_]+\s+set\s+(?:issued_at|recorded_at|provider_observed_at|owner_acknowledged_at|drain_started_at|critical_active_at)\s*=/i,
  'Historical protocol fixture must never rewrite persisted observation times');
 return protocolPsql(cluster,database,statement);
};
async function waitHistoricalBoundary(cluster,database,query,label){
 const began=Date.now();let announced=0;
 while(true){
  const seconds=Number(psql(cluster,database,query));assert.ok(Number.isFinite(seconds)&&seconds>=0&&seconds<2200);
  if(seconds<=0)break;
  if(Date.now()-announced>29000){console.log(JSON.stringify({phase:'ACTUAL_PROTOCOL_WAIT',label,remainingSeconds:Math.ceil(seconds),elapsedSeconds:Math.floor((Date.now()-began)/1000)}));announced=Date.now();}
  await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Math.ceil(seconds*1000)+20)));
 }
 historicalTiming.push({label,elapsedMs:Date.now()-began,persistedTimestampsChanged:false});
}
function providerAuthoritySnapshot(cluster,database){
 return parseJsonOutput(psql(cluster,database,[
  'select jsonb_build_object(',
  "'resource',to_jsonb(resource),'activation',to_jsonb(activation),'gate',to_jsonb(gate),",
  "'epoch',to_jsonb(epoch),'closure',to_jsonb(closure),'pointer',to_jsonb(pointer),",
  "'workers',(select jsonb_agg(to_jsonb(value) order by worker_name)from production_control.worker_controls value),",
  "'workerContracts',(select jsonb_agg(to_jsonb(value) order by worker_name)from production_control.worker_contracts value),",
  "'maintenanceBindings',(select count(*)from production_control.maintenance_deployment_capability_bindings),",
  "'maintenanceRebindings',(select count(*)from production_control.maintenance_runtime_deployment_rebindings),",
  "'applicationReleases',(select count(*)from production_control.postcutover_application_release_rebindings),",
  "'normalReleases',(select count(*)from production_control.postcutover_normal_release_rebindings),",
  "'annualGenerations',(select count(*)from production_control.future_annual_runtime_generations_v1))",
  'from production_control.resource_scope resource',
  'join production_control.cutover_activation_state activation using(scope_key)',
  'join production_control.current_tournament_pointer_v1 pointer using(scope_key)',
  "join scoring_authority.ingress_gates gate on gate.tournament_id='2026'",
  'join scoring_authority.authority_epochs epoch on epoch.epoch_id=activation.authority_generation_id',
  'join production_control.scoring_admission_closures closure on closure.closure_id=epoch.admission_closure_id',
  "where resource.scope_key='BAGGER_INV_PRODUCTION';"
 ].join('\n')));
}
function expectProviderSqlDenial(cluster,database,{setup='',statement,sqlstate,message}){
 // Every corruption is confined to a transaction. The mutation itself must
 // succeed: only the asserted operation's denial satisfies this check.
 psql(cluster,database,[
  'begin;',setup,
  'do $provider_denial$ declare denied boolean := false; actual_state text; actual_message text; begin',
  'begin '+statement+'; exception when others then',
  'get stacked diagnostics actual_state = returned_sqlstate, actual_message = message_text;',
  'if actual_state is distinct from '+sqlLiteral(sqlstate)+(message?' or actual_message is distinct from '+sqlLiteral(message):'')+' then raise; end if;',
  'denied := true; end;',
  "if not denied then raise exception 'Expected provider compatibility denial'; end if;",
  'end $provider_denial$; rollback;'
 ].join('\n'));
}
async function verifyProvider069(cluster,database,t,evidence,before){
 const failures=[];
 const check=async(name,action)=>{await t.test(name,()=>{try{return action();}catch(error){failures.push(error);throw error;}});};
 const after=providerAuthoritySnapshot(cluster,database);
 assert.deepEqual(after,before,'069 must preserve genuine provider authority and all existing control rows');
 assert.equal(after.activation.boundary_mode,'PROVIDER_FENCE_V2');
 assert.equal(after.activation.state,'SCORING_COMMITTED');
 assert.equal(after.epoch.boundary_mode,'PROVIDER_FENCE_V2');
 assert.equal(after.epoch.status,'COMMITTED');
 for(const key of ['maintenanceBindings','maintenanceRebindings','applicationReleases','normalReleases','annualGenerations'])assert.equal(Number(after[key]),0,key+' must not be fabricated');
 assert.equal(psql(cluster,database,'select count(*)from production_control.annual_scoring_platform_certifications_v1'),'0');
 const runtimeInput={...scope,deployment_commit:deploymentCommit,expected_epoch_id:after.epoch.epoch_id};
 const runtimeStatement=input=>'perform production_control.assert_production_scoring_runtime('+jsonSql(input)+')';
 psql(cluster,database,'select production_control.assert_legacy_provider_origin_v1();select production_control.assert_production_scoring_runtime('+jsonSql(runtimeInput)+');');
 const scopeWhere=" where scope_key='BAGGER_INV_PRODUCTION';";
 const epochWhere=' where epoch_id='+sqlLiteral(after.epoch.epoch_id)+'::uuid;';
 const corruptionCases=[
  ['resource-ingress',"update production_control.resource_scope set scoring_ingress_enabled=false"+scopeWhere],
  ['tournament-authority',"update scoring_authority.tournaments set scoring_authority='GOOGLE' where tournament_id='2026';"],
  ['deployment-lineage',"update production_control.cutover_activation_state set expected_deployment_commit='ffffffffffffffffffffffffffffffffffffffff'"+scopeWhere],
  ['epoch-lineage',"update scoring_authority.authority_epochs set deployment_commit='ffffffffffffffffffffffffffffffffffffffff'"+epochWhere],
  ['provider-fence-lineage','update scoring_authority.authority_epochs set google_writer_provider_verification_id=null'+epochWhere],
  ['ingress-paused',"update scoring_authority.ingress_gates set state='PAUSED' where tournament_id='2026';"]
 ];
 for(const [label,setup]of corruptionCases)await check('069 provider runtime rejects '+label,()=>{
  expectProviderSqlDenial(cluster,database,{setup,statement:runtimeStatement(runtimeInput),sqlstate:'55000'});
  assert.deepEqual(providerAuthoritySnapshot(cluster,database),after);
 });
 const requestCases=[
  ['resource',{...runtimeInput,project_ref:'incorrect-project'},'P0001'],
  ['tournament',{...runtimeInput,tournament_id:'2027'},'P0001'],
  ['deployment',{...runtimeInput,deployment_commit:'ffffffffffffffffffffffffffffffffffffffff'},'P0001'],
  ['epoch',{...runtimeInput,expected_epoch_id:randomUUID()},'55000'],
  ['maintenance-capability',{...runtimeInput,deployment_capability_contract:'production-maintenance-single-deployment-capability-v1',deployment_capability_ceiling:'OBSERVATION'},'55000']
 ];
 for(const [label,input,sqlstate]of requestCases)await check('069 provider runtime rejects request '+label,()=>{
  expectProviderSqlDenial(cluster,database,{statement:runtimeStatement(input),sqlstate});
 });
 await check('069 provider runtime retains role authorization',()=>{
  expectProviderSqlDenial(cluster,database,{setup:"set local request.jwt.claim.role='authenticated';",statement:runtimeStatement(runtimeInput),sqlstate:'42501'});
 });
 await check('069 provider runtime retains current-tournament pointer fence',()=>{
  const setup="insert into production_control.future_tournament_catalog_v1(tournament_id,tournament_year,contract_version,tournament_name,lifecycle,lifecycle_revision,setup_revision,creation_mode)values('2027',2027,'production-future-year-administration-v1','Transactional pointer rejection fixture','DRAFT',1,0,'BLANK');update production_control.current_tournament_pointer_v1 set tournament_id='2027',tournament_year=2027,pointer_revision=pointer_revision+1"+scopeWhere;
  expectProviderSqlDenial(cluster,database,{setup,statement:runtimeStatement(runtimeInput),sqlstate:'40001',message:'PRODUCTION_LEGACY_SCORING_POINTER_CHANGED'});
  assert.deepEqual(providerAuthoritySnapshot(cluster,database),after);
 });
 await check('069 preserves supported provider rollback worker drain with retained cutover evidence',()=>{
  const base={...scope,deployment_id:deploymentId,deployment_commit:deploymentCommit,actor_id:actor};
  const optimisticSql='(select '+jsonSql(base)+" || jsonb_build_object('expected_activation_revision',activation.activation_revision,'expected_authority_generation',activation.authority_generation_id,'expected_admission_generation',gate.admission_generation_id,'expected_admission_revision',gate.admission_revision)from production_control.cutover_activation_state activation cross join scoring_authority.ingress_gates gate where activation.scope_key='BAGGER_INV_PRODUCTION' and gate.tournament_id='2026')";
  const statements=['begin;','do $provider_drain$ declare close_value jsonb; denied boolean := false; begin'];
  for(const worker of ['SCORING_GOOGLE_OUTBOX','ROUND_SCORECARDS_ARCHIVE'])statements.push(
   'perform public.set_production_cutover_worker_state('+optimisticSql+' || '+jsonSql({worker_name:worker,enabled:true,expected_epoch_id:after.epoch.epoch_id,google_service_account_email:after.activation.expected_google_service_account,request_fingerprint:fingerprint('069-provider-drain-enable-'+worker)})+');'
  );
  statements.push(
   // V4 permits recording external evidence while Google admission is armed.
   // Supported postcommit rollback close reuses that retained current evidence.
   'close_value := public.close_production_scoring_admission('+optimisticSql+' || '+jsonSql({expected_authority:'SUPABASE',external_fence_evidence_id:after.epoch.external_fence_evidence_id,quiesce_evidence_id:after.activation.active_vercel_quiesce_evidence_id,provider_fence_id:after.epoch.google_writer_provider_fence_id,provider_fence_verification_id:after.epoch.google_writer_provider_verification_id,start_source_fingerprint:after.activation.expected_source_fingerprint,request_fingerprint:fingerprint('069-provider-drain-close')})+');',
   "if close_value->>'execution_gate' is distinct from 'PAUSED' then raise exception 'Rollback did not pause ingress'; end if;",
   'begin '+runtimeStatement(runtimeInput)+"; exception when sqlstate '55000' then denied := true; end;",
   "if not denied then raise exception 'Canonical mutations must remain rejected while rollback drains'; end if;",
   'perform production_control.assert_production_scoring_runtime('+jsonSql(runtimeInput)+",'SCORING_GOOGLE_OUTBOX');",
   'perform production_control.assert_production_scoring_runtime('+jsonSql(runtimeInput)+",'ROUND_SCORECARDS_ARCHIVE');",
   'end $provider_drain$;rollback;'
  );
  psql(cluster,database,statements.join('\n'));
  assert.deepEqual(providerAuthoritySnapshot(cluster,database),after);
 });
 await check('069 denies annual certification and transition operations without fabrication',()=>{
  const message='PRODUCTION_ANNUAL_SCORING_PLATFORM_CERTIFICATION_REQUIRED';
  expectProviderSqlDenial(cluster,database,{statement:'perform production_control.annual_scoring_platform_certification_v1('+jsonSql(runtimeInput)+')',sqlstate:'P0002'});
  expectProviderSqlDenial(cluster,database,{statement:'perform production_control.assert_annual_transition_platform_owner_v1('+jsonSql({})+')',sqlstate:'55000',message});
  for(const action of ['prepare','close','drain','activate','abort'])expectProviderSqlDenial(cluster,database,{statement:'perform public.'+action+'_production_annual_scoring_transition_v1('+jsonSql({})+')',sqlstate:'55000',message});
  const readiness=parseJsonOutput(psql(cluster,database,"select production_control.annual_scoring_transition_readiness_v1('2026')::text"));
  assert.equal(readiness.ready,false);
  assert.ok(readiness.blockers.some(value=>value.code===message),'Readiness must explain the missing annual platform certificate');
  assert.equal(psql(cluster,database,'select count(*)from production_control.annual_scoring_platform_certifications_v1'),'0');
  assert.equal(psql(cluster,database,'select count(*)from production_control.annual_scoring_transitions_v1'),'0');
  assert.deepEqual(providerAuthoritySnapshot(cluster,database),after);
 });
 await check('069 provider helper is private and security definer has fixed search path',()=>{
  const acl=parseJsonOutput(psql(cluster,database,"select jsonb_build_object('definer',prosecdef,'config',proconfig,'publicExecute',exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner)))where grantee=0 and privilege_type='EXECUTE'),'anonExecute',has_function_privilege('anon',oid,'EXECUTE'),'authenticatedExecute',has_function_privilege('authenticated',oid,'EXECUTE'),'serviceExecute',has_function_privilege('service_role',oid,'EXECUTE'))from pg_proc where oid='production_control.assert_legacy_provider_origin_v1()'::regprocedure"));
  assert.equal(acl.definer,true);assert.ok(acl.config.includes('search_path=pg_catalog'));
  for(const role of ['publicExecute','anonExecute','authenticatedExecute','serviceExecute'])assert.equal(acl[role],false);
 });
 if(failures.length)throw new AggregateError(failures,'Migration069 provider compatibility checks failed: '+failures.map(error=>error.message).join('\n'));
 evidence.steps.push({id:'MIGRATION_069_PROVIDER_COMPATIBILITY',status:'PASS',authorityEpochId:after.epoch.epoch_id,legacyRuntimeAdmitted:true,maintenanceBindingsFabricated:0,annualCertificatesFabricated:0,annualAuthorityDenied:true,corruptionCases:corruptionCases.map(value=>value[0]),requestCases:requestCases.map(value=>value[0]),pointerFencePreserved:true,rollbackWorkerDrainPreserved:true,privateHelperAclVerified:true});
}
test('R2 preserves actual V4 provider-bound closure through historical forward install', {timeout:4500000},async t=>{
 const sourceBefore=await providerSourceManifest(),cluster=await createCluster(),database='r2_provider_history';
 const evidence={environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',historicalProtocol:'PROVIDER_V4_ADMISSION_V3',providerObservation:'SYNTHETIC_FIXTURE_INPUT',hostedAccess:false,realGoogleAccess:false,googleNetworkCalls:0,status:'RUNNING',steps:[],timing:historicalTiming,persistedObservationTimestampsChanged:false,profile:providerProfile,sourceBefore};
 const checkpoint=()=>writeFile('/private/tmp/r2-provider-history-evidence.json',JSON.stringify(evidence,null,2)+'\n');
 try{
  createDatabase(cluster,database);installSupabaseCompatibility(cluster,database);await installProductionMigrations(cluster,database);installScoringFixture(cluster,database);
  for(const name of ['202608260039_production_all_project_provider_inventory_v3.sql','202608260040_production_provider_inventory_recertification_v4.sql','202608270041_production_rejected_waf_epoch_retirement.sql']){
   assert.equal(state(cluster,database).activation_state,'DORMANT');assert.equal(state(cluster,database).authority,'GOOGLE');
   psqlFile(cluster,database,path.join(migrationsDirectory,name));evidence.lastInstalled=name;
  }
  evidence.steps.push({id:'DORMANT_039_040_041_INSTALL',status:'PASS'});await checkpoint();
  await certifyAclV2RehearsalV4(cluster,database,'r2-v4-historical-rehearsal');
  evidence.steps.push({id:'ACTUAL_ELAPSED_V4_ACL_REHEARSAL',status:'PASS'});await checkpoint();
  stageToArmedGoogleGate(cluster,database,'r2-v4-historical-arm');
  const current=state(cluster,database),nonce=randomUUID(),operationRequestId=randomUUID();
  const lease=rpc(cluster,database,'begin_production_scoring_ingress_v3',beginInput(current,'r2-v4-provider-nonempty-lease',nonce,operationRequestId));
  assert.equal(lease.contract_version,'ADMISSION_V3');
  const outcome=psql(cluster,database,"select production_control.scoring_lease_outcome_evidence_hash(lease_id,request_fingerprint,'PROVEN_NO_WRITE',null,null,null,null,authority_generation_id,admission_generation_id,admission_revision)from scoring_authority.scoring_ingress_leases where lease_id="+sqlLiteral(lease.lease_id)+'::uuid');
  const settled=rpc(cluster,database,'report_production_scoring_ingress_outcome',{...optimisticInput(current,'r2-v4-provider-no-write'),operation:'WRITE_HOLE_SCORE',operation_request_id:operationRequestId,expected_provider_principal_fingerprint:legacyProviderPrincipalFingerprint,lease_id:lease.lease_id,lease_nonce:nonce,outcome_state:'PROVEN_NO_WRITE',outcome_evidence_fingerprint:outcome});
  assert.equal(settled.resolution_state,'PROVEN_NO_WRITE');assert.equal(settled.contract_version,'ADMISSION_V3');
  const {closed}=await certifyAclV2CutoverV4(cluster,database,'r2-v4-historical-cutover');
  const evidenceId=closed.close.external_fence_evidence_id;
  assert.ok(Number(closed.close.lease_high_watermark)>0);
  const prepared=rpc(cluster,database,'prepare_production_authority_epoch',prepareEpochInput(closed.current,evidenceId,closed,'CUTOVER','r2-v4-provider-prepare'));
  rpc(cluster,database,'commit_production_authority_epoch',commitEpochInput(state(cluster,database),evidenceId,closed,prepared.epoch_id,'r2-v4-provider-commit'));
  const root=()=>parseJsonOutput(psql(cluster,database,"select jsonb_build_object('status',status,'externalFenceId',external_fence_evidence_id,'providerFenceId',google_writer_provider_fence_id,'providerVerificationId',google_writer_provider_verification_id,'watermark',lease_high_watermark,'fingerprint',lease_set_fingerprint)from production_control.scoring_admission_closures where closure_id="+sqlLiteral(closed.close.closure_id)+'::uuid'));
  const original=root();assert.equal(original.status,'CONSUMED');assert.ok(original.externalFenceId&&original.providerFenceId&&original.providerVerificationId);assert.ok(Number(original.watermark)>0);
  evidence.steps.push({id:'HISTORICAL_PUBLIC_V4_PROTOCOL',status:'PASS',closure:original,nonemptyLeaseOutcome:'PROVEN_NO_WRITE',limitation:'Database protocol with real elapsed waits and synthetic provider observations; no real external writer'});await checkpoint();
  const names=providerMigrationNames.filter(name=>Number(name.slice(8,12))>41);
  for(const name of names){
   const before069=Number(name.slice(8,12))===69?providerAuthoritySnapshot(cluster,database):null;
   if(name.startsWith('202609280121'))for(const extra of ['candidates/scored-match-resume.sql','supabase/production_incremental/net-skins-sql-expressions-v1.sql','supabase/production_incremental/calcutta-exact-job-activation-recovery-v1.sql'])psqlFile(cluster,database,path.join(repositoryRoot,extra));
   if(name.startsWith('202609300128'))for(const extra of ['director-calcutta-management-read-v1.sql','director-calcutta-clear-entry-v1.sql'])psqlFile(cluster,database,path.join(repositoryRoot,'supabase/production_incremental',extra));
   if(name.startsWith('202609300131'))psqlFile(cluster,database,path.join(repositoryRoot,'supabase/production_incremental/player-portrait-policy-v1.sql'));
   psqlFile(cluster,database,path.join(migrationsDirectory,name));evidence.lastInstalled=name;
   if(before069){await verifyProvider069(cluster,database,t,evidence,before069);await checkpoint();}
  }
  assert.deepEqual(root(),original,'Forward install must preserve actual historical root and required evidence');
  const finalProvider=providerAuthoritySnapshot(cluster,database);
  assert.equal(finalProvider.epoch.epoch_id,prepared.epoch_id);
  assert.equal(finalProvider.activation.authority_generation_id,prepared.epoch_id);
  assert.equal(finalProvider.activation.boundary_mode,'PROVIDER_FENCE_V2');
  assert.equal(finalProvider.pointer.tournament_id,'2026');
  for(const key of ['maintenanceBindings','maintenanceRebindings','applicationReleases','normalReleases','annualGenerations'])assert.equal(Number(finalProvider[key]),0,'Through152 must not fabricate '+key);
  const finalRuntime={...scope,deployment_commit:deploymentCommit,expected_epoch_id:prepared.epoch_id};
  psql(cluster,database,'select production_control.assert_production_scoring_runtime('+jsonSql(finalRuntime)+');');
  const absentCertificate='PRODUCTION_ANNUAL_SCORING_PLATFORM_CERTIFICATION_REQUIRED';
  expectProviderSqlDenial(cluster,database,{statement:'perform public.read_production_scoring_dispatch_certification_v1('+jsonSql(finalRuntime)+')',sqlstate:'P0002'});
  expectProviderSqlDenial(cluster,database,{statement:'perform public.prepare_production_annual_scoring_transition_v1('+jsonSql({})+')',sqlstate:'55000',message:absentCertificate});
  const finalReadiness=parseJsonOutput(psql(cluster,database,"select production_control.annual_scoring_transition_readiness_v1('2026')::text"));
  assert.equal(finalReadiness.ready,false);
  assert.ok(finalReadiness.blockers.some(value=>value.code===absentCertificate),'Through152 must retain the Production missing-certificate readiness blocker');
  assert.equal(psql(cluster,database,'select count(*)from production_control.annual_scoring_platform_certifications_v1'),'0');
  assert.equal(psql(cluster,database,'select count(*)from production_control.annual_scoring_transitions_v1'),'0');
  evidence.steps.push({id:'CURRENT_FORWARD_PRESERVATION',status:'PASS',throughOrdinal:152,excludedOrdinals:[],authorityEpochId:prepared.epoch_id,legacyRuntimeAdmitted:true,annualAuthorityDenied:true,annualCertificatesFabricated:0});
  for(const field of ['external_fence_evidence_id','google_writer_provider_fence_id','google_writer_provider_verification_id']){
   await t.test('Production provider closure still requires '+field,()=>{
    assertCommandFailure(()=>psql(cluster,database,'begin;update production_control.scoring_admission_closures set '+field+'=null where closure_id='+sqlLiteral(closed.close.closure_id)+'::uuid;rollback;'),/production_scoring_closure_boundary_evidence_check/);
    assert.deepEqual(root(),original);
   });evidence.steps.push({id:'REQUIRED_'+field,status:'PASS'});
  }
  evidence.status='PASS';
 }catch(error){evidence.status='PARTIAL';evidence.error=error.message;throw error;}
 finally{evidence.sourceAfter=await providerSourceManifest();evidence.sourceStable=JSON.stringify(evidence.sourceAfter)===JSON.stringify(sourceBefore);
  if(!evidence.sourceStable)evidence.status='PARTIAL';await checkpoint();await destroyCluster(cluster);assert.equal(evidence.sourceStable,true,'Consumed source must remain frozen during the real-time proof');}
});`;
try{await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);}
catch(error){throw new Error('Provider history fixture: '+error.message,{cause:undefined});}
