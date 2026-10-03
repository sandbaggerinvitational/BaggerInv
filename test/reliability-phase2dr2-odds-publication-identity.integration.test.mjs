// NA-CERTIFICATION-ODDS-FULL-SOURCE-PUBLICATION: actual equal-result jobs,
// genuine source advancement and explicit owner publication. No result fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {createCertificationFixture} from './support/reliability/phase2d-certification-fixture.mjs';
import {destroyIsolatedCluster,jsonLiteral,openSqlSession} from './support/reliability/postgres17.mjs';
import {certificationTransportRegistration} from './support/reliability/certification-ingress-js-proof.mjs';
import {provisionAnnualSyntheticAuthority,annualRuntime} from './support/reliability/certification-annual-transition-fixture.mjs';
import {certificationOddsStack} from './support/reliability/certification-odds-proof.mjs';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';
import {certificationProvisionalProfile} from './support/reliability/certification-provisional-profile.mjs';
import {assertOddsDomainEquivalence,assertPublicOddsHasNoPrivateProvenance} from './support/reliability/odds-domain-equivalence.mjs';
import {publishedOddsSnapshotsFromView,publishedOddsFreshness} from '../lib/published-odds-supabase.js';
import {mobileProductionOddsView,mobileOddsDataFromView} from '../lib/mobile-v1-odds.js';
const migration='supabase/production_migrations/202609300150_certification_odds_publication_source_identity_v1.sql';
const forward=[...certificationProvisionalProfile];
assert.ok(forward.includes(migration),'canonical profile must include publication identity150');
assert.deepEqual(forward,[...forward].sort(),'canonical profile must retain migration order');
const file='test/reliability-phase2dr2-odds-publication-identity.integration.test.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
test('Certification publication identity distinguishes fresh source without changing equal canonical results',async t=>{
 const paths=[...forward,file,'lib/certification-odds-server.js','lib/certification-runtime-server.js',
  'test/support/reliability/certification-odds-proof.mjs','test/support/reliability/certification-annual-transition-fixture.mjs'];
 const hashes=async()=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
 const evidence={environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',hosted:false,production:false,googleCalls:0,
  priorCounterevidence:'release-transition-2026-10-03T01-29-40.988Z.json',sourceBefore:await hashes(),cases:[]};
 let f;
 const check=async(name,fn)=>{let failed;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,status:'PASS'});}catch(e){failed=e;throw e;}});if(failed)throw failed;};
 try{
  f=await createCertificationFixture({forwardMigrations:forward,registrationFactory:certificationTransportRegistration});
  provisionAnnualSyntheticAuthority(f);let losePublicationAck=false;
  const runtime=annualRuntime(f),stack=await certificationOddsStack(f,{loseResponse:(_url,init,response)=>{
   if(losePublicationAck&&init.method==='POST'&&JSON.parse(init.body).action==='publish'&&response.status===200){
    losePublicationAck=false;return true;
   }return false;
  }});
  const configBefore=f.q('select jsonb_agg(to_jsonb(c)order by id)from scoring_authority.odds_input_configurations c');
  const matchId='2026-R1-1',match=()=>JSON.parse(f.q(`select to_jsonb(m)from scoring_authority.matches m where match_id='${matchId}'`));
  const setupId=randomUUID(),setup=buildTournamentSetupMutation('prepare-scoring-context',{expectedRevision:f.model().revision,operationRequestId:setupId,matchId});
  delete setup.operation_request_id;
  runtime.execute(runtime.request('DIRECTOR.MUTATE_SETUP',{...setup,action:'prepare-scoring-context'},runtime.authorization(),setupId));
  for(const action of ['mark-live',...(match().scoring_locked?['scoring-unlock']:[]),'access-activate']){
   const m=match();runtime.execute(runtime.request('DIRECTOR.MATCH_CONTROL',{action,match_id:matchId,
    expected_match_revision:m.match_revision,expected_permission_revision:m.permission_revision}));
  }
  let hole=1;
  const score=()=>{const m=match(),id=randomUUID();return runtime.execute(runtime.request('SCORING.SUBMIT_HOLE',{
   match_id:matchId,mutation_key:id,hole_number:hole++,expected_match_revision:m.match_revision,expected_hole_revision:0,
   team_1_gross_scores:[4,4],team_2_gross_scores:[5,5]},
   {...runtime.authorization(),match_id:matchId,permission_revision:m.permission_revision},id));};
  const job=id=>JSON.parse(f.q(`select to_jsonb(j)from scoring_authority.odds_calculation_jobs j where job_id='${id}'`));
  const equivalent=id=>assertOddsDomainEquivalence({tournamentId:'2026',jobId:id,
   readJobs:async()=>({payload:{ok:true,jobs:[job(id)]}})});
  const snapshot=id=>JSON.parse(f.q(`select to_jsonb(s)from scoring_authority.odds_published_snapshots s where id='${id}'`));
  const currentRows=()=>f.q('select jsonb_agg(to_jsonb(s)order by id)from scoring_authority.odds_published_snapshots s');
  const calculate=async()=>{const view=await stack.client(),command={action:'calculate',operationRequestId:randomUUID(),
   expectedContextToken:view.context.token,phase:'Pre-Tournament',iterations:10000};const result=await stack.client(command);
   assert.equal(result.publicationCreated,false);return{command,...result};};
  const publishCommand=async id=>{const view=await stack.client();return{action:'publish',operationRequestId:randomUUID(),
   expectedContextToken:view.context.token,jobId:id,confirmPublication:true,expectedPublicationRevision:view.publication.revision,
   expectedSnapshotId:view.publication.snapshotId};};
  const rpcPublish=command=>{const j=job(command.jobId);return{...f.envelope,phase:'DIRECTOR',
   operation_id:'ODDS.publish_production_championship_odds_v1',operation_request_id:command.operationRequestId,
   expected_context_token:command.expectedContextToken,payload:{odds_operation:'publish_production_championship_odds_v1',
    job_id:command.jobId,expected_publication_revision:command.expectedPublicationRevision,expected_snapshot_id:command.expectedSnapshotId,
    milestone:j.phase,expected_source_fingerprint:j.source_revision.source_fingerprint,expected_result_fingerprint:j.result_fingerprint}};};
  const identity=row=>{
   const id=row.source_calculation_revision.publication_source_identity;
   assert.equal(id.contract_version,'certification-odds-publication-source-v1');
   assert.equal(id.configuration_source_fingerprint,row.source_calculation_revision.source_fingerprint);
   assert.equal(id.canonical_live_source_fingerprint,job(row.source_calculation_job_id).input_snapshot.metadata.certificationLiveSourceFingerprint);
   assert.equal(row.source_fingerprint,id.fingerprint);assert.deepEqual(row.resource_binding.publication_source_identity,id);
   const {fingerprint,...body}=id;
   assert.equal(f.q(`select production_control.odds_publication_v1_hash(${jsonLiteral(body)})`),fingerprint);
   return id;
  };
  let first,firstPublished,second,secondCommand,secondPublished,firstBefore;
  await check('real first calculation and explicit publication record both canonical source components',async()=>{
   first=await calculate();assert.equal((await stack.worker(first.jobId)).completed,true);
   await equivalent(first.jobId);
   firstPublished=await stack.client(await publishCommand(first.jobId));firstBefore=snapshot(firstPublished.snapshotId);
   assert.equal(firstPublished.publication.revision,1);identity(firstBefore);
  });
  await check('genuine scoring produces a fresh job with the identical numerical result and unchanged configuration',async()=>{
   score();second=await calculate();assert.notEqual(second.jobId,first.jobId);assert.equal((await stack.worker(second.jobId)).completed,true);
   const a=job(first.jobId),b=job(second.jobId);await equivalent(second.jobId);
   assert.equal(a.result_fingerprint,b.result_fingerprint);
   const {publishedAt:atA,...resultA}=a.result_payload,{publishedAt:atB,...resultB}=b.result_payload;
   assert.deepEqual(resultA,resultB);assert.equal(a.source_revision.source_fingerprint,b.source_revision.source_fingerprint);
   assert.notEqual(a.input_snapshot.metadata.certificationLiveSourceFingerprint,b.input_snapshot.metadata.certificationLiveSourceFingerprint);
   assert.equal(f.q('select jsonb_agg(to_jsonb(c)order by id)from scoring_authority.odds_input_configurations c'),configBefore);
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'1');
   secondCommand=await publishCommand(second.jobId);
   evidence.equalResults={firstJob:first.jobId,secondJob:second.jobId,resultFingerprint:b.result_fingerprint,iterations:10000,
    sameConfiguration:true,differentLiveSource:true,algorithmEqual:true};
  });
  await check('required receipt failure rolls back second snapshot, current flags, job and audit',async()=>{
   const before={rows:currentRows(),job:job(second.jobId),audit:f.q('select count(*)from production_control.operation_audit_events')};
   f.q(`create function public.synthetic_publication_identity_fault()returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_IDENTITY_RECEIPT_FAULT';end;$$;
    create trigger synthetic_publication_identity_fault before insert on production_control.certification_odds_receipts_v1
    for each row execute function public.synthetic_publication_identity_fault();`);
   try{await assert.rejects(stack.client(secondCommand));}finally{
    f.q('drop trigger synthetic_publication_identity_fault on production_control.certification_odds_receipts_v1;drop function public.synthetic_publication_identity_fault();');}
   assert.equal(currentRows(),before.rows);assert.deepEqual(job(second.jobId),before.job);
   assert.equal(f.q('select count(*)from production_control.operation_audit_events'),before.audit);
   assert.equal((await stack.client({action:'status',originalAction:'publish',operationRequestId:secondCommand.operationRequestId})).state,'UNKNOWN');
  });
  await check('same-result fresh-source publication commits revision2 with immutable predecessor and accurate audit',async()=>{
   losePublicationAck=true;await assert.rejects(stack.client(secondCommand));assert.equal(losePublicationAck,false);
   const recovered=await stack.client({action:'status',originalAction:'publish',operationRequestId:secondCommand.operationRequestId});
   assert.equal(recovered.state,'COMMITTED');
   secondPublished=await stack.client(secondCommand);assert.equal(secondPublished.publication.revision,2);
   assert.equal(secondPublished.snapshotId,recovered.receipt.snapshotId);
   assert.notEqual(secondPublished.snapshotId,firstPublished.snapshotId);
   const next=snapshot(secondPublished.snapshotId),old=snapshot(firstPublished.snapshotId);
   assert.deepEqual(old,{...firstBefore,is_current_for_milestone:false,is_current_official:false});
   assert.notEqual(identity(next).fingerprint,identity(old).fingerprint);
   assert.equal(next.logical_payload_hash,old.logical_payload_hash);
   for(const key of ['settings_fingerprint','ratings_fingerprint','pairing_fingerprint','engine_version','deterministic_seed'])assert.equal(next[key],old[key]);
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'2');
   const audit=JSON.parse(f.q(`select details from production_control.operation_audit_events where event_type='CERTIFICATION_CHAMPIONSHIP_ODDS_PUBLISHED'
    and details->>'snapshot_id'='${next.id}'`));
   assert.equal(audit.resource_binding.resource_id,f.resource.resource_id);
   evidence.publicationIdentity={first:identity(old),second:identity(next),revision:2,predecessorImmutable:true,
    actualClientAcknowledgementDiscarded:true,recovered:'COMMITTED'};
  });
  await check('same-operation replay and lost-response recovery do not duplicate publication; changed request conflicts',async()=>{
   const repeat=await stack.client(secondCommand);assert.equal(repeat.snapshotId,secondPublished.snapshotId);assert.equal(repeat.duplicate,true);
   const recovery=await stack.client({action:'status',originalAction:'publish',operationRequestId:secondCommand.operationRequestId});
   assert.equal(recovery.state,'COMMITTED');assert.equal(recovery.receipt.snapshotId,secondPublished.snapshotId);
   await assert.rejects(stack.client({...secondCommand,expectedPublicationRevision:2,expectedSnapshotId:secondPublished.snapshotId}));
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'2');
  });
  await check('same source and result retains the existing job and never creates duplicate logical publication',async()=>{
   const repeated=await calculate();assert.equal(repeated.jobId,second.jobId);
   await assert.rejects(stack.client(await publishCommand(repeated.jobId)));
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'2');
   assert.equal(f.q("select count(*)from scoring_authority.odds_published_snapshots where is_current_official"),'1');
  });
  await check('actual public freshness and PWA/Build10 projections remain current without exposing private provenance',async()=>{
   const read=(await stack.published()).payload.data;
   const freshness=publishedOddsFreshness(read);assert.equal(freshness.current,true,JSON.stringify(freshness));assert.deepEqual(freshness.reasons,[]);
   const snapshots=publishedOddsSnapshotsFromView(read);assert.ok(snapshots.length>0);
   const mobile=mobileOddsDataFromView(mobileProductionOddsView(read,{tournamentId:'2026'}));
   assertPublicOddsHasNoPrivateProvenance(snapshots);assertPublicOddsHasNoPrivateProvenance(mobile);
   assert.equal(freshness.sourceFingerprint,snapshot(secondPublished.snapshotId).source_fingerprint);
   evidence.publicContracts={freshness:freshness.status,pwa:true,build10:true,privateProvenance:false};
  });
  await check('stale source, forged identity, wrong resource, wrong actor and worker publication remain denied',async()=>{
   score();const third=await calculate();assert.equal((await stack.worker(third.jobId)).completed,true);
   const command=await publishCommand(third.jobId),rpc=rpcPublish(command),before=currentRows();
   for(const changed of[
    {...rpc,phase:'WORKERS',authorization:null},
    {...rpc,resource:{...rpc.resource,resource_id:'CERTIFICATION:'+randomUUID()}},
    {...rpc,authorization:{...rpc.authorization,role:'PARTICIPANT'}},
    {...rpc,payload:{...rpc.payload,expected_source_fingerprint:'f'.repeat(64)}}
   ])assert.throws(()=>f.rpc('dispatch_certification_odds_v1',changed));
   score();await assert.rejects(stack.client(command));
   assert.ok(stack.calls.some(c=>c.input.operation_request_id===command.operationRequestId&&c.error?.message==='ODDS_CALCULATION_SOURCE_ADVANCED'));
   assert.equal(currentRows(),before);
  });
  await check('concurrent owner CAS publishes a single revision for the same fresh equal-result job',async()=>{
   const next=await calculate();assert.equal((await stack.worker(next.jobId)).completed,true);
   assert.equal(job(next.jobId).result_fingerprint,job(first.jobId).result_fingerprint);
   const left=rpcPublish(await publishCommand(next.jobId)),right={...left,operation_request_id:randomUUID()};
   const a=openSqlSession(f.cluster,f.database),b=openSqlSession(f.cluster,f.database);
   try{
    const result=JSON.parse(await a.query(`begin;set local role service_role;select public.dispatch_certification_odds_v1(${jsonLiteral(left)})`));
    assert.equal(result.publication_revision,3);const pid=Number(await b.query('select pg_backend_pid()'));
    const other=b.query(`set role service_role;select public.dispatch_certification_odds_v1(${jsonLiteral(right)})`);
    const rejected=assert.rejects(other,/PUBLICATION_REVISION_CONFLICT/);
    let blocked=false;for(let i=0;i<80;i++){if(f.q(`select wait_event_type='Lock'from pg_stat_activity where pid=${pid}`)==='t'){blocked=true;break;}await delay(25);}
    assert.equal(blocked,true);await a.query('commit');await rejected;
    assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'3');
   }finally{await Promise.all([a.close(),b.close()]);}
  });
  await check('index definition, private privileges and immutable identity components remain protected',async()=>{
   evidence.index=f.q("select pg_get_indexdef('scoring_authority.odds_native_publication_idempotency_idx'::regclass)");
   assert.ok(evidence.index.includes('(tournament_id, milestone, logical_payload_hash, source_fingerprint, settings_fingerprint, ratings_fingerprint, pairing_fingerprint, engine_version, deterministic_seed)'));
   const context={...f.envelope,phase:'DIRECTOR',operation_request_id:randomUUID(),expected_context_token:f.context().context_token};
   for(const assignment of["source_fingerprint=repeat('f',64)","source_calculation_revision=jsonb_set(source_calculation_revision,'{publication_source_identity}','{}')",
    "resource_binding=jsonb_set(resource_binding,'{publication_source_identity}','{}')"]){
    assert.throws(()=>f.q(`begin;select production_control.push_certification_context_v1(${jsonLiteral(context)},'DIRECTOR',true);
     update scoring_authority.odds_published_snapshots set ${assignment} where id='${secondPublished.snapshotId}';rollback;`,'service_role'),/PUBLISHED_SNAPSHOT_IMMUTABLE/);
   }
   for(const role of ['anon','authenticated','service_role'])assert.throws(()=>f.q(`set role ${role};select production_control.canonical_publish_odds_v2('{}','2026','{}')`,role),/permission denied/);
   evidence.functionIdentity=JSON.parse(f.q(`select jsonb_build_object('identity',oid::regprocedure::text,'owner',pg_get_userbyid(proowner),
    'acl',proacl::text,'path',proconfig,'definer',prosecdef)from pg_proc where oid='production_control.canonical_publish_odds_v2(jsonb,text,jsonb)'::regprocedure`));
   assert.equal(evidence.functionIdentity.owner,'postgres');assert.deepEqual(evidence.functionIdentity.path,['search_path=pg_catalog']);
   evidence.installationEquivalence='EXACT_BODY_REVERSAL_AND_PG_PROC_PG_DEPEND_INDEX_OID_ASSERTIONS';
   assert.equal(f.q('select jsonb_agg(to_jsonb(c)order by id)from scoring_authority.odds_input_configurations c'),configBefore);
   assert.equal(f.q('select count(*)from scoring_authority.odds_google_mirror_jobs'),'0');
  });
  evidence.sourceAfter=await hashes();assert.deepEqual(evidence.sourceAfter,evidence.sourceBefore);
  evidence.sourceStable=true;evidence.result='PASS';
 }catch(error){evidence.result='FAIL';evidence.error=String(error.stack||error);throw error;}
 finally{
  if(f)await destroyIsolatedCluster(f.cluster);
  const directory='docs/reliability/phase2d-resource-model/implementation-evidence';await mkdir(directory,{recursive:true});
  const timestamp=new Date().toISOString().replaceAll(/[:.]/g,'-');
  await writeFile(`${directory}/odds-publication-identity-${timestamp}.json`,JSON.stringify(evidence,null,2)+'\n');
 }
});
