// POSTGRESQL / API / INTEGRATION / FAILURE_INJECTION. Owned socket-only PG17.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {createDatabase,createIsolatedCluster,destroyIsolatedCluster,sql,sqlFile,jsonLiteral,repositoryRoot} from './support/reliability/postgres17.mjs';
import {installSupabaseCompatibility} from './support/reliability/release139-schema.mjs';
import {seedPreviewDirectorFixture} from './support/reliability/phase2c1-closure-preview-fixture.mjs';
import {readIsolatedCanonicalDirectorOverview,mutateIsolatedCanonicalDirectorMatch} from '../lib/canonical-director-overview.js';
import {loadCanonicalDirectorOverview,submitCanonicalDirectorOperation} from '../lib/canonical-director-client.js';
const migrations=['202608120001_preview_scoring_authority_schema.sql','202608120002_preview_scoring_authority_transactions.sql','202608120003_preview_scoring_authority_authorization_guards.sql','202608120004_preview_scoring_authority_course_handicap_precision.sql','202608120005_preview_scoring_authority_playing_handicap_precision.sql','202608120006_preview_scoring_authority_import_delete_order.sql','202608120007_preview_scoring_authority_cutover_ingress.sql','202608120008_preview_scoring_client_diagnostics.sql','202608120009_preview_scoring_authority_no_change_guard.sql','202608120010_preview_scoring_authority_finalization_permissions.sql','202608120012_preview_participant_identity_foundation.sql','202608120017_preview_game_center_reads.sql','202608120024_preview_participant_home_reads.sql','202608120025_preview_tournament_live_reads.sql','202608120026_preview_tournament_published_context.sql','202608130001_preview_round_scorecards_archive.sql','202608290001_preview_mobile_scoring_authority_recovery.sql'];
const candidate='202609290002_preview_google_runtime_retirement_v1.sql';
const env={VERCEL_ENV:'preview',SUPABASE_SCORING_MIRROR_URL:'https://idgigvjjqkfbqjeredpb.supabase.co',SUPABASE_SCORING_MIRROR_SECRET_KEY:'synthetic-server-key-only',SCORING_AUTHORITY:'supabase'};
const authorization={status:'active',source:'entitlement',identity:{authUserId:'11111111-1111-4111-8111-111111111111',tournamentId:'2026',actor:{id:'P1',role:'DIRECTOR'}}};

test('INTEGRATION Preview Director canonical route and retained lifecycle execute SQL without Google',async t=>{
 const cluster=await createIsolatedCluster(); const database='closure_preview'; const originalFetch=globalThis.fetch;
 const rpc=(name,input)=>JSON.parse(sql(cluster,database,`select public.${name}(${jsonLiteral(input)})`));
 const file=name=>sqlFile(cluster,database,path.join(repositoryRoot,'supabase/migrations',name),{role:''});
 try{
  createDatabase(cluster,database);installSupabaseCompatibility(cluster,database);
  sql(cluster,database,'create schema extensions;create extension pgcrypto with schema extensions',{role:''});
  for(const name of migrations)file(name);
  seedPreviewDirectorFixture(cluster,database);
  sql(cluster,database,`insert into scoring_authority.game_center_presentations
    (match_id,tournament_id,display_match_number,match_sort_order,source_workbook_id,source_payload_hash,imported_by)
    select match_id,tournament_id,row_number() over(order by match_id)::text,row_number() over(order by match_id),
      'synthetic-preview-provenance',repeat('a',64),'synthetic fixture' from scoring_authority.matches`);
  const oldInput={match_id:'M2',hole_number:1,mutation_key:'historical-provider-receipt',expected_match_revision:10,expected_hole_revision:0,team_1_gross_scores:[4,5],team_2_gross_scores:[5,6],authorization:{passport_verified:true,role:'PLAYER',player_id:'P1',match_id:'M2',tournament_id:'2026',permission_revision:7}};
  assert.equal(rpc('submit_hole_score_authoritative',oldInput).google_outbox_created,true);
  const oldJobs=sql(cluster,database,"select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from scoring_authority.google_outbox_events e");
  file(candidate);
  const rpcCalls=[];
  globalThis.fetch=async(value,init)=>{
    const url=new URL(value);assert.equal(url.origin,env.SUPABASE_SCORING_MIRROR_URL,'all RPC transport intercepted; no remote socket');
    const name=url.pathname.split('/').at(-1);assert.match(name,/^[a-z_0-9]+$/);rpcCalls.push(name);
    const body=JSON.parse(init.body||'{}');
    const result=name==='read_tournament_live_view'?JSON.parse(sql(cluster,database,`select public.read_tournament_live_view(${jsonLiteral(body.target_tournament_id)}#>>'{}')`)):
      name==='read_preview_director_capabilities_v1'?JSON.parse(sql(cluster,database,'select public.read_preview_director_capabilities_v1()')):rpc(name,body.input);
    return Response.json(result);
  };
  await t.test('migration preserves legacy job evidence and denies service-role replay',()=>{
    assert.equal(sql(cluster,database,"select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from scoring_authority.google_outbox_events e"),oldJobs);
    assert.equal(sql(cluster,database,"select has_function_privilege('service_role','public.claim_preview_google_outbox(text,integer)','execute')"),'f');
    assert.equal(sql(cluster,database,"select has_function_privilege('authenticated','public.read_preview_director_operation_v1(jsonb)','execute')"),'f');
  });
  await t.test('real current tournament SQL feeds shipping Director projection with Google configuration absent',async()=>{
    const data=await readIsolatedCanonicalDirectorOverview({authorization,env});assert.equal(data.tournament.id,'2026');assert.equal(data.rounds[0].matches.length,3);assert.equal(data.capabilities.matchControls,true);assert.equal(data.googleRequests,0);
    assert.deepEqual(Object.keys(env).filter(k=>/GOOGLE|SHEET|DRIVE/.test(k)),[]);
  });
  await t.test('new Preview score write creates canonical receipt but no Google job',()=>{
    const result=rpc('submit_hole_score_authoritative',{...oldInput,match_id:'M1',mutation_key:'canonical-after-retirement',authorization:{...oldInput.authorization,match_id:'M1'}});
    assert.equal(result.ok,true);assert.equal(result.google_outbox_created,false);
    assert.equal(sql(cluster,database,'select count(*) from scoring_authority.google_outbox_events'),'1');
  });
  const finalize={action:'finalize',matchId:'MF',operationRequestId:'director-finalize-1',expectedMatchRevision:18,expectedPermissionRevision:7};
  await t.test('Finalize uses real canonical SQL and immutable snapshot; same-ID retry recovers receipt after permission revocation',async()=>{
    const result=await mutateIsolatedCanonicalDirectorMatch({authorization,input:finalize,env});
    assert.equal(result.canonical.status,'FINAL');assert.equal(result.receipt.google_outbox_created,false);
    const replay=await mutateIsolatedCanonicalDirectorMatch({authorization,input:finalize,env});assert.equal(replay.receipt.idempotent,true);
    assert.equal(sql(cluster,database,"select count(*) from scoring_authority.finalized_scorecard_snapshots where state='CURRENT'"),'1');
    assert.equal(sql(cluster,database,'select count(*) from scoring_authority.scorecard_archive_jobs'),'0');
    assert.equal(sql(cluster,database,'select count(*) from scoring_authority.scorecard_archive_checkpoints'),'0');
  });
  await t.test('Reopen invalidates canonical snapshot and retains audit without archive delivery',async()=>{
    const result=await mutateIsolatedCanonicalDirectorMatch({authorization,input:{action:'reopen',matchId:'MF',operationRequestId:'director-reopen-1',expectedMatchRevision:19,expectedPermissionRevision:8},env});
    assert.equal(result.canonical.status,'LIVE');assert.equal(result.receipt.google_outbox_created,false);
    assert.equal(sql(cluster,database,"select count(*) from scoring_authority.finalized_scorecard_snapshots where state='INVALIDATED'"),'1');
    assert.equal(sql(cluster,database,"select count(*) from scoring_authority.audit_events where action='FINALIZED_SCORECARD_SNAPSHOT_INVALIDATED'"),'1');
  });
  await t.test('receipt lookup rejects same identity with different operation or actor',()=>{
    const base={match_id:'MF',mutation_key:'director-finalize-1',action:'finalize',authorization:{...oldInput.authorization,role:'DIRECTOR',match_id:'MF'}};
    assert.equal(rpc('read_preview_director_operation_v1',{...base,action:'reopen'}).code,'IDEMPOTENCY_CONFLICT');
    assert.equal(rpc('read_preview_director_operation_v1',{...base,authorization:{...base.authorization,player_id:'P3'}}).code,'IDEMPOTENCY_CONFLICT');
  });
  await t.test('required audit failure rolls back Finalize and snapshot completely',async()=>{
    sql(cluster,database,"create function scoring_authority.fail_closure_audit() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_AUDIT_FAILURE';end$$;create trigger closure_audit_failure before insert on scoring_authority.audit_events for each row execute function scoring_authority.fail_closure_audit()",{role:''});
    await assert.rejects(mutateIsolatedCanonicalDirectorMatch({authorization,input:{...finalize,operationRequestId:'must-rollback',expectedMatchRevision:20,expectedPermissionRevision:9},env}),/SYNTHETIC_AUDIT_FAILURE/);
    assert.equal(sql(cluster,database,"select status||':'||match_revision::text from scoring_authority.matches where match_id='MF'"),'LIVE:20');
    assert.equal(sql(cluster,database,"select count(*) from scoring_authority.score_mutations where mutation_key='must-rollback'"),'0');
    assert.equal(sql(cluster,database,"select count(*) from scoring_authority.finalized_scorecard_snapshots where state='CURRENT'"),'0');
    sql(cluster,database,'drop trigger closure_audit_failure on scoring_authority.audit_events;drop function scoring_authority.fail_closure_audit()',{role:''});
  });
  await t.test('actual shipping Director client and handler round-trip to installed SQL',async()=>{
    globalThis.__closureDirector={NextResponse:Response,withOperationalRoute:(_,fn)=>fn,recordOperationalError:()=>{},authorizePreviewDirector:async()=>authorization,
      readIsolatedCanonicalDirectorOverview:({authorization:a})=>readIsolatedCanonicalDirectorOverview({authorization:a,env}),
      mutateIsolatedCanonicalDirectorMatch:({authorization:a,input})=>mutateIsolatedCanonicalDirectorMatch({authorization:a,input,env})};
    const source=(await readFile(path.join(repositoryRoot,'app/api/director/canonical-overview/route.js'),'utf8')).replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];\n/gm,(_,b)=>`const {${b.replace(/\bas\b/g,':')}}=globalThis.__closureDirector;\n`);
    const route=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);delete globalThis.__closureDirector;
    const fetchImpl=(pathname,init)=>route[init.method||'GET'](new Request(`http://localhost${pathname}`,{...init,headers:{...init.headers,origin:'http://localhost'}}));
    const read=await loadCanonicalDirectorOverview({fetchImpl});assert.equal(read.tournament.id,'2026');
    const result=await submitCanonicalDirectorOperation({...finalize,operationRequestId:'client-finalize-2',expectedMatchRevision:20,expectedPermissionRevision:9},{fetchImpl});assert.equal(result.canonical.status,'FINAL');
    assert.equal(sql(cluster,database,'select count(*) from scoring_authority.scorecard_archive_jobs'),'0');assert.equal(sql(cluster,database,'select count(*) from scoring_authority.google_outbox_events'),'1');
    assert.ok(rpcCalls.includes('read_tournament_live_view'));assert.ok(rpcCalls.includes('finalize_match_authoritative'));
  });
 }finally{globalThis.fetch=originalFetch;await destroyIsolatedCluster(cluster);}
});
