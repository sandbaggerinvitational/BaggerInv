// Owned PostgreSQL17 only. No URLs, tokens, hosted Auth, deployment or credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import registration from '../config/certification-resource-registration.json' with {type:'json'};
import {certificationManifestDigest} from '../lib/canonical-resource-registration.js';
import {fixtureContract,fixtureIdentities,fixtureTables,renderCertificationFixture} from '../tools/reliability/certification-part2a-fixture.mjs';
import {createIsolatedCluster,destroyIsolatedCluster,createDatabase,sql,sqlResult,jsonLiteral,runResult,binaries} from './support/reliability/postgres17.mjs';
import {installLocalCanonicalPlatform} from './support/reliability/phase2d-resource-bootstrap.mjs';
import {readCanonicalArtifacts,installCanonicalBaseline,canonicalCatalog,canonicalTableCounts} from '../tools/reliability/canonical-bootstrap-artifacts.mjs';
import {assertPortableCatalogConvergence} from '../tools/reliability/portable-canonical-catalog.mjs';
import {buildTournamentSetupMutation,normalizeProductionTournamentSetupPayload} from '../lib/production-tournament-setup-contract.js';
import {proveCanonicalContactIdentity} from './support/reliability/certification-contact-identity-proof.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const evidence={environment:'OWNED_LOCAL_POSTGRESQL17_ONLY',hostedMutated:false,remoteNetwork:false,
 modeledAuthOnly:true,cases:[],baseSha:'5d053589fe29ea1db85219eaf5690749cfb3dca7'};
const scriptBody=value=>value.replace(/^\\set ON_ERROR_STOP on\n/m,'');
test('owner Certification Part2A provisioning package',async t=>{
 const cluster=await createIsolatedCluster();
 try{
  const bundle=await readCanonicalArtifacts();
  const database='part2a_owner_fixture';createDatabase(cluster,database);installLocalCanonicalPlatform(cluster,database);
  const q=text=>sql(cluster,database,text,{role:''});
  q(`alter table auth.users add column role text default 'authenticated';
   insert into auth.users(id,email,email_confirmed_at,role)
   select (value->>'auth_user_id')::uuid,value->>'email',clock_timestamp(),'authenticated'
   from jsonb_array_elements(${jsonLiteral(fixtureIdentities)});
   create schema extensions;create extension pgcrypto with schema extensions;
   create role fixture_admin login superuser;
   create role managed_installer login nosuperuser createdb createrole bypassrls;`);
  const provider=text=>{
   const result=runResult(binaries.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-h',cluster.socket,
    '-p',String(cluster.port),'-U','fixture_admin','-d',database],{env:{PATH:process.env.PATH||'',PGOPTIONS:''},input:text});
   assert.equal(result.status,0,result.stderr);return result.stdout.trim();
  };
  provider(`alter role postgres rename to supabase_admin;alter role managed_installer rename to postgres;
   grant anon,authenticated,service_role to postgres;alter database ${database} owner to postgres;
   grant usage on schema auth,extensions to postgres;
   grant references,trigger on auth.users,auth.identities to postgres;
   -- Retained HOSTED-POST-DDL-PLATFORM records auth table provider default
   -- postgres=arwdDxtm/supabase_auth_admin. Model that existing privilege,
   -- not a proposed hosted grant or Auth/provider modification.
   grant all on auth.users to postgres;`);
  await installCanonicalBaseline(cluster,database,bundle);
  const resource={...registration.registration,manifest_digest:certificationManifestDigest(registration)};
  const deployment={vercel_team_id:resource.vercel_team_id,vercel_project_id:resource.vercel_project_id,
   git_branch:resource.git_branch,deployment_class:'preview',release_commit:'c'.repeat(40),
   deployment_id:'dpl_OwnedLocalFixtureProof',deployment_origin:'https://owned-local-fixture-proof.vercel.app'};
  const owner=(fn,input)=>JSON.parse(q(`select production_control.${fn}(${jsonLiteral(input)})`));
  owner('register_certification_resource_v1',resource);
  owner('initialize_certification_resource_v1',{...deployment,resource_id:resource.resource_id,
   initial_tournament_id:'2026',governance_tournament_id:'2026',binding_id:randomUUID(),authority_epoch_id:randomUUID(),
   capabilities:['READS','SCORING','DIRECTOR','WORKERS','ANNUAL']});
  const a=JSON.parse(q('select to_jsonb(a) from production_control.certification_admission_v1 a'));
  const gen=JSON.parse(q('select to_jsonb(g) from production_control.certification_ingress_generations_v1 g'));
  const request={contract:fixtureContract,operation_id:'certification-part2a-initial-fixture',resource:registration.registration,
   deployment,expected:{binding_id:a.binding_id,authority_epoch_id:a.authority_epoch_id,
    activation_revision:a.activation_revision,admission_revision:a.admission_revision,pointer_revision:1,
    generation_id:gen.generation_id,generation_revision:gen.revision}};
  const rendered=await renderCertificationFixture(request);
  const beforeCatalog=await canonicalCatalog(cluster,database);
  const counts=()=>canonicalTableCounts(cluster,database);
  const before=counts();
  const control=()=>q(`select jsonb_build_object('admission',(select to_jsonb(v) from production_control.certification_admission_v1 v),
   'gate',(select to_jsonb(v) from scoring_authority.ingress_gates v),'generation',(select to_jsonb(v) from production_control.certification_ingress_generations_v1 v),
   'pointer',(select to_jsonb(v) from production_control.current_tournament_pointer_v1 v),'receipt',(select to_jsonb(v) from production_control.canonical_bootstrap_installation_v1 v))`);
  const beforeControl=control();
  const check=async(name,run)=>{let failure;await t.test(name,async()=>{
   try{await run();evidence.cases.push({name,result:'PASS'});}
   catch(error){failure=error;evidence.cases.push({name,result:'FAIL',error:error.message.slice(0,1500)});throw error;}
  });if(failure)throw failure;};
  const denied=(text,pattern)=>{
   const run=sqlResult(cluster,database,'\\set VERBOSITY verbose\n'+text,{role:''});
   assert.notEqual(run.status,0);assert.match(run.stderr,pattern);
   assert.deepEqual(counts(),before);assert.equal(control(),beforeControl);
  };
  await check('renderer rejects Production, old Preview, arbitrary and client-selected resource/identities',async()=>{
   for(const ref of ['ymqhhtxaywtqllynrmxe','idgigvjjqkfbqjeredpb','z'.repeat(20)]){
    const bad=structuredClone(request);bad.resource.project_ref=ref;bad.resource.project_url=`https://${ref}.supabase.co`;
    await assert.rejects(renderCertificationFixture(bad),/checked-in Certification registration/);
   }
   const bad=structuredClone(request);bad.identities=[{auth_user_id:randomUUID()}];
   await assert.rejects(renderCertificationFixture(bad),/Exact owner request shape/);
  });
  for(const role of ['anon','authenticated','service_role'])await check(`${role} cannot invoke owner provisioning`,async()=>{
   denied(`set role ${role};\n${rendered}`,/42501/);
  });
  await check('owner cannot impersonate a service-role runtime request',async()=>{
   denied(`set request.jwt.claim.role='service_role';\n${rendered}`,/CERTIFICATION_FIXTURE_OWNER_REQUIRED/);
  });
  for(const [name,change] of [
   ['wrong release',r=>r.deployment.release_commit='d'.repeat(40)],
   ['wrong deployment',r=>r.deployment.deployment_id='dpl_WrongOwnedLocalProof'],
   ['wrong origin',r=>r.deployment.deployment_origin='https://wrong-owned-local.vercel.app'],
   ['wrong binding',r=>r.expected.binding_id=randomUUID()],
   ['wrong epoch',r=>r.expected.authority_epoch_id=randomUUID()],
   ['stale activation',r=>r.expected.activation_revision++],
   ['stale admission',r=>r.expected.admission_revision++],
   ['stale pointer',r=>r.expected.pointer_revision++],
   ['stale generation',r=>r.expected.generation_revision++],
  ])await check(name+' denied atomically',async()=>{
   const bad=structuredClone(request);change(bad);denied(await renderCertificationFixture(bad),/CERTIFICATION_FIXTURE_DISABLED_BOUND_CONTEXT_REQUIRED/);
  });
  for(const [name,setup,error] of [
   ['admission enabled',`update production_control.certification_admission_v1 set enabled=true`,/CERTIFICATION_FIXTURE_DISABLED_BOUND_CONTEXT_REQUIRED/],
   ['ingress open',`update scoring_authority.ingress_gates set state='OPEN'`,/CERTIFICATION_FIXTURE_DISABLED_BOUND_CONTEXT_REQUIRED/],
   ['wrong registered database',`update production_control.canonical_resource_v1 set database_name='wrong_database'`,/CANONICAL_RESOURCE_IDENTITY_IMMUTABLE/],
   ['wrong installed receipt',`update production_control.canonical_bootstrap_installation_v1 set schema_sha256=repeat('d',64)`,/CERTIFICATION_INITIALIZATION_EVIDENCE_IMMUTABLE/],
   ['wrong existing player',`insert into scoring_authority.players(player_id,display_name) values('UNAPPROVED','Unapproved')`,/CERTIFICATION_FIXTURE_EMPTY_BASE_REQUIRED/],
  ])await check(name+' refused without fixture changes',async()=>{
   denied(`begin;${setup};\n${scriptBody(rendered).replace(/^begin;\n/,'').replace(/commit;\s*$/,'')}\nrollback;`,error);
  });
  for(const [name,setup,restore] of [
   ['unconfirmed Auth',`update auth.users set email_confirmed_at=null where id='${fixtureIdentities[0].auth_user_id}'`,
    `update auth.users set email_confirmed_at=clock_timestamp() where id='${fixtureIdentities[0].auth_user_id}'`],
   ['non-synthetic Auth',`update auth.users set email='unapproved@example.invalid' where id='${fixtureIdentities[1].auth_user_id}'`,
    `update auth.users set email='${fixtureIdentities[1].email}' where id='${fixtureIdentities[1].auth_user_id}'`],
  ])await check(name+' refuses linkage',async()=>{
   provider(setup);try{denied(rendered,/CERTIFICATION_FIXTURE_SYNTHETIC_AUTH_REQUIRED/);}finally{provider(restore);}
  });
  await check('required audit failure rolls back every fixture row',async()=>{
   q(`create function public.fixture_audit_failure() returns trigger language plpgsql as $$begin
    if new.event_type='CERTIFICATION_PART2A_FIXTURE_BOOTSTRAPPED' then raise exception 'TEST_REQUIRED_AUDIT_FAILURE';end if;return new;end$$;
    create trigger fixture_audit_failure before insert on production_control.operation_audit_events for each row execute function public.fixture_audit_failure();`);
   try{denied(rendered,/TEST_REQUIRED_AUDIT_FAILURE/);}
   finally{q('drop trigger fixture_audit_failure on production_control.operation_audit_events;drop function public.fixture_audit_failure();');}
  });
  await check('managed non-superuser owner creates exact minimum fixture without enabling admission',async()=>{
   // Owned local cluster can safely model managed postgres after baseline install.
   assert.equal(q('select rolsuper from pg_roles where rolname=current_user'),'f');
   q(rendered);
   assert.equal(control(),beforeControl);
   assert.equal(q('select count(*) from scoring_authority.players'),'4');
   assert.equal(q('select count(*) from scoring_authority.matches'),'2');
   assert.equal(q('select count(*) from scoring_authority.match_holes'),'36');
   assert.equal(q('select count(*) from participant_identity.user_player_links'),'3');
   assert.equal(q('select count(*) from participant_identity.participant_identity_contacts'),'3');
   assert.equal(q("select count(*) from participant_identity.identity_config_import_runs where status='APPROVED' and valid_count=3 and missing_count=1"),'1');
   assert.equal(q("select context_revision from participant_identity.identity_context_revisions where tournament_id='2026'"),'1');
   assert.equal(q('select count(*) from production_control.director_entitlements'),'1');
   assert.equal(q('select count(*) from scoring_authority.scoring_permissions where can_score'),'0');
   for(const table of ['hole_scores','score_mutations','score_derived_intents_v1','odds_calculation_jobs','odds_published_snapshots',
    'competition_recalculation_jobs','net_skins_v1_recalculation_jobs','calcutta_v1_recalculation_jobs'])
    assert.equal(q(`select count(*) from scoring_authority.${table}`),'0',table);
  });
  const after=counts();
  await check('fresh Guide is one validated synthetic revision/publication in each canonical store',async()=>{
   for(const table of ['production_control.projection_revisions','production_control.projection_current',
    'scoring_authority.guide_content_revisions','scoring_authority.guide_projection_current'])assert.equal(q(`select count(*) from ${table}`),'1');
   const row=JSON.parse(q('select to_jsonb(v) from production_control.projection_revisions v'));
   assert.equal(row.source_payload.source.authoringAuthority,'SYNTHETIC_FIXTURE');
   assert.equal(row.source_workbook_id,'urn:bagger:synthetic:'+resource.installation_id);
   assert.equal(row.validation_status,'VALID');assert.equal(row.revision_number,1);
   evidence.guide={revision:1,publicationSequence:1,provenance:'SYNTHETIC_FIXTURE',payloadFingerprint:row.payload_fingerprint};
  });
  await check('exact same request replay is a no-op with one audited receipt',async()=>{
   q(rendered);assert.deepEqual(counts(),after);assert.equal(control(),beforeControl);
   assert.equal(q("select count(*) from production_control.operation_audit_events where event_type='CERTIFICATION_PART2A_FIXTURE_BOOTSTRAPPED'"),'1');
   const row=JSON.parse(q("select to_jsonb(v) from production_control.operation_audit_events v where event_type='CERTIFICATION_PART2A_FIXTURE_BOOTSTRAPPED'"));
   assert.equal(row.details.enabled,false);assert.equal(row.details.ingress,'PAUSED');
   assert.equal(row.details.deployment.deployment_id,deployment.deployment_id);assert.match(row.details.package_sha256,/^[a-f0-9]{64}$/);
   evidence.receipt={eventType:row.event_type,actor:row.actor,packageSha256:row.details.package_sha256,fixtureStateSha256:row.details.fixture_state_sha256};
  });
  await check('changed package/request receipt conflicts; changed persisted fixture is not silently repaired',async()=>{
   for(const setup of [
    "update production_control.operation_audit_events set request_fingerprint=repeat('d',64) where event_type='CERTIFICATION_PART2A_FIXTURE_BOOTSTRAPPED'",
   "update scoring_authority.players set display_name='Changed' where player_id='P24'",
   "update participant_identity.participant_identity_contacts set identity_active=false where player_id='P12'",
   "update production_control.projection_current set advanced_by='Changed' where domain='GUIDE'",
   ]){
    const result=sqlResult(cluster,database,`begin;${setup};\n${scriptBody(rendered).replace(/^begin;\n/,'').replace(/commit;\s*$/,'')}\nrollback;`,{role:''});
    assert.notEqual(result.status,0);assert.match(result.stderr,/CERTIFICATION_FIXTURE_CONFLICT|CERTIFICATION_FIXTURE_DRIFT/);
    assert.deepEqual(counts(),after);assert.equal(control(),beforeControl);
   }
  });
  await check('all catalog functions, ACLs, triggers, RLS, owners and private cores remain exact',async()=>{
   assert.deepEqual(await canonicalCatalog(cluster,database),beforeCatalog);
   assertPortableCatalogConvergence(await canonicalCatalog(cluster,database),bundle.catalog);
   for(const role of ['anon','authenticated','service_role']){
    const deniedCore=sqlResult(cluster,database,`set role ${role};select production_control.push_certification_context_v1('{}','DIRECTOR',false);`,{role:''});
    assert.notEqual(deniedCore.status,0);assert.match(deniedCore.stderr,/permission denied/);
   }
   evidence.catalogUnchanged=true;evidence.controlsUnchanged=true;evidence.fixtureCounts={players:4,teams:2,rounds:1,matches:2,holes:36,authLinks:3,directorEntitlements:1};
  });
  await check('fixture supports existing canonical Director setup, full-roster pairing and financial contracts after separate local activation',async()=>{
   owner('set_certification_admission_v1',{resource_id:resource.resource_id,expected_admission_revision:1,enabled:true,reason:'LOCAL ONLY fixture usability proof'});
   evidence.canonicalIdentity=await proveCanonicalContactIdentity({q,resource,deployment});
   const envelope={contract_version:'certification-runtime-v1',resource, deployment,phase:'DIRECTOR',
    authorization:{tournament_id:'2026',role:'DIRECTOR',player_id:'P01',auth_user_id:fixtureIdentities[0].auth_user_id}};
   const rpc=(name,input)=>JSON.parse(q(`set request.jwt.claim.role='service_role';set role service_role;select public.${name}(${jsonLiteral(input)})`));
   const read=rpc('read_certification_operation_v1',{...envelope,operation_id:'DIRECTOR.READ_SETUP',payload:{family:'TOURNAMENT_SETUP'}});
   assert.equal(read.ok,true);assert.equal(read.data.matches.length,2);
   const context=rpc('read_certification_runtime_context_v1',envelope).context;
   const payload=buildTournamentSetupMutation('replace-round-pairings',{expectedRevision:1,operationRequestId:randomUUID(),
    roundNumber:3,expectedHandicapRevisionId:'10000000-0000-4000-8000-000000000001',
    matches:read.data.matches.map(m=>({...m,participants:m.participants}))});
   const id=payload.operation_request_id;delete payload.operation_request_id;
   const command={...envelope,operation_id:'DIRECTOR.MUTATE_PAIRINGS',
    operation_request_id:id,expected_context_token:context.context_token,payload:{...payload,action:'replace-round-pairings'}};
   const lease=rpc('admit_certification_operation_v1',command);
   const paired=rpc('execute_certification_operation_v1',{...command,
    ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}});
   assert.equal(paired.ok,true,JSON.stringify(paired));
   const skins=rpc('read_certification_operation_v1',{...envelope,operation_id:'DIRECTOR.READ_NET_SKINS',payload:{}});
   assert.equal(skins.contract,'production-net-skins-entries-v1');assert.equal(skins.rounds.length,1);
   assert.equal(skins.rounds[0].entrants.length,4);assert.equal(skins.rounds[0].state,'NOT_CONFIGURED');
   const calcutta=rpc('read_certification_operation_v1',{...envelope,operation_id:'DIRECTOR.READ_CALCUTTA',payload:{}});
   assert.equal(calcutta.state,'CONFIGURED');assert.equal(calcutta.players.length,4);
   assert.equal(calcutta.publication_state,'UNPUBLISHED');assert.deepEqual(calcutta.purchases,[]);
   // Bootstrap does not falsely declare prepared competitive state. The
   // unchanged admitted Director operation must lawfully prepare it later.
   const model=normalizeProductionTournamentSetupPayload(rpc('read_certification_operation_v1',{...envelope,operation_id:'DIRECTOR.READ_SETUP',payload:{}}));
   const preparePayload=buildTournamentSetupMutation('prepare-scoring-context',{
    expectedRevision:model.revision,operationRequestId:randomUUID(),matchId:'2026-R3-12'});
   const prepareId=preparePayload.operation_request_id;delete preparePayload.operation_request_id;
   const prepare={...envelope,operation_id:'DIRECTOR.MUTATE_SETUP',operation_request_id:prepareId,
    expected_context_token:rpc('read_certification_runtime_context_v1',envelope).context.context_token,
    payload:{...preparePayload,action:'prepare-scoring-context'}};
   const prepareLease=rpc('admit_certification_operation_v1',prepare);
   const prepared=rpc('execute_certification_operation_v1',{...prepare,
    ingress:{lease_id:prepareLease.lease_id,admission_generation_id:prepareLease.admission_generation_id}});
   assert.equal(prepared.ok,true,JSON.stringify(prepared));
   assert.equal(q("select prepared_setup_revision=setup_revision from scoring_authority.tournament_setup_match_details_v1 where match_id='2026-R3-12'"),'t');
   owner('set_certification_admission_v1',{resource_id:resource.resource_id,expected_admission_revision:2,enabled:false,reason:'LOCAL ONLY restore dormant proof checkpoint'});
   assert.equal(q('select enabled from production_control.certification_admission_v1'),'f');
   assert.equal(q('select state from scoring_authority.ingress_gates'),'PAUSED');
  });
  evidence.renderedPackageSha256=hash(rendered);evidence.installedBootstrapUnchanged=true;
 }finally{
  await destroyIsolatedCluster(cluster);
  await mkdir('docs/reliability/phase2d-identity-contact-remediation/evidence',{recursive:true});
  await writeFile('docs/reliability/phase2d-identity-contact-remediation/evidence/fresh-proof.json',JSON.stringify(evidence,null,2)+'\n');
 }
});
