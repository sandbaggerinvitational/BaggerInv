// POSTGRESQL / SECURITY / INTEGRATION / FAILURE INJECTION / CONCURRENCY.
// Socket-only canonical fixture, real actor/context gates; no Production request.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {createP0FFinancialFixture} from './support/reliability/p0f-financial-fixture.mjs';
import {destroyIsolatedCluster,jsonLiteral,repositoryRoot,binaries,sqlFile} from './support/reliability/postgres17.mjs';

test('P0-F reduced financial cores preserve canonical authority, receipts and isolated provenance',async t=>{
 const installChecks=[];
 const f=await createP0FFinancialFixture({beforeInstall:async f=>{
  const apply=()=>sqlFile(f.cluster,f.database,path.join(repositoryRoot,'supabase/production_migrations/202609300129_isolated_financial_cores_v1.sql'),{role:''});
  const reject=(name,setup,cleanup,pattern)=>{f.query(setup);assert.throws(apply,pattern);assert.equal(f.query("select to_regprocedure('production_control.canonical_net_skins_entries_core_v1(jsonb)') is null"),'t');assert.equal(f.query("select to_regclass('production_control.isolated_financial_audit_context_v1') is null"),'t');f.query(cleanup);installChecks.push(name);};
  f.query('create role p0f_unexpected_role');
  reject('existing additional EXECUTE grant','grant execute on function public.save_production_net_skins_entries_v1(jsonb) to p0f_unexpected_role','revoke execute on function public.save_production_net_skins_entries_v1(jsonb) from p0f_unexpected_role',/PRIVILEGE_BASELINE_MISMATCH/);
  reject('existing function owner drift','alter function public.save_production_net_skins_entries_v1(jsonb) owner to p0f_unexpected_role','alter function public.save_production_net_skins_entries_v1(jsonb) owner to postgres',/PRIVILEGE_BASELINE_MISMATCH/);
  reject('existing search path drift','alter function public.save_production_net_skins_entries_v1(jsonb) set search_path=public','alter function public.save_production_net_skins_entries_v1(jsonb) set search_path=pg_catalog',/PRIVILEGE_BASELINE_MISMATCH/);
  reject('new private function default EXECUTE grant','alter default privileges in schema production_control grant execute on functions to p0f_unexpected_role','alter default privileges in schema production_control revoke execute on functions from p0f_unexpected_role',/PRIVATE_ACL_MISMATCH/);
  reject('new marker table default SELECT grant','alter default privileges in schema production_control grant select on tables to p0f_unexpected_role','alter default privileges in schema production_control revoke select on tables from p0f_unexpected_role',/CONTEXT_ACL_MISMATCH/);
 }});const {query,read,execute,status,entryCommand,auctionCommand,cluster,database}=f;
 const cases=[];const check=async(name,fn)=>t.test(name,async()=>{const r={name,status:'FAIL'};cases.push(r);await fn();r.status='PASS';});
 t.after(async()=>{
  const directory=path.join(repositoryRoot,'docs/reliability/phase2c1-closure/evidence/p0f-final-closure');await mkdir(directory,{recursive:true});
  const paths=['supabase/production_migrations/202609300128_isolated_director_context_v1.sql','supabase/production_migrations/202609300129_isolated_financial_cores_v1.sql','test/reliability-p0f-financial.integration.test.mjs','test/support/reliability/p0f-financial-fixture.mjs'];
  const hashes=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(await readFile(path.join(repositoryRoot,p))).digest('hex')])));
  await writeFile(path.join(directory,'financial-results.json'),JSON.stringify({environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',production:false,google:false,statementTimeoutMs:1000,cases,installChecks,hashes,before:f.beforeFinancial,after:f.afterFinancial,limitations:['No hosted deployment or capacity proof','Unchanged Production wrappers denied isolated input; no remote Production request','Calcutta configuration is fixture construction, not an exposed isolated mutation']},null,2)+'\n');
  await destroyIsolatedCluster(cluster);
 });
 const markerCount=()=>query('select count(*) from production_control.isolated_financial_audit_context_v1');
 const protectedFacts=()=>query(`select md5(jsonb_build_object('matches',(select jsonb_agg(to_jsonb(x)order by match_id)from scoring_authority.matches x),'participants',(select jsonb_agg(to_jsonb(x)order by match_id,player_id)from scoring_authority.match_participants x),'holes',(select jsonb_agg(to_jsonb(x))from scoring_authority.hole_scores x),'skins',(select jsonb_agg(to_jsonb(x))from scoring_authority.net_skins_v1_configuration_current x),'config',(select jsonb_agg(to_jsonb(x)order by configuration_revision)from scoring_authority.calcutta_v1_configuration_revisions x),'odds',(select jsonb_agg(to_jsonb(x))from scoring_authority.odds_publication_current x))::text)`);
 const originalFacts=protectedFacts();
 const requestValues={purchases:[{player_id:'P02',purchase_price:'100.01'},{player_id:'P05',purchase_price:'25'}],ownership:[{player_id:'P02',owner_player_id:'P03',ownership_fraction:'0.5'},{player_id:'P02',owner_player_id:'P04',ownership_fraction:'0.5'},{player_id:'P05',owner_player_id:'P01',ownership_fraction:'1'}]};
 let firstEntry,firstAuction;
 await check('migration refuses owner/attribute/ACL/default-privilege drift and rolls back all partial installation',()=>{assert.equal(installChecks.length,5);assert.equal(markerCount(),'0');});
 await check('catalog public OIDs/owners/ACL/search paths preserved; only three private cores introduced',()=>{
  for(const before of f.beforeFinancial.functions){const after=f.afterFinancial.functions.find(x=>x.name===before.name&&x.schema===before.schema);assert.ok(after);
   for(const key of ['oid','owner','acl','config','volatile','definer','anon','authenticated','service'])assert.deepEqual(after[key],before[key],`${before.name}:${key}`);
   if(!['save_production_net_skins_entries_v1','replace_production_calcutta_v1_auction_facts','clear_production_calcutta_v1_auction_entry'].includes(before.name))assert.equal(after.body,before.body,`${before.name} unchanged`);
  }
  for(const name of ['canonical_net_skins_entries_core_v1','canonical_calcutta_auction_core_v1','canonical_calcutta_clear_core_v1']){const item=f.afterFinancial.functions.find(x=>x.name===name);assert.equal(item.schema,'production_control');assert.equal(item.anon,false);assert.equal(item.authenticated,false);assert.equal(item.service,false);assert.equal(item.definer,true);assert.deepEqual(item.config,['search_path=pg_catalog']);}
  assert.equal(query("select to_regprocedure('production_control.canonical_calcutta_configure_core_v1(jsonb,jsonb)') is null"),'t');
  // Public objects remain the same OIDs, so inbound stored dependencies cannot bypass new admission.
  assert.deepEqual(f.afterFinancial.dependencies.filter(d=>!d.from.includes('canonical_')&&!d.from.includes('isolated_director_financial')).map(JSON.stringify).sort(),f.beforeFinancial.dependencies.map(JSON.stringify).sort());
 });
 await check('runtime roles cannot forge provenance or invoke private cores; public Production rejects isolated scope',()=>{
  for(const role of ['anon','authenticated','service_role']){
   assert.throws(()=>query(`set role ${role};select production_control.canonical_calcutta_auction_core_v1('{}','{}')`),/permission denied/);
   assert.throws(()=>query(`set role ${role};insert into production_control.isolated_financial_audit_context_v1 values(1,pg_current_xact_id(),'2026','replace-auction','${randomUUID()}',repeat('a',64),'{}')`),/permission denied/);
  }
  for(const fn of ['save_production_net_skins_entries_v1','replace_production_calcutta_v1_auction_facts','clear_production_calcutta_v1_auction_entry'])assert.throws(()=>f.call(fn,{...f.envelope,environment:'ISOLATED'}),/PRODUCTION_|TOURNAMENT_/);
  assert.throws(()=>execute(f.command('CALCUTTA_MANAGEMENT','configure',{})),/OPERATION_INVALID/);
  assert.equal(markerCount(),'0');
 });
 await check('Net Skins BB/SC/Singles entry authority uses exact immutable bindings and receipts',()=>{
  for(const rn of [1,2,3]){const request=entryCommand(rn);const result=execute(request).receipt;assert.equal(result.revision,1);assert.equal(result.financialMutationCreated,false);assert.equal(result.scoringMutationCreated,false);assert.equal(f.round(rn).enteredCount,1);assert.equal(execute(request).receipt.idempotent,true);assert.equal(status(request).outcome,'COMMITTED');
   assert.throws(()=>execute({...request,payload:{...request.payload,configured:false}}),/IDEMPOTENCY_CONFLICT/);
   assert.throws(()=>execute({...request,operation_request_id:randomUUID()}),/REVISION_STALE/);
   if(rn===1)firstEntry=request;
  }
  const bad=entryCommand(2);bad.payload.entries[0].bindingFingerprint='0'.repeat(64);assert.throws(()=>execute(bad),/ENTRY_BINDING_INVALID/);
  const otherRounds=JSON.stringify([f.round(1),f.round(3)]);execute(entryCommand(2,false));assert.equal(JSON.stringify([f.round(1),f.round(3)]),otherRounds);
  assert.equal(protectedFacts(),originalFacts);
 });
 await check('Net Skins started-round/current-entry guards are unchanged',()=>{
  const request=entryCommand(1);query("update scoring_authority.matches set status='LIVE' where tournament_id='2026' and round_number=1");assert.throws(()=>execute(request),/DEPENDENCY_BLOCKED/);query("update scoring_authority.matches set status='UPCOMING' where tournament_id='2026' and round_number=1");
  const stale=entryCommand(1);stale.payload.field_fingerprint='f'.repeat(64);assert.throws(()=>execute(stale),/PAIRING_STALE/);
  assert.equal(f.round(1).revision,1);
 });
 await check('Calcutta ownership/purchase replacement preserves rules, amounts, publication authority and idempotency',()=>{
  firstAuction=auctionCommand('replace-auction',requestValues);const result=execute(firstAuction).receipt;assert.equal(result.auction_revision,1);assert.equal(result.pot,'125.01');assert.equal(result.publication_state,'UNPUBLISHED');assert.equal(execute(firstAuction).receipt.idempotent,true);
  assert.deepEqual(read().data.purchases,requestValues.purchases);assert.deepEqual(read().data.ownership,requestValues.ownership);assert.equal(status(firstAuction).outcome,'COMMITTED');
  assert.throws(()=>execute({...firstAuction,payload:{...firstAuction.payload,purchases:[{player_id:'P02',purchase_price:'999'}]}}),/IDEMPOTENCY_CONFLICT/);
  assert.throws(()=>execute({...firstAuction,operation_request_id:randomUUID()}),/REVISION_CONFLICT/);
  const invalid=auctionCommand('replace-auction',{...requestValues,ownership:[{player_id:'P02',owner_player_id:'P03',ownership_fraction:'0.2'}]});assert.throws(()=>execute(invalid),/OWNERSHIP|AUCTION/);assert.equal(markerCount(),'0');assert.equal(protectedFacts(),originalFacts);
 });
 await check('existing receipt resolves after context revision changes without new mutation or rebind',()=>{
  const previous=read().data.auction_revision;query('update production_control.isolated_director_context_v1 set activation_revision=activation_revision+1,binding_revision=binding_revision+1');
  assert.throws(()=>execute(firstAuction),/CONTEXT_STALE/);assert.equal(status(firstAuction).outcome,'COMMITTED');assert.equal(status(firstEntry).outcome,'COMMITTED');
  assert.equal(status({...firstAuction,operation_request_id:randomUUID()}).outcome,'UNKNOWN');
  assert.throws(()=>status({...firstAuction,payload:{...firstAuction.payload,purchases:[]}}),/IDEMPOTENCY_CONFLICT/);
  assert.equal(read().data.auction_revision,previous);assert.equal(markerCount(),'0');
 });
 await check('single-entry clear retains immutable history, other entries, CAS and publication/result guards',()=>{
  const history=query("select md5(auction_manifest::text)from scoring_authority.calcutta_v1_auction_fact_revisions where tournament_id='2026' and auction_revision=1");
  const request=auctionCommand('clear-entry',{player_id:'P02'});const result=execute(request).receipt;assert.equal(result.cleared_player_id,'P02');assert.equal(execute(request).receipt.idempotent,true);assert.equal(status(request).outcome,'COMMITTED');
  assert.deepEqual(read().data.purchases,[requestValues.purchases[1]]);assert.equal(read().data.ownership.length,1);assert.equal(query("select md5(auction_manifest::text)from scoring_authority.calcutta_v1_auction_fact_revisions where tournament_id='2026' and auction_revision=1"),history);
  query("update scoring_authority.calcutta_v1_current set publication_state='PUBLISHED'where tournament_id='2026'");assert.throws(()=>execute(auctionCommand('clear-entry',{player_id:'P05'})),/PUBLISHED_DENIED/);query("update scoring_authority.calcutta_v1_current set publication_state='UNPUBLISHED',result_revision=1 where tournament_id='2026'");assert.throws(()=>execute(auctionCommand('clear-entry',{player_id:'P05'})),/RESULT_DEPENDENCY/);query("update scoring_authority.calcutta_v1_current set result_revision=0 where tournament_id='2026'");
  assert.equal(markerCount(),'0');
 });
 await check('failure before required isolated audit rolls back financial facts, receipt, marker and all audit',()=>{
  const request=auctionCommand('replace-auction',requestValues);const snapshot=query("select md5(jsonb_build_object('current',(select to_jsonb(c)from scoring_authority.calcutta_v1_current c where tournament_id='2026'),'auction',(select jsonb_agg(to_jsonb(a)order by auction_revision)from scoring_authority.calcutta_v1_auction_fact_revisions a),'receipts',(select count(*)from production_control.cutover_operation_receipts),'audit',(select count(*)from production_control.operation_audit_events))::text)");
  query("create function public.p0f_injected_audit_failure()returns trigger language plpgsql as $$begin if new.event_type='ISOLATED_DIRECTOR_FINANCIAL_OPERATION' then raise exception 'P0F_INJECTED_AUDIT_FAILURE';end if;return new;end$$;create trigger p0f_injected_failure before insert on production_control.operation_audit_events for each row execute function public.p0f_injected_audit_failure()");
  assert.throws(()=>execute(request),/P0F_INJECTED_AUDIT_FAILURE/);query('drop trigger p0f_injected_failure on production_control.operation_audit_events;drop function public.p0f_injected_audit_failure()');
  assert.equal(query("select md5(jsonb_build_object('current',(select to_jsonb(c)from scoring_authority.calcutta_v1_current c where tournament_id='2026'),'auction',(select jsonb_agg(to_jsonb(a)order by auction_revision)from scoring_authority.calcutta_v1_auction_fact_revisions a),'receipts',(select count(*)from production_control.cutover_operation_receipts),'audit',(select count(*)from production_control.operation_audit_events))::text)"),snapshot);assert.equal(status(request).outcome,'UNKNOWN');assert.equal(markerCount(),'0');assert.equal(execute(request).receipt.ok,true);
 });
 const seedJob=()=>JSON.parse(query(`insert into scoring_authority.calcutta_v1_recalculation_jobs(tournament_id,configuration_revision_id,configuration_revision,configuration_fingerprint,auction_revision_id,auction_revision,auction_fingerprint,activation_revision,source_revision,source_fingerprint,reason,requested_by) select tournament_id,configuration_revision_id,configuration_revision,configuration_fingerprint,auction_revision_id,auction_revision,auction_fingerprint,1,'{}',repeat('e',64),'SYNTHETIC_FIXTURE','P01'from scoring_authority.calcutta_v1_current where tournament_id='2026' returning to_jsonb(calcutta_v1_recalculation_jobs)`));
 await check('auction supersession records isolated handling and unchanged originating activation atomically',()=>{
  const job=seedJob();const request=auctionCommand('replace-auction',requestValues);execute(request);
  const event=JSON.parse(query(`select to_jsonb(e)from production_control.score_derived_delivery_attempts_v1 e where family='CALCUTTA'and work_identity='${job.job_id}'and transition='SUPERSEDED' order by event_id desc limit1`.replace('limit1','limit 1')));
  assert.equal(event.originating_activation_revision,1);assert.equal(event.handling_activation_revision,2);assert.equal(event.handling_release_commit,'9'.repeat(40));assert.equal(event.safe_code,'ISOLATED_DIRECTOR_AUCTION_SUPERSEDED');
  const audit=JSON.parse(query(`select details from production_control.operation_audit_events where event_type='ISOLATED_DIRECTOR_DERIVED_SUPERSEDED'and details->>'delivery_event_id'='${event.event_id}'`));assert.equal(audit.operation_request_id,request.operation_request_id);assert.equal(audit.context_binding_id,f.envelope.resource.binding_id);assert.equal(audit.actor_auth_user_id,f.envelope.authorization.auth_user_id);assert.equal(audit.runtime,'ISOLATED');assert.equal(markerCount(),'0');
  const count=query('select count(*)from production_control.operation_audit_events');execute(request);assert.equal(query('select count(*)from production_control.operation_audit_events'),count,'replay appends no new operation/provenance audit');
 });
 await check('outside approved transaction provenance trigger is a no-op and previous audit history remains intact',()=>{
  const job=seedJob();query(`update scoring_authority.calcutta_v1_recalculation_jobs set status='SUPERSEDED',completed_at=now()where job_id='${job.job_id}'`);
  const event=JSON.parse(query(`select to_jsonb(e)from production_control.score_derived_delivery_attempts_v1 e where work_identity='${job.job_id}'order by event_id desc limit1`.replace('limit1','limit 1')));
  assert.equal(event.safe_code,null);assert.equal(String(event.handling_activation_revision),query("select activation_revision from production_control.cutover_activation_state where scope_key='BAGGER_INV_PRODUCTION'"));assert.equal(event.handling_release_commit,query("select expected_deployment_commit from production_control.cutover_activation_state where scope_key='BAGGER_INV_PRODUCTION'"));assert.equal(markerCount(),'0');
 });
 await check('failure after derived supersession rolls back job, delivery audit, receipt and transaction marker',()=>{
  const job=seedJob(),request=auctionCommand('replace-auction',requestValues);
  const before=query(`select md5(jsonb_build_object('job',(select to_jsonb(j)from scoring_authority.calcutta_v1_recalculation_jobs j where job_id='${job.job_id}'),'current',(select to_jsonb(c)from scoring_authority.calcutta_v1_current c where tournament_id='2026'),'audit',(select count(*)from production_control.operation_audit_events),'delivery',(select count(*)from production_control.score_derived_delivery_attempts_v1),'receipts',(select count(*)from production_control.cutover_operation_receipts))::text)`);
  query("create function public.p0f_after_supersession_failure()returns trigger language plpgsql as $$begin if new.event_type='ISOLATED_DIRECTOR_FINANCIAL_OPERATION' then raise exception 'P0F_AFTER_SUPERSESSION_FAILURE';end if;return new;end$$;create trigger p0f_supersession_failure before insert on production_control.operation_audit_events for each row execute function public.p0f_after_supersession_failure()");
  assert.throws(()=>execute(request),/P0F_AFTER_SUPERSESSION_FAILURE/);query('drop trigger p0f_supersession_failure on production_control.operation_audit_events;drop function public.p0f_after_supersession_failure()');
  assert.equal(query(`select md5(jsonb_build_object('job',(select to_jsonb(j)from scoring_authority.calcutta_v1_recalculation_jobs j where job_id='${job.job_id}'),'current',(select to_jsonb(c)from scoring_authority.calcutta_v1_current c where tournament_id='2026'),'audit',(select count(*)from production_control.operation_audit_events),'delivery',(select count(*)from production_control.score_derived_delivery_attempts_v1),'receipts',(select count(*)from production_control.cutover_operation_receipts))::text)`),before);
  assert.equal(markerCount(),'0');assert.equal(status(request).outcome,'UNKNOWN');execute(request);
 });
 await check('a live isolated transaction marker cannot relabel another backend delivery event',async()=>{
  const job=seedJob(),request=auctionCommand('replace-auction',requestValues),outsideId=randomUUID();
  query("create function public.p0f_hold_marker()returns trigger language plpgsql as $$begin raise notice 'P0F_MARKER_READY';perform pg_sleep(0.25);return new;end$$;create trigger p0f_hold_marker after insert on production_control.isolated_financial_audit_context_v1 for each row execute function public.p0f_hold_marker()");
  let readyResolve;const ready=new Promise(r=>{readyResolve=r;});
  const p=spawn(binaries.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-h',cluster.socket,'-p',String(cluster.port),'-U','postgres','-d',database],{env:{PATH:process.env.PATH,PGOPTIONS:'-c request.jwt.claim.role=service_role'},stdio:['pipe','pipe','pipe']});let error='';p.stderr.on('data',x=>{error+=x;if(error.includes('P0F_MARKER_READY'))readyResolve();});const done=new Promise(resolve=>p.on('close',code=>{readyResolve();resolve(code);}));p.stdin.end(`set role service_role;select public.execute_isolated_director_operation_v1(${jsonLiteral(request)});`);await ready;
  try{assert.match(error,/P0F_MARKER_READY/);assert.equal(markerCount(),'0','uncommitted marker is invisible to a different backend');query(`insert into production_control.score_derived_delivery_attempts_v1(tournament_id,family,work_identity,cycle,attempt,transition,safe_code) values('2026','CALCUTTA','${outsideId}',1,0,'SUPERSEDED','OUTSIDE_TRANSACTION')`);assert.equal(await done,0,error);
   const outside=JSON.parse(query(`select to_jsonb(e)from production_control.score_derived_delivery_attempts_v1 e where work_identity='${outsideId}'`));assert.equal(outside.safe_code,'OUTSIDE_TRANSACTION');assert.equal(String(outside.handling_activation_revision),query("select activation_revision from production_control.cutover_activation_state where scope_key='BAGGER_INV_PRODUCTION'"));
   assert.equal(query(`select safe_code from production_control.score_derived_delivery_attempts_v1 where work_identity='${job.job_id}'and transition='SUPERSEDED'`),'ISOLATED_DIRECTOR_AUCTION_SUPERSEDED');assert.equal(markerCount(),'0');
  }finally{await done;query('drop trigger p0f_hold_marker on production_control.isolated_financial_audit_context_v1;drop function public.p0f_hold_marker()');}
 });
 await check('current actor revocation denies recovery and mutation without exposing financial receipts',()=>{
  query("update production_control.director_entitlements set status='REVOKED',revoked_at=now()where player_id='P01'");assert.throws(()=>status(firstAuction),/DIRECTOR_AUTHORIZATION_REQUIRED/);assert.throws(()=>execute(firstAuction),/DIRECTOR_AUTHORIZATION_REQUIRED/);query("update production_control.director_entitlements set status='ACTIVE',revoked_at=null where player_id='P01'");
  assert.equal(markerCount(),'0');assert.equal(protectedFacts(),originalFacts);
 });
 await check('concurrent auction commands serialize and transaction markers cannot leak across backends',async()=>{
  const a=auctionCommand('replace-auction',requestValues),b={...a,operation_request_id:randomUUID()};
  const asyncSQL=text=>new Promise(resolve=>{const p=spawn(binaries.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-h',cluster.socket,'-p',String(cluster.port),'-U','postgres','-d',database],{env:{PATH:process.env.PATH,PGOPTIONS:'-c request.jwt.claim.role=service_role'},stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',code=>resolve({code,out,err}));p.stdin.end(text);});
  const first=asyncSQL(`begin;set role service_role;select public.execute_isolated_director_operation_v1(${jsonLiteral(a)});select pg_sleep(0.2);commit;`);await new Promise(r=>setTimeout(r,50));
  const second=asyncSQL(`set role service_role;select public.execute_isolated_director_operation_v1(${jsonLiteral(b)});`);const results=await Promise.all([first,second]);assert.equal(results[0].code,0,results[0].err);assert.notEqual(results[1].code,0);assert.match(results[1].err,/REVISION_CONFLICT/);assert.equal(markerCount(),'0');assert.equal(status(a).outcome,'COMMITTED');assert.equal(status(b).outcome,'UNKNOWN');
 });
 await check('configuration, scoring, Odds and retired Google work remain untouched',()=>{
  assert.equal(protectedFacts(),originalFacts);assert.equal(query('select count(*)from scoring_authority.google_outbox_events'),'0');assert.equal(query('select count(*)from scoring_authority.hole_scores'),'0');assert.equal(markerCount(),'0');
 });
});
