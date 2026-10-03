// Owned local PostgreSQL only; actual service-role RPCs and canonical receipts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {createCertificationFixture,certificationForwardMigrations} from './support/reliability/phase2d-certification-fixture.mjs';
import {destroyIsolatedCluster,jsonLiteral,openSqlSession} from './support/reliability/postgres17.mjs';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';
import {syntheticActor} from './support/reliability/synthetic-tournament.mjs';
import {certificationTransportRegistration,runTransportProof} from './support/reliability/certification-ingress-js-proof.mjs';

const forwardMigrations=[...certificationForwardMigrations,
 'supabase/production_migrations/202609300134_certification_annual_administration_v1.sql',
 'supabase/production_migrations/202609300135_certification_read_contracts_v1.sql',
 'supabase/production_migrations/202609300136_certification_durable_ingress_v1.sql'];

test('R2 durable ingress: real canonical mutation, atomic outcomes, recovery and fencing',async t=>{
 const fixture=await createCertificationFixture({forwardMigrations,registrationFactory:certificationTransportRegistration});
 const {q,rpc,command,model,resource,envelope}=fixture;
 const setup=(name='Synthetic admitted tournament')=>{
  const id=randomUUID(),payload=buildTournamentSetupMutation('update-tournament',{
   expectedRevision:model().revision,operationRequestId:id,name,destination:'Synthetic course',
   startDate:'2026-09-20',endDate:'2026-09-22',timeZone:'America/Chicago',operationalStatus:'UPCOMING'});
  delete payload.operation_request_id;
  return command('DIRECTOR.MUTATE_SETUP',{...payload,action:'update-tournament'},{operation_request_id:id});
 };
 const admit=input=>rpc('admit_certification_operation_v1',input);
 const execute=(input,admission)=>rpc('execute_certification_operation_v1',{...input,
  ingress:{lease_id:admission.lease_id,admission_generation_id:admission.admission_generation_id}});
 const status=input=>rpc('read_certification_ingress_status_v1',{...input,payload:input.payload.match_id?{match_id:input.payload.match_id}:{}});
 const resolve=input=>rpc('resolve_certification_ingress_v1',input);
 const leases=()=>Number(q('select count(*)from production_control.certification_ingress_leases_v1'));
 const generation=()=>JSON.parse(q("select to_jsonb(g)from production_control.certification_ingress_generations_v1 g where state in('OPEN','CLOSING')"));
 const close=(g,revision=g.revision)=>JSON.parse(q(`select production_control.close_certification_ingress_generation_v1('${resource.resource_id}','${g.generation_id}',${revision})`));
 let committedRequest,committedAdmission,committedResult;
 try{
  await t.test('durable admission precedes execution and retry allocates one lease',()=>{
   committedRequest=setup();committedAdmission=admit(committedRequest);
   assert.equal(committedAdmission.state,'ADMITTED');assert.equal(leases(),1);
   assert.deepEqual(admit(committedRequest),committedAdmission);
   assert.equal('authorization'in committedAdmission.context,false);
   assert.equal('actor_auth_user_id'in committedAdmission.context,false);
   assert.equal('actor_player_id'in committedAdmission.context,false);
   assert.equal(q('select count(*)from production_control.tournament_setup_operation_receipts_v1'),'0');
   assert.equal(status(committedRequest).state,'ADMITTED');
   assert.throws(()=>admit({...committedRequest,payload:{...committedRequest.payload,tournament_name:'Conflicting'}}),/IDEMPOTENCY_CONFLICT/);
  });
  await t.test('canonical mutation receipt audit and COMMITTED outcome commit atomically',()=>{
   committedResult=execute(committedRequest,committedAdmission);
   assert.equal(committedResult.ok,true,JSON.stringify(committedResult));
   const recovered=status(committedRequest);assert.equal(recovered.state,'COMMITTED');
   assert.deepEqual(recovered.result,committedResult);
   assert.equal(q(`select count(*)from production_control.tournament_setup_operation_receipts_v1 where operation_request_id='${committedRequest.operation_request_id}'`),'1');
   assert.equal(q(`select count(*)from production_control.operation_audit_events where event_type='CERTIFICATION_INGRESS_TERMINAL'and details->>'operation_request_id'='${committedRequest.operation_request_id}'`),'1');
   assert.deepEqual(execute(committedRequest,committedAdmission),committedResult);
   assert.equal(q('select count(*)from production_control.certification_ingress_execution_v1'),'0');
  });
  await t.test('authorization and target failures allocate no lease',()=>{
   const request=setup(),before=leases();
   for(const authorization of [{},{...request.authorization,role:'SPECTATOR'},
    {...request.authorization,auth_user_id:randomUUID()},
    {tournament_id:'2026',role:'PLAYER',player_id:syntheticActor.playerId,auth_user_id:syntheticActor.authUserId},
    {...request.authorization,tournament_id:'2099'}])assert.throws(()=>admit({...request,authorization}),/AUTHORIZATION|DIRECTOR|IDENTITY|TARGET|ACTOR|ROLE|RUNTIME/);
   assert.throws(()=>admit({...request,expected_context_token:'0'.repeat(64)}),/CONTEXT_STALE/);
   assert.throws(()=>admit({...request,payload:{...request.payload,tournament_id:'2099'}}),/TARGET_DENIED/);
   assert.throws(()=>admit({...request,payload:{...request.payload,action:undefined,player_id:'P01'}}),/PAYLOAD_INVALID/);
   for(const role of ['anon','authenticated'])assert.throws(()=>rpc('admit_certification_operation_v1',request,role),/permission denied/);
   assert.equal(leases(),before);
  });
  await t.test('pre-execution crash remains unresolved; explicit resolution fences delayed execution',()=>{
   const request=setup(),lease=admit(request);
   assert.equal(status(request).state,'ADMITTED');
   const marked=rpc('mark_certification_ingress_unknown_v1',request);assert.equal(marked.state,'UNKNOWN');
   const resolved=resolve(request);assert.equal(resolved.state,'NOT_COMMITTED');
   assert.deepEqual(execute(request,lease),resolved.result);
   assert.equal(q(`select count(*)from production_control.tournament_setup_operation_receipts_v1 where operation_request_id='${request.operation_request_id}'`),'0');
  });
  await t.test('domain failure rollback leaves durable unresolved admission for explicit recovery',()=>{
   const request=setup(),lease=admit(request);
   q(`create function production_control.r2_ingress_fault()returns trigger language plpgsql as $$begin raise exception 'R2_INGRESS_INJECTED_FAILURE';end$$;
    create trigger r2_ingress_fault before insert on production_control.tournament_setup_operation_receipts_v1 for each row execute function production_control.r2_ingress_fault()`);
   const before=q("select row_to_json(t)from scoring_authority.tournaments t where tournament_id='2026'");
   try{assert.throws(()=>execute(request,lease),/R2_INGRESS_INJECTED_FAILURE/);}finally{
    q('drop trigger r2_ingress_fault on production_control.tournament_setup_operation_receipts_v1;drop function production_control.r2_ingress_fault()');}
   assert.equal(q("select row_to_json(t)from scoring_authority.tournaments t where tournament_id='2026'"),before);
   assert.equal(status(request).state,'ADMITTED');
   assert.equal(resolve(request).state,'NOT_COMMITTED');
  });
  await t.test('statement timeout after durable admission cannot report non-commit without explicit fencing',async()=>{
   const request=setup(),lease=admit(request),blocker=openSqlSession(fixture.cluster,fixture.database);
   try{
    await blocker.query('begin;lock table production_control.tournament_setup_operation_receipts_v1 in access exclusive mode');
    assert.throws(()=>q(`set statement_timeout='120ms';set role service_role;select public.execute_certification_operation_v1(${jsonLiteral({...request,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}})})`,'service_role'),/statement timeout/);
   }finally{await blocker.query('rollback');await blocker.close();}
   assert.equal(status(request).state,'ADMITTED');
   assert.equal(resolve(request).state,'NOT_COMMITTED');
  });
  await t.test('concurrent same-ID admission returns one durable lease',async()=>{
   const request=setup(),sessions=[openSqlSession(fixture.cluster,fixture.database),openSqlSession(fixture.cluster,fixture.database)],before=leases();
   try{
    const results=await Promise.all(sessions.map(s=>s.query(`set role service_role;select public.admit_certification_operation_v1(${jsonLiteral(request)})`)));
    assert.deepEqual(JSON.parse(results[0]),JSON.parse(results[1]));assert.equal(leases(),before+1);
   }finally{await Promise.all(sessions.map(s=>s.close()));}
   assert.equal(resolve(request).state,'NOT_COMMITTED');
  });
  await t.test('cross-family match mutation IDs share one admission namespace',async()=>{
   const id=randomUUID(),match='2026-R3-12',authorization={...envelope.authorization,match_id:match};
   const requests=[command('SCORING.SUBMIT_HOLE',{match_id:match,mutation_key:id,hole_number:1},{operation_request_id:id,authorization}),
    command('DIRECTOR.MATCH_CONTROL',{match_id:match,action:'scoring-lock'},{operation_request_id:id,authorization})];
   const sessions=requests.map(()=>openSqlSession(fixture.cluster,fixture.database)),before=leases();
   let outcomes;
   try{
    outcomes=await Promise.all(sessions.map((s,index)=>s.query(`set role service_role;select public.admit_certification_operation_v1(${jsonLiteral(requests[index])})`)
     .then(value=>({index,value:JSON.parse(value)}),error=>({index,error:String(error)}))));
   }finally{await Promise.all(sessions.map(s=>s.close()));}
   const accepted=outcomes.filter(o=>o.value),denied=outcomes.filter(o=>o.error);
   // Preserve the observed pre-correction counterexample without leaving unresolved fixture work.
   await writeFile('/private/tmp/r2-ingress-cross-family-evidence.json',JSON.stringify({environment:'OWNED_LOCAL_POSTGRESQL17',
    attempts:requests.map(r=>r.operation_id),accepted:accepted.map(o=>o.value),denied:denied.map(o=>o.error)},null,2));
   for(const outcome of accepted)assert.equal(resolve(requests[outcome.index]).state,'NOT_COMMITTED');
   assert.equal(accepted.length,1,'One canonical match/mutation key cannot acquire competing operation-family leases');
   assert.equal(denied.length,1);assert.match(denied[0].error,/CERTIFICATION_INGRESS_IDEMPOTENCY_CONFLICT/);
   assert.equal(leases(),before+1);
   const winner=accepted[0].index,loser=1-winner;
   assert.equal(status(requests[loser]).state,'UNKNOWN');assert.equal(status(requests[loser]).lease_id,null);
   for(const operation of ['SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH','DIRECTOR.MATCH_CONTROL']){
    if(operation===requests[winner].operation_id)continue;
    const request=command(operation,{match_id:match,mutation_key:id,action:operation==='DIRECTOR.MATCH_CONTROL'?'scoring-lock':undefined},{operation_request_id:id,authorization});
    assert.throws(()=>admit(request),/CERTIFICATION_INGRESS_IDEMPOTENCY_CONFLICT/);
    assert.equal(status(request).state,'UNKNOWN');
   }
   const other={...requests[winner],operation_id:'SCORING.SUBMIT_HOLE',authorization:{tournament_id:'2026',role:'PLAYER',player_id:syntheticActor.playerId,auth_user_id:syntheticActor.authUserId,match_id:match}};
   assert.deepEqual({...status(other),operation_request_id:'redacted'},
    {...status({...other,operation_request_id:'r2-absent-family-key'}),operation_request_id:'redacted'});
   assert.equal(q(`select count(*)from scoring_authority.score_mutations where match_id='${match}'and mutation_key='${id}'`),'0');
  });
  await t.test('resolve waits for in-flight execution and observes the committed canonical outcome',async()=>{
   const request=setup(),lease=admit(request),writer=openSqlSession(fixture.cluster,fixture.database),resolver=openSqlSession(fixture.cluster,fixture.database);
   try{
    const result=JSON.parse(await writer.query(`begin;set local role service_role;select public.execute_certification_operation_v1(${jsonLiteral({...request,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}})})`));
    assert.equal(result.ok,true);
    let finished=false;const pending=resolver.query(`set role service_role;select public.resolve_certification_ingress_v1(${jsonLiteral(request)})`).then(v=>{finished=true;return v;});
    await new Promise(r=>setTimeout(r,70));assert.equal(finished,false);
    assert.equal(status(request).state,'ADMITTED');
    await writer.query('commit');const outcome=JSON.parse(await pending);assert.equal(outcome.state,'COMMITTED');assert.deepEqual(outcome.result,result);
   }finally{await writer.close();await resolver.close();}
  });
  await t.test('participant recovery survives score-permission revocation and hides other-origin operation existence',()=>{
   const match='2026-R3-12',id='r2-participant-admission';
   q(`begin;set local request.jwt.claim.role='service_role';select production_control.push_certification_context_v1(${jsonLiteral(envelope)},'DIRECTOR',false);
    update scoring_authority.scoring_permissions set can_score=true,revoked_at=null where match_id='${match}'and player_id='${syntheticActor.playerId}';
    select production_control.pop_certification_context_v1();commit`);
   const authorization={tournament_id:'2026',role:'PLAYER',player_id:syntheticActor.playerId,auth_user_id:syntheticActor.authUserId,match_id:match,permission_revision:1};
   const request=command('SCORING.SUBMIT_HOLE',{match_id:match,mutation_key:id,hole_number:1},{operation_request_id:id,authorization});
   admit(request);
   q(`begin;set local request.jwt.claim.role='service_role';select production_control.push_certification_context_v1(${jsonLiteral(envelope)},'DIRECTOR',false);
    update scoring_authority.scoring_permissions set can_score=false,revoked_at=now()where match_id='${match}'and player_id='${syntheticActor.playerId}';
    select production_control.pop_certification_context_v1();commit`);
   const reduced={...request,authorization:{...authorization,permission_revision:undefined,passport_verified:undefined}};
   assert.equal(status(reduced).state,'ADMITTED');
   const other={...reduced,authorization:{...envelope.authorization,match_id:match}};
   const absent=status({...other,operation_request_id:'r2-absent'}),hidden=status(other);
   assert.deepEqual({...hidden,operation_request_id:'redacted'},{...absent,operation_request_id:'redacted'});assert.equal(hidden.lease_id,null);
   assert.equal(resolve(reduced).state,'NOT_COMMITTED');
  });
  await t.test('close captures nonempty generation, unresolved blocks drain, resolve then close is immutable',()=>{
   const request=setup(),lease=admit(request),g=generation();
   const closing=close(g);assert.equal(closing.state,'CLOSING');assert.equal(closing.drained,false);
   assert.ok(closing.high_watermark>=lease.admission_sequence);assert.ok(closing.committed_count>=1);
   assert.throws(()=>execute(request,lease),/EXECUTION_FENCED/);
   assert.throws(()=>admit(setup()),/AUTHORITY_UNAVAILABLE/);
   assert.equal(resolve(request).state,'NOT_COMMITTED');
   const closed=close({...g,revision:closing.generation_revision});assert.equal(closed.state,'CLOSED');assert.equal(closed.drained,true);
   assert.equal(closed.post_close_admissions,0);assert.equal(closed.post_close_writes,0);
   assert.deepEqual(close({...g,revision:closed.generation_revision}),closed);
   assert.equal(status(committedRequest).state,'COMMITTED');
   assert.equal(admit({...committedRequest,replay_only:true,expected_context_token:undefined}).state,'COMMITTED');
   assert.throws(()=>q(`update production_control.certification_ingress_generations_v1 set state='OPEN'where generation_id='${g.generation_id}'`),/GENERATION_IMMUTABLE/);
   const next=JSON.parse(q(`select production_control.reopen_certification_ingress_generation_v1('${resource.resource_id}','${g.generation_id}',${closed.generation_revision})`));
   assert.notEqual(next.generation_id,g.generation_id);assert.equal(next.predecessor_generation_id,g.generation_id);
   assert.deepEqual(JSON.parse(q(`select production_control.reopen_certification_ingress_generation_v1('${resource.resource_id}','${g.generation_id}',${closed.generation_revision})`)),next);
   assert.throws(()=>q(`select production_control.reopen_certification_ingress_generation_v1('${resource.resource_id}','${g.generation_id}',${closed.generation_revision-1})`),/GENERATION_STALE/);
   assert.throws(()=>admit({...setup(),expected_context_token:committedRequest.expected_context_token}),/CONTEXT_STALE/);
  });
  await t.test('ACLs, RLS, owners, search_path, private cores and terminal immutability',()=>{
   const bad=q(`select count(*)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='production_control'
    and(p.proname like'%certification_ingress%'or p.proname='execute_certification_operation_core_v1')
    and(has_function_privilege('anon',p.oid,'EXECUTE')or has_function_privilege('authenticated',p.oid,'EXECUTE')or has_function_privilege('service_role',p.oid,'EXECUTE')
    or pg_get_userbyid(p.proowner)<>'postgres'or p.proconfig is distinct from array['search_path=pg_catalog'])`);
   assert.equal(bad,'0');
   assert.equal(q("select count(*)from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='production_control'and c.relname like'certification_ingress_%'and c.relkind='r'and not c.relrowsecurity"),'0');
   assert.throws(()=>q(`update production_control.certification_ingress_leases_v1 set state='UNKNOWN',result=null,resolved_at=null,committed_generation_revision=null where lease_id='${committedAdmission.lease_id}'`),/OUTCOME_IMMUTABLE/);
   assert.equal(q('select count(*)from production_control.resource_scope'),'0');
   assert.equal(q('select count(*)from production_control.cutover_activation_state'),'0');
  });
  await runTransportProof({t,fixture,setup});
  const catalog=JSON.parse(q("select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'signature',p.oid::regprocedure::text,'body',p.prosrc,'definition',pg_get_functiondef(p.oid),'sha256',encode(extensions.digest(p.prosrc,'sha256'),'hex'))),'[]')from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','production_control','scoring_authority','participant_identity')and p.prokind='f'"));
  await writeFile('/private/tmp/r2-ingress-installed-catalog.json',JSON.stringify(catalog,null,2));
  t.diagnostic(JSON.stringify({environment:'OWNED_LOCAL_POSTGRESQL17',forwardMigrations,leases:leases(),googleCalls:0,hostedAccess:false,finalBaselineEmitted:false}));
 }finally{await destroyIsolatedCluster(fixture.cluster);}
});
