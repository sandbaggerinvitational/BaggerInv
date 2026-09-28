// Proof layers: POSTGRESQL, CONCURRENCY, FAILURE_INJECTION, INTEGRATION.
// All connections are owned socket-only PostgreSQL17; no URL/host is accepted.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDatabase, createIsolatedCluster, destroyIsolatedCluster, sql,
  sqlFile, jsonLiteral, repositoryRoot } from "./postgres17.mjs";
import { installRelease139Schema, installRelease139FunctionCandidates,
  installCertifiedSqlRepairs } from "./release139-schema.mjs";
import { seedSyntheticTournament, runtimeScope, syntheticDirector } from "./synthetic-tournament.mjs";

export const proofFixtureVersion = "bagger-phase2-score-proof-v2";
export const proofSeed = "2026-canonical-score-path-2";
// Hash all bytes: the historical Phase1 helper truncates long namespaces/keys.
export function proofMutationId(value) {
  const h=createHash("sha256").update(`${proofSeed}:${value}`).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function rpcSql(name, input) {
  assert.match(name, /^[a-z][a-z0-9_]*$/);
  return `select public.${name}(${jsonLiteral(input)})`;
}
export function rpc(cluster, database, name, input) {
  return JSON.parse(sql(cluster, database, rpcSql(name, input)));
}
export function inputFor(cluster, database, matchId = "2026-R3-12", hole = 1,
  { key = `${matchId}:${hole}`, director = false, ...overrides } = {}) {
  const state = JSON.parse(sql(cluster, database, `select jsonb_build_object(
    'revision',m.match_revision,'permission',m.permission_revision,
    'hole_revision',coalesce((select hole_revision from scoring_authority.hole_scores
      where match_id=m.match_id and hole_number=${Number(hole)}),0),
    'format',m.format,'player',(select player_id from scoring_authority.match_participants
      where match_id=m.match_id and team_side=1 order by player_slot limit 1))
    from scoring_authority.matches m where match_id=${jsonLiteral(matchId)}#>>'{}'`));
  const player = director ? syntheticDirector.playerId : state.player;
  const authId = `10000000-0000-4000-8000-${String(Number(player.slice(1))).padStart(12, "0")}`;
  return runtimeScope({ match_id: matchId, hole_number: hole,
    mutation_key: proofMutationId(key),
    expected_match_revision: state.revision, expected_hole_revision: state.hole_revision,
    team_1_gross_scores: state.format === "BB" ? [4, 5] : [4],
    team_2_gross_scores: state.format === "BB" ? [5, 6] : [5],
    authorization: { tournament_id: "2026", match_id: matchId, player_id: player,
      auth_user_id: authId, role: director ? "DIRECTOR" : "PLAYER",
      permission_revision: state.permission }, ...overrides });
}
export function canonicalState(cluster, database, matchId = "2026-R3-12") {
  const state = JSON.parse(sql(cluster, database, `select jsonb_build_object(
    'match',(select to_jsonb(m) from scoring_authority.matches m where match_id=${jsonLiteral(matchId)}#>>'{}'),
    'holes',coalesce((select jsonb_agg(to_jsonb(h) order by hole_number)
      from scoring_authority.hole_scores h where match_id=${jsonLiteral(matchId)}#>>'{}'),'[]'),
    'receipts',coalesce((select jsonb_agg(to_jsonb(r) order by mutation_key)
      from scoring_authority.score_mutations r where match_id=${jsonLiteral(matchId)}#>>'{}'),'[]'),
    'audit_count',(select count(*) from scoring_authority.audit_events where match_id=${jsonLiteral(matchId)}#>>'{}'),
    'history_count',(select count(*) from scoring_authority.score_revision_history where match_id=${jsonLiteral(matchId)}#>>'{}'),
    'outbox_count',(select count(*) from scoring_authority.google_outbox_events where match_id=${jsonLiteral(matchId)}#>>'{}'),
    'permissions',(select jsonb_agg(to_jsonb(p) order by player_id)
      from scoring_authority.scoring_permissions p where match_id=${jsonLiteral(matchId)}#>>'{}'))`));
  state.derived_intents = sql(cluster,database,
    "select to_regclass('scoring_authority.score_derived_intents_v1') is not null") === "t"
    ? JSON.parse(sql(cluster,database,`select coalesce(jsonb_agg(to_jsonb(i) order by family,intent_id),'[]')
      from scoring_authority.score_derived_intents_v1 i where match_id=${jsonLiteral(matchId)}#>>'{}'`)) : [];
  return state;
}
export function exactReceipt(cluster, database, input) {
  return JSON.parse(sql(cluster, database, `select coalesce((select jsonb_build_object(
    'result',result,'mutation_key',mutation_key,'type',mutation_type,
    'next_match_revision',next_match_revision,'next_hole_revision',next_hole_revision)
    from scoring_authority.score_mutations
    where match_id=${jsonLiteral(input.match_id)}#>>'{}'
      and mutation_key=${jsonLiteral(input.mutation_key)}#>>'{}'), 'null'::jsonb)`));
}

export async function createScoreProofFixture({ candidateSql } = {}) {
  const cluster = await createIsolatedCluster();
  try {
    const database = "phase2_score_template";
    createDatabase(cluster, database);
    await installRelease139Schema(cluster, database);
    installRelease139FunctionCandidates(cluster, database);
    seedSyntheticTournament(cluster, database);
    installCertifiedSqlRepairs(cluster, database);
    // Explicit fixture construction only: make a pristine, fully prepared Live
    // tournament, preserving real calculation/actor/admission bodies except the
    // two documented Phase1 local runtime boundary substitutions.
    sql(cluster, database, `set session_replication_role=replica;
      delete from scoring_authority.finalized_scorecard_snapshots;
      delete from scoring_authority.scorecard_archive_jobs;
      delete from scoring_authority.scorecard_archive_checkpoints;
      delete from scoring_authority.google_outbox_events;
      delete from scoring_authority.score_revision_history;
      delete from scoring_authority.score_mutations;
      delete from scoring_authority.audit_events;
      delete from scoring_authority.hole_scores;
      update scoring_authority.matches set status='LIVE',scoring_locked=false,
        permission_revision=1,match_revision=0,scored_holes=0,current_hole=0,
        holes_remaining=18,team_1_holes_won=0,team_2_holes_won=0,
        running_result='Scheduled',result_winner='',clinched=false,
        scorecard_complete=false,unresolved_mutations=0,finalized_at=null;
      update scoring_authority.scoring_permissions set can_score=true,
        permission_revision=1,revoked_at=null;
      -- Extend the Phase1 low-handicap fixture with documented plus/high cases.
      -- These are synthetic approved facts before the proof begins, never edits
      -- to competitive data. Recompute frozen contexts with the actual builder.
      update scoring_authority.handicap_revision_entries set tournament_handicap=
        case player_id when 'P01' then -2.5 when 'P02' then 17.8
          when 'P23' then 26.4 when 'P24' then 40.2 else tournament_handicap end;
      update scoring_authority.tournament_players p set tournament_handicap=e.tournament_handicap
      from scoring_authority.handicap_revision_entries e
      where p.player_id=e.player_id and p.tournament_id=e.tournament_id;
      do $$declare m record;ctx jsonb;p jsonb;begin
        for m in select * from scoring_authority.matches where tournament_id='2026' loop
          ctx:=production_control.handicap_v1_match_context(
            m.match_id,'10000000-0000-4000-8000-000000000001');
          update scoring_authority.scoring_snapshots set
            participant_configuration=ctx->'participant_configuration',
            team_configuration=ctx->'team_configuration'
          where snapshot_id=m.scoring_snapshot_id;
          for p in select value from jsonb_array_elements(ctx->'participants') loop
            update scoring_authority.match_participants set
              tournament_handicap=(p->>'tournament_handicap')::numeric,
              handicap_index=(p->>'handicap_index')::numeric,
              course_handicap=(p->>'course_handicap')::numeric,
              playing_handicap=(p->>'playing_handicap')::numeric,
              final_strokes=(p->>'final_strokes')::integer
            where match_id=m.match_id and player_id=p->>'player_id';
          end loop;
        end loop;
      end$$;
      insert into auth.users(id,email,email_confirmed_at)
      select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
        'golfer'||n||'@synthetic.invalid',now() from generate_series(1,24)n
      on conflict(id)do nothing;
      insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash)
      select u.id,'P'||lpad(n::text,2,'0'),'ACTIVE','SYNTHETIC_FIXTURE',md5(n::text)||md5(n::text)
      from generate_series(1,24)n join auth.users u
        on u.id=('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
      where not exists(select 1 from participant_identity.user_player_links l where l.auth_user_id=u.id);
      insert into participant_identity.participant_auth_identifiers(
        player_id,auth_user_id,identifier_type,normalized_value_private,status,
        verified_at,verification_source,source_system,created_by,updated_by)
      select 'P'||lpad(n::text,2,'0'),u.id,'EMAIL',u.email,'VERIFIED',now(),
        'SYNTHETIC_FIXTURE','SYNTHETIC_FIXTURE','phase2-fixture','phase2-fixture'
      from generate_series(1,24)n join auth.users u
        on u.id=('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
      where not exists(select 1 from participant_identity.participant_auth_identifiers a where a.auth_user_id=u.id);
      insert into participant_identity.tournament_roles(tournament_id,auth_user_id,role,granted_by)
      select '2026',u.id,'PARTICIPANT','phase2-fixture' from auth.users u
      where not exists(select 1 from participant_identity.tournament_roles r
        where r.tournament_id='2026' and r.auth_user_id=u.id and r.role='PARTICIPANT');
      set session_replication_role=origin;`, { role: "" });
    let candidate = null;
    if (candidateSql) {
      assert.equal(path.isAbsolute(candidateSql), false, "candidate must be a repository relative SQL file");
      const filename = path.resolve(repositoryRoot, candidateSql);
      assert.ok(filename.startsWith(path.join(repositoryRoot, "supabase") + path.sep));
      assert.match(filename, /\.sql$/);
      candidate = { path: candidateSql,
        sha256: createHash("sha256").update(await readFile(filename)).digest("hex") };
      sqlFile(cluster, database, filename, { role: "" });
    }
    return { cluster, database, candidate, counter: 0,
      metadata: { fixture: proofFixtureVersion, seed: proofSeed,
        environment: "ISOLATED_LOCAL_POSTGRESQL17", durableCommit: true, fsync: false,
        handicapCases: { plus:-2.5, medium:17.8, high:26.4, veryHigh:40.2,
          builder:"production_control.handicap_v1_match_context", source:"SYNTHETIC_EDGE_CASES" },
        runtimeSubstitutions: ["assert_production_scoring_runtime", "assert_production_cutover_read_scope"],
        limitations: ["Synthetic initial Live/prepared authority; not Open/Prepare proof",
          "Actual actor/RPC/security predicates; no hosted identity/admission proof",
          "Real PostgreSQL COMMIT and cross-connection visibility; fsync disabled, no power-loss durability proof"] } };
  } catch(error) { await destroyIsolatedCluster(cluster); throw error; }
}
export function cloneScoreProofDatabase(fixture, label = "case") {
  const database = `p2_${++fixture.counter}_${label}`;
  assert.match(database, /^[a-z][a-z0-9_]{0,62}$/);
  createDatabase(fixture.cluster, database, { template: fixture.database });
  return database;
}

// Independent frozen-context oracle; does not call the scorer under test.
export function strokeCount(total, index) {
  return total <= 0 ? 0 : Math.floor(total / 18) + (index <= total % 18 ? 1 : 0);
}
export function scoringOracle(cluster, database, matchId) {
  const context = JSON.parse(sql(cluster, database, `select jsonb_build_object(
    'format',m.format,'course',s.course_id,'tee',s.tee,'handicap',s.handicap_revision_id,
    'team_config',s.team_configuration,
    'players',(select jsonb_agg(jsonb_build_object('side',team_side,'slot',player_slot,'strokes',final_strokes)
      order by team_side,player_slot) from scoring_authority.match_participants where match_id=m.match_id),
    'holes',(select jsonb_agg(jsonb_build_object('hole',hole_number,'index',stroke_index)order by hole_number)
      from scoring_authority.match_holes where match_id=m.match_id))
    from scoring_authority.matches m join scoring_authority.scoring_snapshots s
      on s.snapshot_id=m.scoring_snapshot_id where m.match_id=${jsonLiteral(matchId)}#>>'{}'`));
  return { context, hole(number,gross1,gross2) {
    const index = context.holes.find(h=>h.hole===number).index;
    const strokes = side => context.format === "SC"
      ? [strokeCount(Number(context.team_config[`team_${side}_strokes`]),index)]
      : context.players.filter(p=>p.side===side).map(p=>strokeCount(p.strokes,index));
    const s1=strokes(1),s2=strokes(2);
    const n1=Math.min(...gross1.map((g,i)=>g-s1[i]));
    const n2=Math.min(...gross2.map((g,i)=>g-s2[i]));
    return { strokes: {team_1:s1,team_2:s2}, net:{team_1:n1,team_2:n2},
      winner:n1===n2?"Halved":n1<n2?"Team 1":"Team 2" };
  } };
}
