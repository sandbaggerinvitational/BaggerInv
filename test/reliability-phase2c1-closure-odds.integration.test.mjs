// POSTGRESQL / API / INTEGRATION / SECURITY / FAILURE_INJECTION. Socket-only synthetic PG17.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import path from "node:path";
import test from "node:test";
import {createDatabase,createIsolatedCluster,destroyIsolatedCluster,sql,sqlFile,jsonLiteral,repositoryRoot} from "./support/reliability/postgres17.mjs";
import {installSupabaseCompatibility} from "./support/reliability/release139-schema.mjs";
import {championshipOddsResilienceFixture} from "./fixtures/championship-odds-resilience.mjs";
import {buildOddsInputProjection,loadSupabaseOddsInputs,buildSupabaseOddsPublication} from "../lib/championship-odds-supabase.js";
import {simulateTournamentOdds} from "../lib/tournament-odds.js";
import {processOddsCalculationJob} from "../lib/championship-odds-resilience.js";
import {readCanonicalDirectorOdds,mutateCanonicalDirectorOdds} from "../lib/canonical-director-odds.js";
import {canonicalDirectorOddsRequest} from "../lib/canonical-director-odds-client.js";
const migrations=["202608120001_preview_scoring_authority_schema.sql","202608120002_preview_scoring_authority_transactions.sql","202608120003_preview_scoring_authority_authorization_guards.sql","202608120004_preview_scoring_authority_course_handicap_precision.sql","202608120005_preview_scoring_authority_playing_handicap_precision.sql","202608120006_preview_scoring_authority_import_delete_order.sql","202608120007_preview_scoring_authority_cutover_ingress.sql","202608120008_preview_scoring_client_diagnostics.sql","202608120009_preview_scoring_authority_no_change_guard.sql","202608120010_preview_scoring_authority_finalization_permissions.sql","202608120012_preview_participant_identity_foundation.sql","202608120017_preview_game_center_reads.sql","202608120024_preview_participant_home_reads.sql","202608120025_preview_tournament_live_reads.sql","202608120026_preview_tournament_published_context.sql","202608120027_preview_leaderboards_core_reads.sql","202608120028_preview_leaderboards_core_presentation_revision.sql","202608120033_preview_published_odds_snapshots.sql","202608120034_harden_published_odds_scope.sql","202608120038_preview_championship_odds_inputs_publication.sql","202608120039_preview_championship_odds_google_mirror.sql","202608120040_preview_championship_odds_runtime_guards.sql","202608210001_preview_championship_odds_publication_rehearsal.sql","202608210002_preview_championship_odds_mirror_supersession.sql","202608220002_preview_championship_odds_execution_resilience.sql"];
const authorization={status:"active",source:"entitlement",identity:{authUserId:"11111111-1111-4111-8111-111111111111",tournamentId:"2026",actor:{id:"A01",role:"DIRECTOR"}}};
const env={VERCEL_ENV:"preview",SCORING_AUTHORITY:"supabase",SUPABASE_SCORING_MIRROR_URL:"https://idgigvjjqkfbqjeredpb.supabase.co",SUPABASE_SCORING_MIRROR_SECRET_KEY:"synthetic-server-only-not-real"};
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
async function route(dependencies={}) {
 const key=`odds-route-${randomUUID()}`;
 globalThis[key]={NextResponse:Response,after:()=>{},withOperationalRoute:(_,fn)=>fn,recordOperationalError:()=>{},authorizePreviewDirector:async()=>authorization,readCanonicalDirectorOdds,mutateCanonicalDirectorOdds,processOddsCalculationJob,...dependencies};
 const source=(await readFile(new URL("../app/api/director/canonical-odds/route.js",import.meta.url),"utf8")).replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];\n/gm,(_,b)=>`const {${b}}=globalThis[${JSON.stringify(key)}];\n`);
 try{return await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${key}`);}finally{delete globalThis[key];}
}
test("INTEGRATION NA-2026-DIRECTOR-ODDS-CANONICAL: owner publication and zero Google delivery",async t=>{
 const cluster=await createIsolatedCluster();const database="closure_odds";const originalFetch=globalThis.fetch;const priorEnv={...process.env};const calls=[];
 const rpc=(name,input)=>JSON.parse(sql(cluster,database,`select public.${name}(${jsonLiteral(input)})`));
 const file=name=>sqlFile(cluster,database,path.join(repositoryRoot,"supabase/migrations",name),{role:""});
 try {
  for(const key of Object.keys(process.env)) if(/^GOOGLE|SHEETS|DRIVE/.test(key))delete process.env[key];Object.assign(process.env,env);
  createDatabase(cluster,database);installSupabaseCompatibility(cluster,database);sql(cluster,database,"create schema extensions;create extension pgcrypto with schema extensions",{role:""});
  for(const name of migrations)file(name);
  const fixture=championshipOddsResilienceFixture();
  sql(cluster,database,`insert into scoring_authority.tournaments(tournament_id,tournament_year,name,source_workbook_id,scoring_authority) values('2026',2026,'Synthetic Odds','synthetic-provenance','SUPABASE');
   insert into scoring_authority.teams(tournament_id,team_id,team_side,name) values('2026','T1',1,'Alpha'),('2026','T2',2,'Bravo');
   insert into scoring_authority.rounds(tournament_id,round_number,format,name,status) values('2026',1,'BB','R1','UPCOMING'),('2026',2,'SC','R2','UPCOMING'),('2026',3,'SI','R3','UPCOMING');`);
  for(const p of fixture.sheets.handicaps)sql(cluster,database,`insert into scoring_authority.players(player_id,display_name) values(${literal(p["Player ID"])},${literal(p["Display Name"])});insert into scoring_authority.tournament_players(tournament_id,player_id,team_id,team_side,source_roster_key) values('2026',${literal(p["Player ID"])},'T${p["Team Side"].at(-1)}',${p["Team Side"].at(-1)},${literal(p["Player ID"])});`);
  const holes=Array.from({length:18},(_,i)=>({hole_number:i+1,stroke_index:i+1,par:4,yardage:400}));
  for(const m of fixture.sheets.matches){const id=m["Match ID"];sql(cluster,database,`insert into scoring_authority.scoring_snapshots(snapshot_id,tournament_id,match_id,snapshot_revision,scoring_rules_version,format,course_id,tee,rating,slope,par,match_netting_baseline,hole_definitions,participant_configuration,team_configuration,canonical_hash) values(${literal(id+':S1')},'2026',${literal(id)},1,'v1',${literal(m.Format)},'C1','Blue',72,125,72,'LOW',${jsonLiteral(holes)},'{}','{}',repeat('a',64));insert into scoring_authority.matches(match_id,tournament_id,round_number,format,scoring_snapshot_id,status) values(${literal(id)},'2026',${m.Round},${literal(m.Format)},${literal(id+':S1')},'UPCOMING');`);
   for(const side of [1,2])for(const slot of [1,2])if(m[`Team ${side} Player ${slot}`])sql(cluster,database,`insert into scoring_authority.match_participants(match_id,player_id,team_side,player_slot,playing_handicap,final_strokes) values(${literal(id)},${literal(m[`Team ${side} Player ${slot}`])},${side},${slot},0,0);`);
  }
  const config=buildOddsInputProjection({tournamentId:"2026",tournamentYear:2026,sourceWorkbookId:"synthetic-provenance",historical:fixture.historical,requestedBy:"synthetic fixture"});
  // Fixture construction only: old importer itself is maintenance-only and has known historical 42883.
  sql(cluster,database,`insert into scoring_authority.odds_input_configurations(tournament_id,configuration_revision,source_workbook_id,settings,historical_ratings,settings_fingerprint,ratings_fingerprint,pairing_fingerprint,bundle_fingerprint,imported_by) values('2026',1,'synthetic-provenance','[]',${jsonLiteral(config.historical_ratings)},${literal(config.settings_fingerprint)},${literal(config.ratings_fingerprint)},${literal(config.pairing_fingerprint)},${literal(config.bundle_fingerprint)},'synthetic fixture');`);
  globalThis.fetch=async(url,init)=>{const parsed=new URL(url);assert.equal(parsed.origin,env.SUPABASE_SCORING_MIRROR_URL,"every outbound attempt intercepted before any remote access");const name=parsed.pathname.split('/').at(-1);calls.push(name);const body=JSON.parse(init.body);let result;
   if(name==='read_championship_odds_inputs'||name==='read_leaderboards_core_view')result=JSON.parse(sql(cluster,database,`select public.${name}(${literal(body.target_tournament_id)})`));
   else if(['read_preview_odds_calculation_jobs','read_preview_director_odds_jobs_v1'].includes(name))result=JSON.parse(sql(cluster,database,`select public.${name}(${literal(body.target_tournament_id)},${body.target_job_id?literal(body.target_job_id):'null'})`));
   else if(name==='read_published_odds_view')result=JSON.parse(sql(cluster,database,`select public.${name}(${literal(body.target_tournament_id)},null)`));
   else result=rpc(name,body.input);
   return Response.json(result);
  };
  const inputs=await loadSupabaseOddsInputs('2026');const legacySnapshot=simulateTournamentOdds({...inputs,phase:'Pre-Tournament',iterations:10000,publishedAt:'2026-09-01T00:00:00Z'});
  assert.equal(rpc('publish_preview_championship_odds',buildSupabaseOddsPublication({snapshot:legacySnapshot,tournamentId:'2026',actorId:'A01',metadata:inputs.metadata})).google_mirror_status,'PENDING');
  const oldJobs=sql(cluster,database,"select jsonb_agg(to_jsonb(j) order by id) from scoring_authority.odds_google_mirror_jobs j");
  file('202609290003_preview_odds_runtime_retirement_v1.sql');
  file('202609290003_preview_odds_runtime_retirement_v1.sql'); // repeated application accepts only identical candidate
  const handler=await route();const client=(input=null,options={})=>canonicalDirectorOddsRequest(input,{...options,fetchImpl:(url,init)=>handler[init.method](new Request('http://localhost'+url,{...init,headers:{...init.headers,origin:'http://localhost'}}))});
  let jobId;
  await t.test('real client/API requests durable calculation; worker completes without publication',async()=>{const requested=await client({action:'calculate',phase:'After Round 1',iterations:10000});jobId=requested.jobId;assert.equal(requested.publicationCreated,false);assert.equal((await processOddsCalculationJob(jobId)).completed,true);assert.equal(sql(cluster,database,"select count(*) from scoring_authority.odds_published_snapshots"),'1');const completed=(await client(null,{jobId})).jobs[0];assert.equal(completed.status,'SUCCEEDED');assert.equal(completed.result.teams.length,2);for(const team of completed.result.teams){assert.equal(typeof team.name,'string');assert.equal(typeof team.probability,'number');}});
  await t.test('missing retirement schema and protected/impersonated identity deny before writes',async()=>{
   const command={action:'calculate',phase:'Pre-Tournament',iterations:10000};
   await assert.rejects(mutateCanonicalDirectorOdds({authorization,env,input:command},{readJobs:async()=>({payload:{ok:true,jobs:[]}}),requestCalculation:()=>assert.fail('retirement gate first')}),{code:'DIRECTOR_ODDS_STATE_UNAVAILABLE'});
   for(const changed of [{...authorization,source:'production-director-entitlement'},{...authorization,identity:{...authorization.identity,impersonating:true}}])await assert.rejects(mutateCanonicalDirectorOdds({authorization:changed,env,input:command}),{code:'DIRECTOR_ODDS_AUTHORIZATION_REQUIRED'});
   await assert.rejects(mutateCanonicalDirectorOdds({authorization,env:{...env,SUPABASE_SCORING_MIRROR_URL:'https://unapproved.invalid'},input:command}),{code:'DIRECTOR_ODDS_AUTHORIZATION_REQUIRED'});
  });
  await t.test('required publication audit failure rolls back the canonical pointer',async()=>{
   sql(cluster,database,"create function scoring_authority.reject_test_odds_audit() returns trigger language plpgsql as $$begin if new.action='CHAMPIONSHIP_ODDS_PUBLISHED' then raise exception 'synthetic required audit failure';end if;return new;end;$$;create trigger reject_test_odds_audit before insert on scoring_authority.audit_events for each row execute function scoring_authority.reject_test_odds_audit()",{role:""});
   await assert.rejects(client({action:'publish',jobId,confirmPublication:true}),{code:'DIRECTOR_ODDS_UNAVAILABLE'});
   assert.equal(sql(cluster,database,"select count(*) from scoring_authority.odds_published_snapshots"),'1');
   assert.equal(sql(cluster,database,"select milestone from scoring_authority.odds_published_snapshots where is_current_official"),'Pre-Tournament');
   sql(cluster,database,"drop trigger reject_test_odds_audit on scoring_authority.audit_events;drop function scoring_authority.reject_test_odds_audit()",{role:""});
  });
  await t.test('explicit owner publish commits snapshot, receipt and readback with no mirror job',async()=>{const result=await client({action:'publish',jobId,confirmPublication:true});assert.equal(result.publicationCreated,true);assert.equal(result.snapshot.phase,'After Round 1');assert.equal(sql(cluster,database,"select mirror_status from scoring_authority.odds_published_snapshots where is_current_official"),'RETIRED');assert.equal(sql(cluster,database,"select jsonb_agg(to_jsonb(j) order by id) from scoring_authority.odds_google_mirror_jobs j"),oldJobs);});
  await t.test('post-commit readback interruption retains completed job for safe same-calculation recovery',async()=>{
   await assert.rejects(mutateCanonicalDirectorOdds({authorization,env,input:{action:'publish',jobId,confirmPublication:true}}, {readPublished:async()=>{throw new Error('synthetic lost readback');}}),{code:'DIRECTOR_ODDS_READBACK_UNCONFIRMED',committed:true,jobId});
   assert.equal(sql(cluster,database,"select count(*) from scoring_authority.odds_published_snapshots where milestone='After Round 1'"),'1');
  });
  await t.test('same completed calculation retry has one canonical publication',async()=>{assert.equal((await client({action:'publish',jobId,confirmPublication:true})).duplicate,true);assert.equal(sql(cluster,database,"select count(*) from scoring_authority.odds_published_snapshots where milestone='After Round 1'"),'1');});
  await t.test('owner confirmation required and participant cannot publish',async()=>{await assert.rejects(client({action:'publish',jobId}),{code:'DIRECTOR_ODDS_INPUT_INVALID'});await assert.rejects(mutateCanonicalDirectorOdds({authorization:{...authorization,identity:{...authorization.identity,actor:{id:'A01',role:'PLAYER'}}},env,input:{action:'publish',jobId,confirmPublication:true}}),{code:'DIRECTOR_ODDS_AUTHORIZATION_REQUIRED'});});
  await t.test('current-job read omits private worker state and remains bounded across retained history',async()=>{
   sql(cluster,database,`insert into scoring_authority.odds_calculation_jobs select (jsonb_populate_record(null::scoring_authority.odds_calculation_jobs,to_jsonb(j)||jsonb_build_object('job_id',md5(n::text)||md5(n::text),'invocation_fingerprint',md5(n::text)||md5(n::text),'requested_at',now()-make_interval(days=>n),'status','SUPERSEDED'))).* from scoring_authority.odds_calculation_jobs j cross join generate_series(1,30) n where j.job_id=${literal(jobId)}`);
   const state=await client();assert.equal(state.jobs.length,4);for(const job of state.jobs){assert.equal(job.input_snapshot,undefined);assert.equal(job.checkpoint_payload,undefined);assert.equal(job.claim_token,undefined);}
   assert.equal((await client(null,{jobId})).jobs.length,1);
   const plan=JSON.parse(sql(cluster,database,"explain(analyze,format json) select job_id from scoring_authority.odds_calculation_jobs where tournament_id='2026' and phase='After Round 1' order by requested_at desc limit 4"));
   assert.equal(plan[0].Plan['Actual Rows'],4);assert.ok(plan[0]['Execution Time']>=0);
   t.diagnostic(`bounded-current-job-plan=${JSON.stringify(plan)}`);
  });
  await t.test('retired worker cannot claim preserved pending history',()=>{assert.equal(sql(cluster,database,"select has_function_privilege('service_role','public.claim_preview_championship_odds_google_mirror(jsonb)','EXECUTE')"),'f');assert.equal(sql(cluster,database,"select has_function_privilege('authenticated','public.publish_preview_championship_odds(jsonb)','EXECUTE')"),'f');});
  await t.test('cross-origin denied before authorization and failed canonical transport never falls back',async()=>{const denied=await route({authorizePreviewDirector:()=>assert.fail('origin first')});assert.equal((await denied.POST(new Request('http://localhost/api/director/canonical-odds',{method:'POST',headers:{origin:'https://untrusted.invalid'},body:'{}'}))).status,403);assert.ok(calls.every(name=>!name.includes('google')));});
  await t.test('another tournament job cannot be read or published through caller identity',async()=>{
   sql(cluster,database,"insert into scoring_authority.tournaments(tournament_id,tournament_year,name,source_workbook_id,scoring_authority) values('2050',2050,'Synthetic Other','synthetic-other','SUPABASE');insert into scoring_authority.odds_calculation_jobs select (jsonb_populate_record(null::scoring_authority.odds_calculation_jobs,to_jsonb(j)||jsonb_build_object('job_id',repeat('f',64),'invocation_fingerprint',repeat('f',64),'tournament_id','2050'))).* from scoring_authority.odds_calculation_jobs j where job_id="+literal(jobId));
   assert.deepEqual((await client(null,{jobId:'f'.repeat(64)})).jobs,[]);
   await assert.rejects(client({action:'publish',jobId:'f'.repeat(64),confirmPublication:true}),{code:'ODDS_CALCULATION_JOB_NOT_FOUND'});
  });
  await t.test('stale current authority blocks owner publication without changing snapshot',async()=>{sql(cluster,database,"update scoring_authority.matches set match_revision=match_revision+1 where match_id='R1-1'");await assert.rejects(client({action:'publish',jobId,confirmPublication:true}),{code:'ODDS_CALCULATION_STALE'});assert.equal(sql(cluster,database,"select count(*) from scoring_authority.odds_published_snapshots"),'2');});
 } finally {globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in priorEnv))delete process.env[key];Object.assign(process.env,priorEnv);await destroyIsolatedCluster(cluster);}
});
