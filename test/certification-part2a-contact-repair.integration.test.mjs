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
const body=v=>v.replace(/^\\set ON_ERROR_STOP on\n/m,'').replace(/^begin;\n/m,'').replace(/commit;\s*$/,'');
const evidence={environment:'OWNED_LOCAL_POSTGRESQL17_ONLY',hostedMutated:false,remoteNetwork:false,modeledAuthOnly:true,cases:[]};
test('preserved Certification fixture exact atomic contact repair',async t=>{
 const cluster=await createIsolatedCluster();
 try{
  const database='part2a_preserved_contact_repair';createDatabase(cluster,database);installLocalCanonicalPlatform(cluster,database);
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
  const counts=()=>canonicalTableCounts(cluster,database);
  const control=()=>q(`select jsonb_build_object('resource',(select to_jsonb(v) from production_control.canonical_resource_v1 v),
   'admission',(select to_jsonb(v) from production_control.certification_admission_v1 v),'gate',(select to_jsonb(v) from scoring_authority.ingress_gates v),
   'generation',(select to_jsonb(v) from production_control.certification_ingress_generations_v1 v),'pointer',(select to_jsonb(v) from production_control.current_tournament_pointer_v1 v),
   'receipt',(select to_jsonb(v) from production_control.canonical_bootstrap_installation_v1 v))`);
  const beforeState=q('select '+snapshot),beforeCatalog=await canonicalCatalog(cluster,database);
  const check=async(name,run)=>{let failure;await t.test(name,async()=>{try{await run();evidence.cases.push({name,result:'PASS'});}
   catch(error){failure=error;evidence.cases.push({name,result:'FAIL',error:error.message.slice(0,1800)});throw error;}});if(failure)throw failure;};
  await check('original omitted-contact package reproduces canonical identity denial without invented hosted facts',async()=>{
   assert.equal(q('select count(*) from participant_identity.participant_identity_contacts'),'0');
   owner('set_certification_admission_v1',{resource_id:resource.resource_id,expected_admission_revision:1,enabled:true,reason:'LOCAL ONLY reproduce original omission'});
   const input={contract_version:'certification-runtime-v1',resource,deployment,phase:'READS',operation:'READS.IDENTITY_FOR_AUTH',
    payload:{target_auth_user_id:fixtureIdentities[0].auth_user_id,target_tournament_id:'2026'}};
   const read=JSON.parse(q(`set request.jwt.claim.role='service_role';set role service_role;select public.read_certification_projection_v1(${jsonLiteral(input)})`));
   assert.equal(read.ok,false);assert.equal(read.code,'ACTIVE_USER_PLAYER_LINK_REQUIRED');
   owner('set_certification_admission_v1',{resource_id:resource.resource_id,expected_admission_revision:2,enabled:false,reason:'LOCAL ONLY restore checkpoint'});
  });
  // Use the supported control's actual new revision, not a manual restoration.
  request.expected.admission_revision=3;
  await check('repair follows supported release rebind without rewriting the original fixture receipt',async()=>{
   const releaseResource=Object.fromEntries(['resource_id','resource_class','installation_id','project_ref','project_url',
    'vercel_team_id','vercel_project_id','registration_revision','manifest_digest','schema_contract','schema_digest']
    .map(key=>[key,resource[key]]));
   const next={release_commit:'d'.repeat(40),deployment_id:'dpl_LocalReboundContactProof',
    deployment_origin:'https://local-rebound-contact-proof.vercel.app'};
   const rebound=owner('rebind_certification_release_v1',{contract_version:'certification-release-rebind-v1',
    operation_request_id:randomUUID(),resource:releaseResource,expected_admission_revision:3,
    expected_release_commit:deployment.release_commit,expected_deployment_id:deployment.deployment_id,
    expected_deployment_origin:deployment.deployment_origin,expected_current_tournament_id:'2026',expected_pointer_revision:1,
    expected_authority_epoch_id:expected.authority_epoch_id,expected_ingress_generation_id:expected.generation_id,
    deployment_class:'preview',new_release_commit:next.release_commit,new_deployment_id:next.deployment_id,
    new_deployment_origin:next.deployment_origin,reason:'LOCAL ONLY preserve fixture across supported rebind'});
   assert.equal(rebound.enabled,false);assert.equal(rebound.admission_revision,4);
   Object.assign(deployment,next);request.expected.admission_revision=rebound.admission_revision;
   assert.equal(q('select '+snapshot),beforeState);
   assert.deepEqual(JSON.parse(q(`select to_jsonb(v) from production_control.operation_audit_events v where event_id=${receipt.event_id}`)),receipt);
   evidence.supportedReleaseRebind=true;
  });
  const repair=await renderCertificationIdentityContactRepair(request);
  const safeControl=control(),safeCounts=counts();
  const deny=(text,pattern,baseline=safeCounts)=>{
   const r=sqlResult(cluster,database,'\\set VERBOSITY verbose\n'+text,{role:''});assert.notEqual(r.status,0);assert.match(r.stderr,pattern);
   assert.deepEqual(counts(),baseline);assert.equal(control(),safeControl);assert.equal(q('select '+snapshot),beforeState);
  };
  for(const ref of ['ymqhhtxaywtqllynrmxe','idgigvjjqkfbqjeredpb','z'.repeat(20)])await check('repair rejects resource '+ref+' before rendering',async()=>{
   const bad=structuredClone(request);bad.resource.project_ref=ref;await assert.rejects(renderCertificationIdentityContactRepair(bad),/checked-in Certification/);
  });
  await check('repair rejects client-selected identities and unapproved original package',async()=>{
   const bad=structuredClone(request);bad.identities=[];await assert.rejects(renderCertificationIdentityContactRepair(bad),/Exact owner request shape/);
   const old=structuredClone(request);old.fixture_receipt.package_sha256='d'.repeat(64);await assert.rejects(renderCertificationIdentityContactRepair(old),/Only the certified/);
  });
  for(const role of ['anon','authenticated','service_role'])await check(role+' cannot invoke repair',async()=>deny(`set role ${role};\n${repair}`,/42501/));
  await check('owner may not impersonate a runtime participant',async()=>deny(`set request.jwt.claim.role='authenticated';\n${repair}`,/CERTIFICATION_FIXTURE_OWNER_REQUIRED/));
  for(const [name,change,error] of [
   ['wrong deployment',r=>r.deployment.deployment_id='dpl_WrongLocalRepair',/DISABLED_BOUND_CONTEXT_REQUIRED/],
   ['wrong release',r=>r.deployment.release_commit='e'.repeat(40),/DISABLED_BOUND_CONTEXT_REQUIRED/],
   ['wrong origin',r=>r.deployment.deployment_origin='https://wrong-local-repair.vercel.app',/DISABLED_BOUND_CONTEXT_REQUIRED/],
   ['stale admission',r=>r.expected.admission_revision--,/DISABLED_BOUND_CONTEXT_REQUIRED/],
   ['wrong binding',r=>r.expected.binding_id=randomUUID(),/DISABLED_BOUND_CONTEXT_REQUIRED/],
   ['wrong epoch',r=>r.expected.authority_epoch_id=randomUUID(),/DISABLED_BOUND_CONTEXT_REQUIRED/],
   ['wrong generation',r=>r.expected.generation_id=randomUUID(),/no rows/],
   ['wrong original receipt',r=>r.fixture_receipt.event_id++,/EXPECTED_FIXTURE_REQUIRED/],
   ['wrong original fingerprint',r=>r.fixture_receipt.request_fingerprint='d'.repeat(64),/EXPECTED_FIXTURE_REQUIRED/],
  ])await check(name+' denied atomically',async()=>{const bad=structuredClone(request);change(bad);deny(await renderCertificationIdentityContactRepair(bad),error);});
  for(const [name,setup,error] of [
   ['enabled admission',"update production_control.certification_admission_v1 set enabled=true",/DISABLED_BOUND_CONTEXT_REQUIRED/],
   ['open ingress',"update scoring_authority.ingress_gates set state='OPEN'",/DISABLED_BOUND_CONTEXT_REQUIRED/],
   ['changed existing link',"update participant_identity.user_player_links set status='SUSPENDED' where player_id='P12'",/EXPECTED_FIXTURE_REQUIRED/],
   ['changed fixture',"update scoring_authority.players set display_name='Unapproved' where player_id='P24'",/EXPECTED_FIXTURE_REQUIRED/],
   ['unexpected context',"insert into participant_identity.identity_context_revisions values('2026',1,'unexpected',now(),'unexpected')",/UNEXPECTED_CONTACT_STATE/],
   ['preexisting contact',"insert into participant_identity.participant_identity_contacts(tournament_id,player_id,email,email_normalized,configuration_revision,source_system)values('2026','P12','wrong@synthetic.bagger-certification.invalid','wrong@synthetic.bagger-certification.invalid',1,'SYNTHETIC_FIXTURE')",/UNEXPECTED_CONTACT_STATE/],
  ])await check(name+' is not silently repaired',async()=>deny(`begin;${setup};${body(repair)}rollback;`,error));
  for(const event of ['CERTIFICATION_PART2A_SYNTHETIC_CONTACTS_PROVISIONED','CERTIFICATION_PART2A_IDENTITY_CONTACTS_REPAIRED'])await check(event+' audit failure rolls back all new rows',async()=>{
   const table=event.endsWith('REPAIRED')?'production_control.operation_audit_events':'participant_identity.identity_audit_events';
   q(`create function public.contact_test_fail()returns trigger language plpgsql as $$begin if new.event_type='${event}'then raise exception 'TEST_CONTACT_AUDIT_FAILURE';end if;return new;end$$;
    create trigger contact_test_fail before insert on ${table} for each row execute function public.contact_test_fail();`);
   try{deny(repair,/TEST_CONTACT_AUDIT_FAILURE/);}finally{q(`drop trigger contact_test_fail on ${table};drop function public.contact_test_fail();`);}
  });
  await check('managed owner repair creates only three contacts and required provenance; controls and fixture immutable',async()=>{
   assert.equal(q('select rolsuper from pg_roles where rolname=current_user'),'f');q(repair);
   assert.equal(control(),safeControl);assert.equal(q('select '+snapshot),beforeState);
   assert.equal(q('select count(*) from participant_identity.participant_identity_contacts'),'3');
   assert.equal(q('select count(*) from participant_identity.identity_context_revisions'),'1');
   assert.equal(q("select count(*) from participant_identity.identity_config_import_runs where status='APPROVED' and roster_count=4 and received_count=3 and missing_count=1"),'1');
   assert.equal(q('select count(*) from participant_identity.identity_audit_events'),'1');
   assert.equal(q("select count(*) from production_control.operation_audit_events where event_type='CERTIFICATION_PART2A_IDENTITY_CONTACTS_REPAIRED'"),'1');
  });
  const after=counts();
  await check('exact replay creates no duplicate contacts/audits/revisions',async()=>{q(repair);assert.deepEqual(counts(),after);assert.equal(control(),safeControl);});
  await check('conflicting replay and changed contacts are denied without overwriting',async()=>{
   const bad=structuredClone(request);bad.fixture_receipt.request_fingerprint='d'.repeat(64);deny(await renderCertificationIdentityContactRepair(bad),/EXPECTED_FIXTURE_REQUIRED/,after);
   deny(`begin;update participant_identity.participant_identity_contacts set identity_active=false where player_id='P12';${body(repair)}rollback;`,/CONTACT_REPAIR_CONFLICT/,after);
  });
  await check('original audit receipt and full catalog/security are unchanged',async()=>{
   assert.deepEqual(JSON.parse(q(`select to_jsonb(v) from production_control.operation_audit_events v where event_id=${receipt.event_id}`)),receipt);
   assert.deepEqual(await canonicalCatalog(cluster,database),beforeCatalog);evidence.catalogUnchanged=true;evidence.originalReceiptUnchanged=true;
  });
  await check('repaired fixture resolves all exact identities through canonical projection and resolver',async()=>{
   owner('set_certification_admission_v1',{resource_id:resource.resource_id,expected_admission_revision:request.expected.admission_revision,enabled:true,reason:'LOCAL ONLY repaired identity proof'});
   evidence.canonicalIdentity=await proveCanonicalContactIdentity({q,resource,deployment});
   owner('set_certification_admission_v1',{resource_id:resource.resource_id,expected_admission_revision:request.expected.admission_revision+1,enabled:false,reason:'LOCAL ONLY final dormant checkpoint'});
   assert.equal(q('select enabled from production_control.certification_admission_v1'),'f');assert.equal(q('select state from scoring_authority.ingress_gates'),'PAUSED');
   assert.equal(q('select '+snapshot),beforeState);
  });
  evidence.repairPackageSha256=hash(repair);evidence.legacyPackageSha256=legacyFixturePackageSha256;
  evidence.newRows={contacts:3,contextRevisions:1,importProvenance:1,identityAudit:1,repairAudit:1};
  evidence.preservedRowsModified=0;evidence.admissionDisabled=true;evidence.ingressPaused=true;
 }finally{
  await destroyIsolatedCluster(cluster);const dir='docs/reliability/phase2d-identity-contact-remediation/evidence';await mkdir(dir,{recursive:true});
  await writeFile(dir+'/repair-proof.json',JSON.stringify(evidence,null,2)+'\n');
 }
});
