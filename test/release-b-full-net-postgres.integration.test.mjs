import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {releaseBSeed} from './fixtures/release-b-canonical-sql.mjs';
import {calculateProductionFullNetSkins} from '../lib/production-full-net.js';
import {buildCalcuttaModel,calcuttaPublicationRecords} from '../lib/calcutta.js';
import {tieFixture} from './fixtures/calcutta-tie-metadata.mjs';
import {available,createCluster,destroyCluster,run,bin,environment,sql,sqlFile,
  installSupabaseCompatibility,installAnnualPlatformFixture,migrationNames}
  from './step13e7b1-production-annual-calcutta-postgres.integration.test.mjs';

test('Release B installs over exact 001–097, is inert and preserves lifecycle/financial authority',async t=>{
  assert.ok(await available(),'PostgreSQL 17 required');
  const c=await createCluster();t.after(()=>destroyCluster(c));
  const db='release_b';run(bin.createdb,[db],{env:environment(c)});installSupabaseCompatibility(c,db);
  const dir=new URL('../supabase/production_migrations/',import.meta.url);
  const names=await migrationNames();
  for(const name of names.filter(n=>n<'202609090098')) {
    sqlFile(c,db,new URL(name,dir).pathname);
    if(name.startsWith('202608260038'))sql(c,db,`insert into scoring_authority.tournaments(tournament_id,tournament_year,name,source_workbook_id,scoring_authority)
      values('2026',2026,'Release B isolated fixture','1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4','GOOGLE');
      insert into scoring_authority.ingress_gates(tournament_id,state,authority,unresolved_client_queues,updated_by)values('2026','PAUSED','GOOGLE',0,'local');`);
    if(name.startsWith('202608300068'))installAnnualPlatformFixture(c,db);
  }
  const signatures=['production_control.mutate_late_r3_dispatch_v1(jsonb,boolean)',
    'production_control.late_r3_result_compatible_v1(uuid,text)',
    'production_control.late_r3_consumed_fingerprint_v1()',
    'production_control.odds_publication_blocks_setup_v1(text)',
    'public.approve_production_handicap_revision_v1(jsonb)',
    'production_control.handicap_v1_match_context(text,uuid)',
    'public.mutate_production_round_pairings_v1(jsonb)',
    'production_control.mutate_round_pairings_before_late_r3_v1(jsonb)',
    'production_control.apply_tournament_setup_scoring_context_v1(jsonb)',
    'production_control.normalize_production_net_skins_v1_official_result(jsonb,integer,bigint,text)',
  ].filter(sig=>sql(c,db,`select to_regprocedure('${sig}') is not null`)==='t');
  const bodies=()=>Object.fromEntries(signatures.map(sig=>[sig,sql(c,db,`select md5(prosrc) from pg_proc where oid='${sig}'::regprocedure`)]));
  sqlFile(c,db,new URL('202609090098_production_net_skins_entries_v1.sql',dir).pathname);
  const before=bodies();
  const facts=()=>sql(c,db,`select production_control.late_r3_financial_fingerprint_v1()||':'||
    (select count(*) from scoring_authority.net_skins_v1_configuration_revisions)||':'||
    (select count(*) from scoring_authority.net_skins_v1_recalculation_jobs)||':'||
    (select count(*) from scoring_authority.net_skins_v1_result_revisions)||':'||
    (select count(*) from production_control.late_r3_initialization_receipts_v1)`);
  const factsBefore=facts();
  sqlFile(c,db,new URL('202609090099_production_full_net_consumers_v3.sql',dir).pathname);
  assert.deepEqual(bodies(),before);assert.equal(facts(),factsBefore);
  assert.equal(sql(c,db,`select has_function_privilege('anon','production_control.full_net_match_v1(text,text)','EXECUTE')
    or has_function_privilege('authenticated','production_control.full_net_tournament_v1(text,integer[])','EXECUTE')`),'f');
  assert.throws(()=>sql(c,db,`select production_control.full_net_skins_manifest_v2('2026',array[1],null)`),/FULL_NET_EXPLICIT_OPT_INS_REQUIRED/);
  assert.equal(JSON.parse(sql(c,db,`select production_control.full_net_tournament_v1('2026')`)).matches.length,0);
  const patched=sql(c,db,`select prosrc from pg_proc where oid='public.configure_production_net_skins_v1(jsonb)'::regprocedure`);
  assert.match(patched,/input->'entry_revisions'/);assert.match(patched,/request_payload_hash/);
  assert.match(sql(c,db,`select prosrc from pg_proc where oid='public.claim_production_calcutta_v1_recalculation(jsonb)'::regprocedure`),/full_net_authority/);
  assert.match(sql(c,db,`select prosrc from pg_proc where oid='public.complete_production_calcutta_v1_recalculation(jsonb)'::regprocedure`),/calcutta-full-net-v3/);
  assert.throws(()=>sqlFile(c,db,new URL('202609090099_production_full_net_consumers_v3.sql',dir).pathname),/already exists/);
  sql(c,db,releaseBSeed);
  sql(c,db,"insert into scoring_authority.players(player_id,display_name) select 'P'||n,'Synthetic '||n from generate_series(5,8)n");
  for(const format of ['BB','SC','SI'])for(const ties of [1,2,3]){
    const input=tieFixture(format,ties),publication=calcuttaPublicationRecords(input);
    const model=buildCalcuttaModel({...input,roundResults:publication.roundResults,standings:publication.standings});
    // Same JSONB payload representation used by immutable result revisions,
    // through the installed participant allowlist (no new SQL tie computation).
    const payload=JSON.stringify(model).replaceAll("'","''");
    const projected=JSON.parse(sql(c,db,`select production_control.project_production_calcutta_v1_result('${payload}'::jsonb)`));
    assert.equal(projected.golfers[0].rounds[0].tieSize,ties);
    assert.equal(projected.golfers[0].rounds[0].points,model.golfers[0].rounds[{BB:1,SC:2,SI:3}[format]].points);
  }
  const full=id=>JSON.parse(sql(c,db,`select production_control.full_net_match_v1('2026','${id}')`));
  const bb=full('M1'),sc=full('M2'),si=full('M3');
  assert.ok([bb,sc,si].every(m=>m.authorityAvailable),'normal canonical context binds frozen revision');
  assert.deepEqual(bb.entries.map(e=>e.fullCourseHandicapStrokes),[8,-1,37,0]);
  assert.match(bb.entries[0].courseHandicap,/^8\.460+$/);
  assert.equal(bb.entries[1].holes[17].fullCourseHandicapStrokes,-1);
  assert.equal(bb.entries[1].holes[0].fullCourseHandicapStrokes,0);
  assert.equal(bb.entries[2].holes[0].fullCourseHandicapStrokes,3);
  assert.equal(bb.entries[2].holes[17].fullCourseHandicapStrokes,2);
  assert.deepEqual(sc.entries.map(e=>e.fullCourseHandicapStrokes),[1,5]);
  assert.deepEqual(si.entries.map(e=>e.fullCourseHandicapStrokes),[8,37]);
  assert.equal(bb.entries[1].totalFullNet,73);
  assert.equal(sc.entries[1].totalFullNet,67);
  assert.equal(JSON.parse(sql(c,db,"select production_control.calcutta_v1_source_revision('2026')")).full_net_authority.matches.length,0,'uncompleted R3 does not enter consumed Calcutta authority');
  const registry=()=>JSON.parse(sql(c,db,"select production_control.net_skins_entries_projection_v1('2026')"));
  assert.ok(registry().rounds.every(r=>r.enteredCount===0));
  assert.throws(()=>sql(c,db,"select production_control.full_net_skins_manifest_v2('2026',array[1],'{\"1\":1}')"),/STALE_OR_UNAVAILABLE/);
  // Fixture-only immutable entry seed. Real authenticated save/retry/security
  // is covered separately by the unchanged 098 RPC certification.
  sql(c,db,`insert into production_control.net_skins_entry_revisions_v1(tournament_id,round_number,revision,request_id,request_hash,field_fingerprint,configured,entries,actor_player_id,actor_auth_user_id,response)
    select '2026',r.round_number,1,extensions.gen_random_uuid(),repeat('e',64),production_control.tournament_setup_hash_v1(production_control.net_skins_entry_field_v1('2026',r.round_number)),true,
    (select jsonb_agg(e||jsonb_build_object('entered',e->'playerIds' ? 'P1' or e->'playerIds' ? 'P3')) from jsonb_array_elements(production_control.net_skins_entry_field_v1('2026',r.round_number))e),
    'P1','10000000-0000-4000-8000-000000000009','{}' from scoring_authority.rounds r where tournament_id='2026';`);
  const manifest=JSON.parse(sql(c,db,"select production_control.full_net_skins_manifest_v2('2026',array[1,2,3],'{\"1\":1,\"2\":1,\"3\":1}')"));
  assert.deepEqual(manifest.rounds.map(r=>r.entries.length),[2,2,2]);
  assert.ok(manifest.rounds[0].entries.every(e=>e.player_id_1!=='P2'&&e.player_id_1!=='P4'));
  assert.deepEqual(manifest.entry_revisions,{'1':1,'2':1,'3':1});
  assert.throws(()=>sql(c,db,"select production_control.full_net_skins_manifest_v2('2026',array[2],'{\"2\":0}')"),/STALE_OR_UNAVAILABLE/);
  for(const r of manifest.rounds){
    const match=full('M'+r.round_number);
    const view={tournament:{tournament_id:'2026',tournament_year:2026},full_net_authority:{policy:match.policy,tournamentId:'2026',matches:[match]},
      net_skins_entry_authority:registry(),configurations:[{entries:r.entries.map(e=>({...e,round_number:r.round_number,format:r.format,
        source_payload:{'Canonical Match ID':e.match_id,'Net Handicap Basis':r.net_handicap_basis,'Entry Revision':e.entry_revision,'Entry Key':e.entry_key,'Entry Binding Fingerprint':e.binding_fingerprint}}))}],
      matches:[{match:{match_id:match.matchId},participants:[]}]};
    const result=calculateProductionFullNetSkins(view).netSkins.rounds[0];
    assert.equal(result.eligibleCount,2);assert.equal(result.pot,r.expected_pot);
    assert.equal(result.finalized,false,'UPCOMING full cards never become Official');
    // Existing NO rounding JS award engine retains binary floating-point sums.
    assert.ok(Math.abs(result.leaderboard.reduce((sum,e)=>sum+e.totalWinnings,0)-r.expected_pot)<1e-10);
  }
  sql(c,db,"set session_replication_role=replica;update scoring_authority.scoring_snapshots set handicap_revision_id=null where match_id='M1';set session_replication_role=origin;");
  assert.equal(full('M1').authorityAvailable,false);assert.equal(full('M1').entries[0].totalFullNet,null);
  sql(c,db,"set session_replication_role=replica;update scoring_authority.hole_scores set team_1_gross_scores='[null]' where match_id='M2' and hole_number=18;set session_replication_role=origin;");
  assert.equal(full('M2').entries[0].complete,false);assert.equal(full('M2').entries[0].totalFullNet,null);
  for(const [value,expected] of [['-37.5',-38],['-18.5',-19],['-1.5',-2],['-0.5',-1],['-0.49',0],['0',0],['0.49',0],['0.5',1],['1.5',2],['18',18],['18.5',19],['36.5',37]]){
    sql(c,db,`set session_replication_role=replica;
      update scoring_authority.handicap_revision_entries set tournament_handicap=${value} where player_id='P1';
      update scoring_authority.match_participants set course_handicap=${value} where player_id='P1';
      update scoring_authority.scoring_snapshots set participant_configuration=jsonb_set(participant_configuration,'{team_1,0,course_handicap}',to_jsonb(${value}::numeric)) where match_id='M3';
      set session_replication_role=origin;`);
    const player=full('M3').entries[0];assert.equal(player.fullCourseHandicapStrokes,expected);
    assert.equal(player.holes.reduce((sum,h)=>sum+h.fullCourseHandicapStrokes,0),expected);
    assert.equal(player.totalFullNet,72-expected);
    if(expected<0)assert.ok(player.holes[17].fullCourseHandicapStrokes<=player.holes[0].fullCourseHandicapStrokes);
    if(expected>0)assert.ok(player.holes[0].fullCourseHandicapStrokes>=player.holes[17].fullCourseHandicapStrokes);
  }
});
