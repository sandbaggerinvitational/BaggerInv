// Owned local PostgreSQL only; no hosted credentials, requests or JWT generation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import registration from '../config/certification-resource-registration.json' with {type:'json'};
import {certificationManifestDigest} from '../lib/canonical-resource-registration.js';
import {fixtureContract,contactRepairContract,fixtureIdentities,legacyFixtureTables,legacyFixturePackageSha256,
 renderCertificationIdentityContactRepair} from '../tools/reliability/certification-part2a-fixture.mjs';
import {createIsolatedCluster,destroyIsolatedCluster,createDatabase,sql,sqlResult,jsonLiteral,runResult,binaries} from './support/reliability/postgres17.mjs';
import {installLocalCanonicalPlatform} from './support/reliability/phase2d-resource-bootstrap.mjs';
import {readCanonicalArtifacts,installCanonicalBaseline,canonicalCatalog,canonicalTableCounts} from '../tools/reliability/canonical-bootstrap-artifacts.mjs';
import {proveCanonicalContactIdentity} from './support/reliability/certification-contact-identity-proof.mjs';

const hash=v=>createHash('sha256').update(v).digest('hex');
import {guideRepairContract,renderCertificationGuideRepair,preservedGuideTables,guideSnapshotSql} from '../tools/reliability/certification-part2a-guide-repair.mjs';
import {guideTables} from '../tools/reliability/certification-part2a-fixture.mjs';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';
import {readTournamentFoundation} from '../lib/tournament-foundation.js';
import {adaptProductionShadowCandidatePayload} from '../lib/production-shadow-read-adapters.js';
import {recalculateCompetitionDerivedTournament} from '../lib/competition-derived-supabase.js';
import {recalculateIntelligenceDerivedTournament} from '../lib/intelligence-derived-supabase.js';
const body=v=>v.replace(/^\\set ON_ERROR_STOP on\n/m,'').replace(/^begin;\n/m,'').replace(/commit;\s*$/,'');
const evidence={environment:'OWNED_LOCAL_POSTGRESQL17_ONLY',hostedMutated:false,remoteNetwork:false,modeledAuthOnly:true,cases:[]};
test('preserved Certification synthetic Guide repair and bounded pending-work model',async t=>{
 const cluster=await createIsolatedCluster();
 try{
  const database='part2a_preserved_guide_repair';createDatabase(cluster,database);installLocalCanonicalPlatform(cluster,database);
  const q=text=>sql(cluster,database,text,{role:''});
  q(`alter table auth.users add column role text default 'authenticated';
   insert into auth.users(id,email,email_confirmed_at,role)
   select (value->>'auth_user_id')::uuid,value->>'email',clock_timestamp(),'authenticated' from jsonb_array_elements(${jsonLiteral(fixtureIdentities)});
   create schema extensions;create extension pgcrypto with schema extensions;
   create role fixture_admin login superuser;create role managed_installer login nosuperuser createdb createrole bypassrls;`);
  const provider=text=>{
   const r=runResult(binaries.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-h',cluster.socket,'-p',String(cluster.port),'-U','fixture_admin','-d',database],
    {env:{PATH:process.env.PATH||'',PGOPTIONS:''},input:text});assert.equal(r.status,0,r.stderr);return r.stdout.trim();
  };
  provider(`alter role postgres rename to supabase_admin;alter role managed_installer rename to postgres;
   grant anon,authenticated,service_role to postgres;alter database ${database} owner to postgres;
   grant usage on schema auth,extensions to postgres;grant references,trigger on auth.users,auth.identities to postgres;grant all on auth.users to postgres;`);
  const bundle=await readCanonicalArtifacts();await installCanonicalBaseline(cluster,database,bundle);
  const resource={...registration.registration,manifest_digest:certificationManifestDigest(registration)};
  const deployment={vercel_team_id:resource.vercel_team_id,vercel_project_id:resource.vercel_project_id,
   git_branch:resource.git_branch,deployment_class:'preview',release_commit:'c'.repeat(40),
   deployment_id:'dpl_LocalPreservedContactProof',deployment_origin:'https://local-preserved-contact-proof.vercel.app'};
  const owner=(fn,input)=>JSON.parse(q(`select production_control.${fn}(${jsonLiteral(input)})`));
  owner('register_certification_resource_v1',resource);
  owner('initialize_certification_resource_v1',{...deployment,resource_id:resource.resource_id,initial_tournament_id:'2026',
   governance_tournament_id:'2026',binding_id:randomUUID(),authority_epoch_id:randomUUID(),capabilities:['READS','SCORING','DIRECTOR','WORKERS','ANNUAL']});
  const a=JSON.parse(q('select to_jsonb(a) from production_control.certification_admission_v1 a'));
  const gen=JSON.parse(q('select to_jsonb(g) from production_control.certification_ingress_generations_v1 g'));
  const expected={binding_id:a.binding_id,authority_epoch_id:a.authority_epoch_id,activation_revision:a.activation_revision,
   admission_revision:a.admission_revision,pointer_revision:1,generation_id:gen.generation_id,generation_revision:gen.revision};
  const legacyTemplate=await readFile(new URL('./support/reliability/fixtures/certification-part2a-omitted-contacts.sql',import.meta.url),'utf8');
  assert.equal(hash(legacyTemplate),legacyFixturePackageSha256,'Preserved original package must remain byte-identical');
  const snapshot=`jsonb_build_object(${legacyFixtureTables.map(table=>`'${table}',(select coalesce(jsonb_agg(to_jsonb(v) order by to_jsonb(v)::text collate "C"),'[]'::jsonb) from ${table} v)`).join(',')})`;
  const legacyRequest={contract:fixtureContract,operation_id:'certification-part2a-initial-fixture',resource:registration.registration,
   deployment,expected,registration_manifest_digest:certificationManifestDigest(registration),identities:fixtureIdentities,
   package_sha256:legacyFixturePackageSha256,installed_manifest_sha256:hash(await readFile(new URL('../supabase/canonical_bootstrap/manifest.json',import.meta.url))),
   installed_schema_sha256:bundle.manifest.artifacts.schema.sha256,installed_static_sha256:bundle.manifest.artifacts.staticData.sha256};
  q(legacyTemplate.replace('/*OWNER_REQUEST*/',jsonLiteral(legacyRequest)).replace('/*APPROVED_REGISTRATION*/',jsonLiteral(registration.registration))
   .replace('/*APPROVED_IDENTITIES*/',jsonLiteral(fixtureIdentities)).replaceAll('/*FIXTURE_SNAPSHOT*/',snapshot)
   .replace('/*LOCK_FIXTURE_TABLES*/',legacyFixtureTables.join(',')).replace('/*EMPTY_FIXTURE*/',legacyFixtureTables.map(table=>`exists(select 1 from ${table})`).join(' or ')));
  const receipt=JSON.parse(q("select to_jsonb(v) from production_control.operation_audit_events v where event_type='CERTIFICATION_PART2A_FIXTURE_BOOTSTRAPPED'"));
  const request={contract:contactRepairContract,operation_id:'certification-part2a-identity-contacts-repair',resource:registration.registration,
   deployment,expected,fixture_receipt:{event_id:receipt.event_id,request_fingerprint:receipt.request_fingerprint,
    package_sha256:legacyFixturePackageSha256,fixture_state_sha256:receipt.details.fixture_state_sha256}};
  q(await renderCertificationIdentityContactRepair(request));
  const beforeCatalog=await canonicalCatalog(cluster,database);
  const check=async(name,run)=>{let failure;await t.test(name,async()=>{try{await run();evidence.cases.push({name,result:'PASS'});}
   catch(error){failure=error;evidence.cases.push({name,result:'FAIL',error:error.message.slice(0,1600)});throw error;}});if(failure)throw failure;};
  const envelope={contract_version:'certification-runtime-v1',resource,deployment,phase:'DIRECTOR',
   authorization:{tournament_id:'2026',role:'DIRECTOR',player_id:'P01',auth_user_id:fixtureIdentities[0].auth_user_id}};
  const rpc=(name,input)=>JSON.parse(q(`set request.jwt.claim.role='service_role';set role service_role;select public.${name}(${jsonLiteral(input)})`));
  const context=()=>rpc('read_certification_runtime_context_v1',envelope).context;
  const mutate=(action,value)=>{
   const payload=buildTournamentSetupMutation(action,{operationRequestId:randomUUID(),...value});
   const id=payload.operation_request_id;delete payload.operation_request_id;
   const command={...envelope,operation_id:'DIRECTOR.MUTATE_SETUP',operation_request_id:id,expected_context_token:context().context_token,payload:{...payload,action}};
   const lease=rpc('admit_certification_operation_v1',command);
   const result=rpc('execute_certification_operation_v1',{...command,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}});
   assert.equal(result.ok,true,JSON.stringify(result));return result;
  };
  const activate=()=>owner('set_certification_admission_v1',{resource_id:resource.resource_id,
   expected_admission_revision:Number(q('select admission_revision from production_control.certification_admission_v1')),enabled:true,reason:'OWNED LOCAL Guide/work model only'});
  const pause=()=>owner('set_certification_admission_v1',{resource_id:resource.resource_id,
   expected_admission_revision:Number(q('select admission_revision from production_control.certification_admission_v1')),enabled:false,reason:'OWNED LOCAL dormant checkpoint'});
  const read=(operation,payload)=>rpc('read_certification_projection_v1',{...envelope,phase:'READS',operation,payload});
  const view=surface=>({payload:read('READS.CURRENT_VIEW',{surface,target_tournament_id:'2026'}),durationMs:0});
  const guide=()=>({payload:adaptProductionShadowCandidatePayload(read('READS.GUIDE',{target_tournament_id:'2026'}),{adapter:'GUIDE_PROJECTION'}),durationMs:0});
  const foundation=()=>readTournamentFoundation({env:{VERCEL_ENV:'development',SUPABASE_SCORING_MIRROR_URL:'http://localhost:1',SUPABASE_SCORING_MIRROR_SECRET_KEY:'local-only'},
   dependencies:{readTournamentLiveView:async()=>view('TOURNAMENT_LIVE'),readGuideProjection:async()=>guide(),
    readGoogleTournamentData:()=>{throw new Error('UNEXPECTED_EXTERNAL_CALL');}}});
  await check('unchanged Tournament foundation fails closed without Guide',async()=>{
   activate();await assert.rejects(foundation(),{code:'GUIDE_PROJECTION_UNAVAILABLE',status:503});
  });
  await check('canonical Director course and prepare operations reproduce four automatic jobs plus ineligible FinalRecap',async()=>{
   mutate('upsert-course',{expectedRevision:1,courseId:'C3',roundNumber:3,courseName:'Synthetic Certification Course Part2A',tee:'Tournament',rating:72,slope:120,par:72,
    holes:Array.from({length:18},(_,i)=>({number:i+1,par:4,strokeIndex:i+1,yardage:400}))});
   mutate('prepare-scoring-context',{expectedRevision:2,matchId:'2026-R3-12'});
   assert.equal(q('select count(*) from scoring_authority.competition_recalculation_jobs'),'5');
   assert.equal(q("select production_control.derived_final_recap_ready_v1('2026')"),'f');pause();
  });
  const controls=()=>q(`select jsonb_build_object('admission',(select to_jsonb(v) from production_control.certification_admission_v1 v),
   'gate',(select to_jsonb(v) from scoring_authority.ingress_gates v),'resource',(select to_jsonb(v) from production_control.canonical_resource_v1 v),
   'receipt',(select to_jsonb(v) from production_control.canonical_bootstrap_installation_v1 v))`);
  const preserved=()=>q('select '+guideSnapshotSql(preservedGuideTables));
  const currentHash=()=>q(`select encode(extensions.digest((${guideSnapshotSql(preservedGuideTables)})::text,'sha256'),'hex')`);
  const repairRequest={...request,contract:guideRepairContract,operation_id:'certification-part2a-guide-repair',
   expected:{...expected,admission_revision:3},fixture_snapshot_sha256:currentHash()};
  const repair=await renderCertificationGuideRepair(repairRequest),before=preserved(),beforeControls=controls();
  const noGuide=()=>{for(const table of guideTables)assert.equal(q(`select count(*) from ${table}`),'0');};
  const denied=(text,error)=>{const result=sqlResult(cluster,database,'\\set VERBOSITY verbose\n'+text,{role:''});
   assert.notEqual(result.status,0);assert.match(result.stderr,error);assert.equal(preserved(),before);assert.equal(controls(),beforeControls);noGuide();};
  for(const ref of ['ymqhhtxaywtqllynrmxe','idgigvjjqkfbqjeredpb','z'.repeat(20)])await check('fixed renderer denies resource '+ref,async()=>{
   const bad=structuredClone(repairRequest);bad.resource.project_ref=ref;await assert.rejects(renderCertificationGuideRepair(bad));
  });
  for(const role of ['anon','authenticated','service_role'])await check(role+' cannot invoke Guide repair',async()=>denied(`set role ${role};${repair}`,/42501/));
  await check('runtime JWT cannot impersonate owner provisioning',async()=>denied(`set request.jwt.claim.role='authenticated';${repair}`,/OWNER_REQUIRED/));
  for(const [name,change,pattern] of [
   ['wrong release',r=>r.deployment.release_commit='f'.repeat(40),/DISABLED_BOUND_CONTEXT_REQUIRED/],
   ['wrong deployment',r=>r.deployment.deployment_id='dpl_UnapprovedGuideRepair',/DISABLED_BOUND_CONTEXT_REQUIRED/],
   ['wrong receipt',r=>r.fixture_receipt.event_id++,/EXPECTED_FIXTURE_REQUIRED/],
   ['stale admission',r=>r.expected.admission_revision++,/DISABLED_BOUND_CONTEXT_REQUIRED/],
   ['wrong preserved snapshot',r=>r.fixture_snapshot_sha256='f'.repeat(64),/PRESERVED_FIXTURE_DRIFT/],
  ])await check(name+' refused atomically',async()=>{const bad=structuredClone(repairRequest);change(bad);denied(await renderCertificationGuideRepair(bad),pattern);});
  for(const [name,setup,error] of [
   ['enabled admission','update production_control.certification_admission_v1 set enabled=true',/DISABLED_BOUND_CONTEXT_REQUIRED/],
   ['open ingress',"update scoring_authority.ingress_gates set state='OPEN'",/DISABLED_BOUND_CONTEXT_REQUIRED/],
   ['changed course',"update scoring_authority.tournament_setup_course_tees_v1 set display_name='Conflicting'",/PRESERVED_FIXTURE_DRIFT/],
  ])await check(name+' rejected without changes',async()=>denied(`begin;${setup};${body(repair)}rollback;`,error));
  await check('mandatory repair audit failure rolls back both revision publications',async()=>{
   q(`create function public.guide_test_fail() returns trigger language plpgsql as $$begin
    if new.event_type='CERTIFICATION_PART2A_GUIDE_REPAIRED' then raise exception 'TEST_GUIDE_AUDIT_FAILURE';end if;return new;end$$;
    create trigger guide_test_fail before insert on production_control.operation_audit_events for each row execute function public.guide_test_fail();`);
   try{denied(repair,/TEST_GUIDE_AUDIT_FAILURE/);}finally{q('drop trigger guide_test_fail on production_control.operation_audit_events;drop function public.guide_test_fail();');}
  });
  await check('managed owner creates only truthful Guide publication with preserved current fixture/control state',async()=>{
   assert.equal(q('select rolsuper from pg_roles where rolname=current_user'),'f');q(repair);
   assert.equal(preserved(),before);assert.equal(controls(),beforeControls);
   for(const table of guideTables)assert.equal(q(`select count(*) from ${table}`),'1');
   const row=JSON.parse(q('select to_jsonb(v) from production_control.projection_revisions v'));
   assert.equal(row.source_workbook_id,'urn:bagger:synthetic:'+resource.installation_id);
   assert.equal(row.source_payload.source.authoringAuthority,'SYNTHETIC_FIXTURE');
   assert.equal(row.validation_status,'VALID');evidence.publication={revision:1,provenance:row.source_workbook_id,payloadFingerprint:row.payload_fingerprint};
  });
  await check('repair replay is idempotent; changed publication is denied',async()=>{
   const counts=canonicalTableCounts(cluster,database);q(repair);assert.deepEqual(canonicalTableCounts(cluster,database),counts);
   const changed=sqlResult(cluster,database,`begin;update production_control.projection_current set advanced_by='Conflicting';${body(repair)}rollback;`,{role:''});
   assert.notEqual(changed.status,0);assert.match(changed.stderr,/REPAIR_CONFLICT/);
   assert.equal(preserved(),before);assert.equal(controls(),beforeControls);
  });
  await check('same publication already present cannot be adopted by a different repair request',async()=>{
   // Counterfactual inside rollback, not a persisted receipt rewrite.
   const result=sqlResult(cluster,database,`begin;delete from production_control.operation_audit_events where event_type='CERTIFICATION_PART2A_GUIDE_REPAIRED';${body(repair)}rollback;`,{role:''});
   assert.notEqual(result.status,0);assert.match(result.stderr,/EXISTING_STATE_CONFLICT/);
  });
  await check('unchanged Tournament foundation succeeds with validated synthetic Guide',async()=>{
   activate();const result=await foundation();assert.equal(result.diagnostics.googleRequests,0);assert.equal(result.diagnostics.coursePresentationSource,'supabase-guide');
   evidence.foundation={withoutGuide:'GUIDE_PROJECTION_UNAVAILABLE',withGuide:'PASS',googleRequests:0};
  });
  const workerEnvelope={...envelope,phase:'WORKERS'};
  const workerRpc=(operation,payload)=>rpc('execute_certification_operation_v1',{...workerEnvelope,operation_id:operation,
   operation_request_id:randomUUID(),expected_context_token:rpc('read_certification_runtime_context_v1',workerEnvelope).context.context_token,payload});
  const tick=()=>workerRpc('WORKERS.DELIVERY_TICK',{contract_version:'score-derived-delivery-v1',worker_id:'local-bounded-part2a',materialization_family:'COMPETITION'});
  await check('pending classification: exactly four required now; FinalRecap is a truthful publication wait',async()=>{
   const value=tick();assert.equal(value.pendingAutomatic,4);assert.equal(value.waitingPublication.FINAL_RECAP,1);
   assert.equal(value.activeLeases,0);assert.equal(value.blockedAutomatic,0);evidence.beforeDrain=value;
  });
  await check('bounded model uses two unchanged shipping processors and current Certification wrappers, not an autonomous runner',async()=>{
   const operations={claim_competition_derived_jobs:'WORKERS.COMPETITION_CLAIM',write_competition_derived_snapshot:'WORKERS.COMPETITION_WRITE',
    mark_competition_derived_job_failed:'WORKERS.COMPETITION_FAIL',claim_intelligence_derived_bundle:'WORKERS.INTELLIGENCE_CLAIM',
    write_intelligence_derived_bundle:'WORKERS.INTELLIGENCE_WRITE',fail_intelligence_derived_bundle_v1:'WORKERS.INTELLIGENCE_FAIL'};
   // Pure local transport seam: never Production access/configuration. The
   // neutral processors retain their calculators; each call executes the real
   // Certification-only SQL gateway with current resource/release admission.
   const options={env:{VERCEL_ENV:'production'},scoringDispatchContext:{runtime:{tournamentId:'2026'}},
    workerId:'local-bounded-part2a',debounceMs:0,
    productionScoringOperationsRpc:async(name,input)=>{assert.ok(operations[name],name);return{payload:workerRpc(operations[name],input)};},
    readLeaderboardsCoreView:async()=>view('LEADERBOARDS'),readNetSkinsResultView:async()=>view('NET_SKINS_RESULT'),
    readPublishedOddsView:async()=>view('PUBLISHED_ODDS')};
   const competition=await recalculateCompetitionDerivedTournament('2026',options);assert.equal(competition.writes.length,2);
   const intelligence=await recalculateIntelligenceDerivedTournament('2026',options);assert.equal(intelligence.calculated.recap.gate.eligible,false);
   const value=tick();assert.equal(value.pendingAutomatic,0);assert.equal(value.activeLeases,0);assert.equal(value.terminal,0);
   assert.equal(q("select count(*) from scoring_authority.competition_recalculation_jobs where engine_key<>'TOURNAMENT_FINAL_RECAP' and status='SUCCEEDED'"),'4');
   assert.equal(q("select status from scoring_authority.competition_recalculation_jobs where engine_key='TOURNAMENT_FINAL_RECAP'"),'PENDING');
   assert.equal(q("select attempts from scoring_authority.competition_recalculation_jobs where engine_key='TOURNAMENT_FINAL_RECAP'"),'0');
   assert.equal(q('select count(*) from scoring_authority.competition_derived_snapshots where is_current'),'4');
   evidence.afterDrain=value;evidence.processors={competitionWrites:2,intelligenceWrites:2,autonomousRunner:false,transport:'OWNED_LOCAL_CERTIFICATION_GATEWAY',calculators:'UNCHANGED SHIPPING'};
  });
  await check('catalog/security exact; final admission disabled, ingress paused, scores/leases/FinalRecap absent',async()=>{
   pause();assert.deepEqual(await canonicalCatalog(cluster,database),beforeCatalog);
   assert.equal(q('select enabled from production_control.certification_admission_v1'),'f');assert.equal(q('select state from scoring_authority.ingress_gates'),'PAUSED');
   for(const table of ['hole_scores','score_mutations','odds_published_snapshots'])assert.equal(q(`select count(*) from scoring_authority.${table}`),'0');
   assert.equal(q("select count(*) from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN')"),'0');
   assert.equal(q("select count(*) from scoring_authority.competition_derived_snapshots where engine_key='TOURNAMENT_FINAL_RECAP'"),'0');
   for(const role of ['anon','authenticated','service_role']){
    const result=sqlResult(cluster,database,`set role ${role};select production_control.canonical_guide_read_v1('{}','{}');`,{role:''});
    assert.notEqual(result.status,0);assert.match(result.stderr,/permission denied/);
   }
   evidence.catalogUnchanged=true;evidence.finalState={admission:'DISABLED',ingress:'PAUSED',scores:0,activeLeases:0,requiredAutomatic:0,finalRecap:'PENDING_INELIGIBLE'};
  });
 }finally{
  await destroyIsolatedCluster(cluster);
  await mkdir('docs/reliability/phase2d-guide-prerequisite-remediation/evidence',{recursive:true});
  await writeFile('docs/reliability/phase2d-guide-prerequisite-remediation/evidence/repair-and-work-model.json',JSON.stringify(evidence,null,2)+'\n');
 }
});
