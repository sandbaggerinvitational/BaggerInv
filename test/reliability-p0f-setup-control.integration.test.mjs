// POSTGRESQL / SECURITY / INTEGRATION / FAILURE INJECTION. Socket-only synthetic DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createP0FSetupFixture} from './support/reliability/p0f-setup-fixture.mjs';
import {destroyIsolatedCluster,jsonLiteral,sqlFile,repositoryRoot} from './support/reliability/postgres17.mjs';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';

const migration='supabase/production_migrations/202609300130_isolated_setup_control_cores_v1.sql';
const normalizeBody=s=>s.replaceAll(/--[^\n]*/g,'').replaceAll(/\s+/g,' ').trim();
const moveMap={mutate_production_match_control:'canonical_match_control_v1',read_production_tournament_setup_v1:'canonical_tournament_setup_read_v1'};

test('P0-F approved setup/control extraction preserves admission, domain rules, bounded recovery and canonical capabilities',async t=>{
 const f=await createP0FSetupFixture();t.after(()=>destroyIsolatedCluster(f.cluster));
 const q=f.query;
 const setupReceiptCount=()=>q('select count(*) from production_control.tournament_setup_operation_receipts_v1');
 const auditCount=()=>q('select count(*) from production_control.tournament_setup_audit_events_v1');
 const scoreCount=()=>q('select count(*) from scoring_authority.hole_scores');
 const good=result=>{assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.receipt.ok,true,JSON.stringify(result));return result.receipt;};
 const status=input=>f.call('read_isolated_director_operation_context_v1',{...input,mode:'status'}).data;
 const financialBefore=q(`select production_control.tournament_setup_hash_v1(jsonb_build_object(
  'auction',(select jsonb_agg(to_jsonb(a)order by tournament_id,auction_revision)from scoring_authority.calcutta_v1_auction_fact_revisions a),
  'skins',(select jsonb_agg(to_jsonb(n)order by tournament_id,round_number,revision)from production_control.net_skins_entry_revisions_v1 n)))`);

 await t.test('installed catalog: OID/owner/domain identity, least privilege, exact direct-call denials',()=>{
  assert.equal(f.before.dependencies.filter(d=>d.inbound).length,0);
  assert.equal(f.after.dependencies.filter(d=>d.inbound).length,0);
  for(const prior of f.before.functions){
   const target=f.after.functions.find(p=>p.name===(moveMap[prior.name]||prior.name));assert.ok(target,prior.name);
   assert.equal(target.owner,prior.owner);assert.equal(target.definer,prior.definer);assert.equal(target.volatility,prior.volatility);
   if(prior.name==='mutate_production_match_control') {
    assert.notEqual(target.oid,prior.oid,'two-argument private core has a new OID');
    assert.equal(f.after.functions.find(p=>p.name===prior.name).oid,prior.oid,'nested round callers retain the original admitted public OID');
   } else assert.equal(target.oid,prior.oid,'move/rename or CREATE OR REPLACE retains core OID');
   if(prior.name.startsWith('mutate_production_')&&prior.name!=='mutate_production_match_control')continue;
   assert.deepEqual(target.searchPath,prior.searchPath);
   const preserved=prior.body.replaceAll('perform production_control.assert_tournament_setup_runtime_v1(input);','')
    .replace('perform production_control.assert_production_scoring_runtime(input);','')
    .replace('perform production_control.assert_production_scoring_actor(input, true);','');
   const afterBody=target.body.replace('  rechecked_context jsonb;','')
    .replace(/    if isolated_input is null then\n[\s\S]*?      end if;\n    end if;/,
     '    perform production_control.assert_production_scoring_runtime(input);\n    perform production_control.assert_production_scoring_actor(input, true);');
   assert.equal(normalizeBody(afterBody),normalizeBody(preserved),'domain byte-equivalence except explicit admission placement');
  }
  for(const func of f.after.functions){
   assert.equal(func.anon,false);assert.equal(func.authenticated,false);
   assert.equal(func.serviceRole,func.schema==='public',func.signature);
   if(func.schema==='public'){assert.deepEqual(func.searchPath,['search_path=pg_catalog']);continue;}
   for(const role of ['anon','authenticated','service_role']){
    const args=func.name==='isolated_director_setup_operation_v1'?"'{}','{}',false":func.name==='mutate_late_r3_dispatch_v1'?"'{}',false":func.name==='canonical_match_control_v1'?"'{}',null":"'{}'";
    assert.throws(()=>q(`set role ${role};select production_control.${func.name}(${args})`),/permission denied/);
   }
  }
  assert.throws(()=>sqlFile(f.cluster,f.database,path.join(repositoryRoot,migration),{role:''}),/ISOLATED_SETUP_SOURCE_BASELINE_MISMATCH/,'repeat install fails closed');
 });

 await t.test('protected public and nested round entry points still deny isolated authority; new gateway denies stale/unprivileged scope',()=>{
  const before=scoreCount();
  const input={...f.envelope,environment:'ISOLATED',tournament_id:'2026',operation:'SCORING_LOCK',match_id:'2026-R1-1',mutation_key:randomUUID()};
  for(const name of ['read_production_tournament_setup_v1','mutate_production_tournament_setup_v1','mutate_production_match_control','mutate_production_round_scoring_v1'])
   assert.throws(()=>f.call(name,input),/PRODUCTION|SCOPE|ANNUAL|CAPABILITY/);
  assert.equal(f.call('mutate_production_round_pairings_v1',input).ok,false);
  for(const role of ['anon','authenticated'])assert.throws(()=>q(`set role ${role};select public.execute_isolated_director_operation_v1(${jsonLiteral(f.command('MATCH_CONTROL','scoring-lock',{}))})`),/permission denied/);
  assert.throws(()=>f.read('TOURNAMENT_SETUP',{authorization:{...f.envelope.authorization,role:'PLAYER'}}),/ISOLATED_DIRECTOR_CONTEXT_REQUIRED/);
  assert.throws(()=>f.read('TOURNAMENT_SETUP',{authorization:{...f.envelope.authorization,player_id:'P02'}}),/PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED/);
  assert.throws(()=>f.read('TOURNAMENT_SETUP',{resource:{...f.envelope.resource,project_ref:'ymqhhtxaywtqllynrmxe'}}),/ISOLATED_DIRECTOR_CONTEXT_REQUIRED/);
  assert.throws(()=>f.execute(f.command('MATCH_CONTROL','scoring-lock',{},randomUUID(),'0'.repeat(64))),/ISOLATED_DIRECTOR_CONTEXT_STALE/);
  assert.equal(scoreCount(),before);
 });

 let courseCommand;
 await t.test('canonical course/tee setup and same-request replay preserve frozen handicap authority',()=>{
  const model=f.model(),course=model.courses.find(c=>c.roundNumber===1);assert.ok(course);
  const id=randomUUID();
  const payload=buildTournamentSetupMutation('upsert-course',{expectedRevision:model.revision,operationRequestId:id,
   roundNumber:1,courseId:course.courseId,courseName:'Synthetic revised course',city:'Fixture city',state:'Fixture state',
   tee:course.tee,rating:72.4,slope:121,par:72,holes:Array.from({length:18},(_,i)=>({number:i+1,par:4,strokeIndex:i+1,yardage:400}))});
  courseCommand=f.command('TOURNAMENT_SETUP','upsert-course',payload,id);
  const before=Number(setupReceiptCount());good(f.execute(courseCommand));
  assert.equal(Number(setupReceiptCount()),before+1);assert.equal(good(f.execute(courseCommand)).idempotent,true);
  assert.equal(Number(setupReceiptCount()),before+1);
  const conflict=f.execute({...courseCommand,payload:{...payload,course_name:'Different'}});assert.equal(conflict.ok,false);assert.equal(conflict.receipt.code,'TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT');
  const updated=f.model();assert.equal(updated.approvedHandicapRevisionId,model.approvedHandicapRevisionId);
  assert.equal(Number(updated.courses.find(c=>c.roundNumber===1).rating),72.4);
  const stale=f.setup('upsert-match',{expectedRevision:model.revision,matchId:'2026-R1-1',roundNumber:1,matchNumber:1,courseId:course.courseId,tee:course.tee,teeTime:'08:00'});
  assert.equal(stale.receipt.code,'TOURNAMENT_SETUP_REVISION_STALE');
  for(const match of updated.matches.filter(m=>m.roundNumber===1))good(f.setup('upsert-match',{matchId:match.matchId,roundNumber:1,matchNumber:match.matchNumber,courseId:course.courseId,tee:course.tee,teeTime:'08:00'}));
 });

 await t.test('atomic full-round participant exchange uses current approved handicap and preserves complete coverage',()=>{
  const before=f.model(),matches=structuredClone(before.matches.filter(m=>m.roundNumber===1));
  const one=matches[0].participants[0].playerId,two=matches[1].participants[0].playerId;
  matches[0].participants[0].playerId=two;matches[1].participants[0].playerId=one;
  const result=good(f.setup('replace-round-pairings',{roundNumber:1,expectedHandicapRevisionId:before.approvedHandicapRevisionId,matches}));
  assert.ok(result.revision>before.revision);
  const current=f.model(),round=current.matches.filter(m=>m.roundNumber===1);
  assert.equal(round[0].participants[0].playerId,two);assert.equal(round[1].participants[0].playerId,one);
  assert.equal(new Set(round.flatMap(m=>m.participants.map(p=>p.playerId))).size,24);
  const invalid=structuredClone(round);invalid[1].participants[0].playerId=invalid[0].participants[0].playerId;
  const revision=current.revision,receipts=setupReceiptCount();
  const denied=f.setup('replace-round-pairings',{roundNumber:1,expectedHandicapRevisionId:current.approvedHandicapRevisionId,matches:invalid});
  assert.equal(denied.ok,false);assert.equal(f.model().revision,revision);assert.equal(setupReceiptCount(),receipts);
 });

 await t.test('prepared context gates Mark Live; lock/unlock and access authority remain distinct and receipt-backed',()=>{
  const matchId='2026-R1-1';const denied=f.control('mark-live',matchId);assert.equal(denied.ok,false,'changed setup must not become Live before Prepare');
  const prepared=good(f.setup('prepare-scoring-context',{matchId}));assert.equal(prepared.snapshotPrepared,true);
  const model=f.model(),match=model.matches.find(m=>m.matchId===matchId);
  assert.equal(match.snapshot.handicapRevisionId,model.approvedHandicapRevisionId);
  const commandFor=action=>{const m=f.read('MATCH_CONTROL').data.data.matches.find(m=>m.matchId===matchId);return f.command('MATCH_CONTROL',action,{match_id:matchId,expected_match_revision:m.matchRevision,expected_permission_revision:m.permissionRevision});};
  const live=commandFor('mark-live');good(f.execute(live));assert.equal(good(f.execute(live)).idempotent,true);
  assert.equal(status(live).outcome,'COMMITTED');
  assert.equal(q(`select status from scoring_authority.matches where match_id='${matchId}'`),'LIVE');
  assert.equal(q(`select count(*)from scoring_authority.scoring_permissions where match_id='${matchId}' and can_score`),'0','Mark Live does not activate access');
  good(f.control('access-activate',matchId));good(f.control('scoring-lock',matchId));
  assert.equal(q(`select scoring_locked from scoring_authority.matches where match_id='${matchId}'`),'t');
  assert.equal(q(`select count(*)from scoring_authority.scoring_permissions where match_id='${matchId}' and can_score`),'0','existing Lock contract revokes access');
  good(f.control('scoring-unlock',matchId));
  assert.equal(q(`select count(*)from scoring_authority.scoring_permissions where match_id='${matchId}' and can_score`),'4','existing Unlock contract activates access');
  good(f.control('access-revoke',matchId));
  assert.equal(q(`select count(*)from scoring_authority.scoring_permissions where match_id='${matchId}' and can_score`),'0');
  const stale={...live,operation_request_id:randomUUID()};const conflict=f.execute(stale);assert.equal(conflict.ok,false);assert.equal(conflict.receipt.code,'MATCH_REVISION_CONFLICT');
 });

 await t.test('lost response resolves exact canonical receipt after context change without replay or new operation',()=>{
  assert.equal(status(courseCommand).outcome,'COMMITTED');
  const receipts=setupReceiptCount(),audits=auditCount();
  q('update production_control.isolated_director_context_v1 set activation_revision=activation_revision+1');
  assert.throws(()=>f.execute(courseCommand),/ISOLATED_DIRECTOR_CONTEXT_STALE/);
  assert.equal(status(courseCommand).outcome,'COMMITTED');
  assert.throws(()=>status({...courseCommand,payload:{...courseCommand.payload,course_name:'Conflicting retry'}}),/TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT/);
  assert.equal(status({...courseCommand,operation_request_id:randomUUID()}).outcome,'UNKNOWN');
  assert.equal(setupReceiptCount(),receipts);assert.equal(auditCount(),audits);
 });

 await t.test('injected required audit failure rolls back setup authority and receipt atomically',()=>{
  const before=f.model(),revision=before.revision,receipts=setupReceiptCount(),audits=auditCount();
  q(`create function production_control.p0f_test_audit_failure()returns trigger language plpgsql as $$begin raise exception 'P0F_INJECTED_AUDIT_FAILURE';end$$;
   create trigger p0f_test_audit_failure before insert on production_control.tournament_setup_audit_events_v1 for each row execute function production_control.p0f_test_audit_failure()`);
  try {assert.throws(()=>f.setup('update-tournament',{name:'Must roll back',destination:'Synthetic local fixture',startDate:'2026-10-01',endDate:'2026-10-03',timeZone:'America/Chicago',operationalStatus:'UPCOMING'}),/P0F_INJECTED_AUDIT_FAILURE/);}
  finally{q('drop trigger p0f_test_audit_failure on production_control.tournament_setup_audit_events_v1;drop function production_control.p0f_test_audit_failure()');}
  assert.equal(f.model().revision,revision);assert.equal(setupReceiptCount(),receipts);assert.equal(auditCount(),audits);
  assert.deepEqual(f.model().tournament,before.tournament);
 });

 await t.test('Google remains absent; financial facts and canonical scores remain unchanged',()=>{
  assert.equal(q('select count(*)from scoring_authority.google_outbox_events'),'0');
  assert.equal(scoreCount(),'0');
  assert.equal(q(`select production_control.tournament_setup_hash_v1(jsonb_build_object(
   'auction',(select jsonb_agg(to_jsonb(a)order by tournament_id,auction_revision)from scoring_authority.calcutta_v1_auction_fact_revisions a),
   'skins',(select jsonb_agg(to_jsonb(n)order by tournament_id,round_number,revision)from production_control.net_skins_entry_revisions_v1 n)))`),financialBefore);
 });
 if(process.env.BAGGER_P0F_SETUP_EVIDENCE){assert.ok(path.resolve(process.env.BAGGER_P0F_SETUP_EVIDENCE).startsWith('/private/tmp/')||path.resolve(process.env.BAGGER_P0F_SETUP_EVIDENCE).startsWith('/tmp/'));
  await writeFile(process.env.BAGGER_P0F_SETUP_EVIDENCE,JSON.stringify({environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',before:f.before,after:f.after,setupReceipts:Number(setupReceiptCount()),auditEvents:Number(auditCount()),googleJobs:0,limitations:['No hosted admission or Production proof','Auth middleware is separately tested; database actor verifier is real']},null,2)+'\n');}
});

test('P0-F migration refuses an unreviewed OID-bound caller before moving any authority function',async t=>{
 const f=await createP0FSetupFixture({install130:false});t.after(()=>destroyIsolatedCluster(f.cluster));
 const before=f.query("select 'public.mutate_production_match_control(jsonb)'::regprocedure::oid");
 f.query(`create function production_control.p0f_bound_caller(input jsonb)returns jsonb language sql begin atomic select public.mutate_production_match_control(input);end;
  revoke all on function production_control.p0f_bound_caller(jsonb) from public,anon,authenticated,service_role;`);
 assert.throws(()=>sqlFile(f.cluster,f.database,path.join(repositoryRoot,migration),{role:''}),/ISOLATED_SETUP_UNREVIEWED_OID_DEPENDENCY/);
 assert.equal(f.query("select 'public.mutate_production_match_control(jsonb)'::regprocedure::oid"),before);
 assert.equal(f.query("select to_regprocedure('production_control.canonical_match_control_v1(jsonb,jsonb)') is null"),'t');
 f.query('drop function production_control.p0f_bound_caller(jsonb)');
 f.query('create role p0f_unreviewed nologin;grant execute on function production_control.mutate_setup_before_late_r3_v1(jsonb) to p0f_unreviewed');
 assert.throws(()=>sqlFile(f.cluster,f.database,path.join(repositoryRoot,migration),{role:''}),/ISOLATED_SETUP_PRIVILEGE_BASELINE_MISMATCH/);
 f.query('revoke execute on function production_control.mutate_setup_before_late_r3_v1(jsonb) from p0f_unreviewed');
 f.query('alter function production_control.mutate_setup_before_late_r3_v1(jsonb) set search_path=pg_catalog');
 assert.throws(()=>sqlFile(f.cluster,f.database,path.join(repositoryRoot,migration),{role:''}),/ISOLATED_SETUP_PRIVILEGE_BASELINE_MISMATCH/);
 f.query('alter function production_control.mutate_setup_before_late_r3_v1(jsonb) set search_path=pg_catalog,production_control,scoring_authority');
 f.query('alter default privileges grant execute on functions to p0f_unreviewed');
 assert.throws(()=>sqlFile(f.cluster,f.database,path.join(repositoryRoot,migration),{role:''}),/ISOLATED_SETUP_POST_INSTALL_PRIVILEGE_MISMATCH/);
 assert.equal(f.query("select 'public.mutate_production_match_control(jsonb)'::regprocedure::oid"),before,'rejected default grant rolls back every extraction');
 f.query('alter default privileges revoke execute on functions from p0f_unreviewed');
 const deniedPrepared=`do $cached$begin
   begin execute 'execute p0f_cached_setup(''{}''::jsonb)';
    raise exception 'P0F_PREPARED_READER_ADMISSION_BYPASS';
   exception when others then
    if sqlerrm='P0F_PREPARED_READER_ADMISSION_BYPASS' or
       (sqlerrm not like 'PRODUCTION_%' and sqlerrm not like '%permission denied%') then raise;end if;
   end;
  end$cached$;`;
 const source=await readFile(path.join(repositoryRoot,migration),'utf8');
 // One physical session prepares and plans the service-role reader before the
 // OID move, then executes it after install. Stored pg_depend alone is not proof
 // that an already prepared call cannot reach the private admission-free core.
 f.query(`set role service_role;
  prepare p0f_cached_setup(jsonb) as select public.read_production_tournament_setup_v1($1);
  ${deniedPrepared}
  reset role;
  ${source}
  set role service_role;
  ${deniedPrepared}
  deallocate p0f_cached_setup;`);
 assert.equal(f.query("select 'public.mutate_production_match_control(jsonb)'::regprocedure::oid"),before);
});
