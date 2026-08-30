import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { mobileCalcuttaResult } from "../lib/mobile-v1-calcutta.js";
import { mobileNetSkinsResult } from "../lib/mobile-v1-net-skins.js";
import {
  readMobilePreviewCalcuttaV1,
  readMobilePreviewNetSkinsV1,
} from "../lib/mobile-v1-preview-leaders-products.js";
import { scoringShadowPayloadHash } from "../lib/scoring-shadow.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(repositoryRoot, "supabase", "migrations");
const migration = path.join(
  migrationsDirectory,
  "202608300001_preview_mobile_secondary_leaderboards_v1.sql",
);
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const postgresBinaries = Object.fromEntries(
  ["createdb", "initdb", "pg_ctl", "psql"].map((name) => [name, path.join(pgBin, name)]),
);
const previewSupabaseUrl = "https://idgigvjjqkfbqjeredpb.supabase.co";
const previewEnv = Object.freeze({
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts",
  PREVIEW_SCORING_SHEET_ID: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SCORING_AUTHORITY: "supabase",
  SCORING_READ_SOURCE: "supabase",
  MATCH_AUTHORIZATION_SOURCE: "supabase",
  HOME_READ_SOURCE: "supabase",
  TOURNAMENT_READ_SOURCE: "supabase",
  LEADERBOARDS_CORE_READ_SOURCE: "supabase",
  GUIDE_READ_SOURCE: "supabase",
  COURSE_PRESENTATION_READ_SOURCE: "supabase",
  SUPABASE_SCORING_MIRROR_URL: previewSupabaseUrl,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "synthetic-server-only-key",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: previewSupabaseUrl,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "sb_publishable_preview",
  MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE: "supabase-turnstile",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "preview-turnstile-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "preview-native-rate-limit-secret-at-least-32-chars",
  MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET: "preview-native-certification-secret-at-least-32-chars",
  MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED: "true",
  MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED: "true",
});
const identity = Object.freeze({ tournamentId: "2026", playerId: "P1" });
const netSkinsConfigurationFingerprint = "a".repeat(64);
const calcuttaConfigurationFingerprint = "c".repeat(64);

class CommandFailure extends Error {
  constructor(command, result) {
    super([`Command failed: ${command}`, result.stdout, result.stderr].filter(Boolean).join("\n"));
    this.status = result.status;
    this.cause = result.error;
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new CommandFailure([command, ...args].join(" "), result);
  }
  return result.stdout;
}

function psqlEnvironment(cluster) {
  return {
    ...process.env,
    PGHOST: cluster.socketDirectory,
    PGPORT: String(cluster.port),
    PGUSER: "postgres",
    PGOPTIONS: "-c request.jwt.claim.role=service_role",
  };
}

function psql(cluster, database, sql) {
  return runCommand(
    postgresBinaries.psql,
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database],
    { env: psqlEnvironment(cluster), input: sql },
  ).trim();
}

function psqlFile(cluster, database, filename) {
  return runCommand(
    postgresBinaries.psql,
    ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", filename],
    { env: psqlEnvironment(cluster) },
  );
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonSql(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function parseJsonOutput(output) {
  const line = output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).at(-1);
  assert.ok(line, "The Preview RPC must return JSON.");
  return JSON.parse(line);
}

function rpc(cluster, database, name, input, { role = "service_role" } = {}) {
  assert.match(name, /^[a-z][a-z0-9_]+$/);
  assert.match(role, /^(service_role|authenticated|anon)$/);
  return parseJsonOutput(psql(
    cluster,
    database,
    `set role ${role}; select public.${name}(${jsonSql(input)})::text; reset role;`,
  ));
}

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function allBinariesAvailable() {
  try {
    await Promise.all(Object.values(postgresBinaries).map((binary) => access(binary, fsConstants.X_OK)));
    return true;
  } catch {
    return false;
  }
}

async function createCluster() {
  const clusterRoot = await mkdtemp("/tmp/bagger-preview-leaders-pg17-");
  const dataDirectory = path.join(clusterRoot, "data");
  const socketDirectory = path.join(clusterRoot, "socket");
  const logFile = path.join(clusterRoot, "postgres.log");
  const port = await availablePort();
  await mkdir(socketDirectory, { mode: 0o700 });
  runCommand(postgresBinaries.initdb, [
    "-D", dataDirectory, "--username=postgres", "--auth=trust", "--no-locale", "--encoding=UTF8",
  ]);
  runCommand(postgresBinaries.pg_ctl, [
    "-D", dataDirectory, "-l", logFile, "-o", `-F -k ${socketDirectory} -h '' -p ${port}`, "-w", "start",
  ]);
  return { clusterRoot, dataDirectory, socketDirectory, logFile, port, started: true };
}

async function destroyCluster(cluster) {
  if (cluster.started) {
    runCommand(postgresBinaries.pg_ctl, ["-D", cluster.dataDirectory, "-m", "fast", "-w", "stop"]);
    cluster.started = false;
  }
  assert.equal(path.dirname(cluster.clusterRoot), "/tmp");
  assert.match(path.basename(cluster.clusterRoot), /^bagger-preview-leaders-pg17-/);
  await rm(cluster.clusterRoot, { recursive: true, force: true });
}

function installSupabaseCompatibility(cluster, database) {
  psql(cluster, database, `
    do $roles$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end
    $roles$;
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create schema if not exists auth;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      phone text,
      raw_app_meta_data jsonb not null default '{}'::jsonb
    );
  `);
}

function installRequiredPreviewMigrations(cluster, database) {
  const names = [
    "202608120001_preview_scoring_authority_schema.sql",
    "202608120012_preview_participant_identity_foundation.sql",
    "202608120013_preview_participant_identity_pgcrypto.sql",
    "202608120014_preview_single_participant_auth_rehearsal.sql",
    "202608120015_preview_single_participant_auth_diagnostics.sql",
    "202608120016_preview_single_participant_auth_email_confirmation.sql",
    "202608120017_preview_game_center_reads.sql",
    "202608120029_preview_net_skins_derived_state.sql",
    "202608120030_preview_net_skins_disabled_round_state.sql",
    "202608120031_preview_net_skins_full_handicap_input.sql",
    "202608120032_preview_net_skins_explicit_individual_allocation.sql",
    "202608120035_preview_momentum_storylines_derived_state.sql",
    "202608120036_preview_competition_derived_job_claims.sql",
    "202608120037_preview_calcutta_operational_state.sql",
  ];
  for (const name of names) psqlFile(cluster, database, path.join(migrationsDirectory, name));
}

function holeDefinitions() {
  return Array.from({ length: 18 }, (_, index) => ({
    hole_number: index + 1,
    par: 4,
    stroke_index: index + 1,
    yardage: 400 + index,
  }));
}

function officialNetSkinsPayload() {
  return {
    complete: true,
    finalized: true,
    pot: 50,
    completedHoles: 18,
    skinsAwarded: 1,
    skinValue: 50,
    skins: [{
      hole: 7,
      winnerPlayerId: "P1",
      winnerPlayerId2: null,
      winningNetScore: 3,
      skinValue: 50,
    }],
    leaderboard: [{
      rank: 1,
      displayRank: "1",
      id: "2026-R1-P1",
      playerIds: ["P1"],
      skinsWon: 1,
      totalWinnings: 50,
      winningHoles: [{ hole: 7 }],
    }, {
      rank: 2,
      displayRank: "2",
      id: "2026-R1-P3",
      playerIds: ["P3"],
      skinsWon: 0,
      totalWinnings: 0,
      winningHoles: [],
    }],
  };
}

function calcuttaResultPayload() {
  return {
    available: true,
    tournamentComplete: false,
    completedRounds: [1],
    golfers: [{
      rank: 1,
      tieSize: 1,
      player: { id: "P1", name: "Player One" },
      rounds: [{
        round: 1,
        format: "SI",
        gross: 72,
        net: 70,
        fullCourseHandicap: 2,
        place: 1,
        tieSize: 1,
        points: 10,
        payoutPercent: "0.5",
        guaranteedWinnings: "50.125",
      }],
      totalPoints: 10,
      overallPayoutPercent: "0.5",
      totalPayoutPercent: "0.5",
      guaranteedWinnings: "50.125",
      currentPayoutValue: "50.125",
      netProfit: "-50.125",
      roi: "-0.5",
      remainingUpside: "0",
    }],
    portfolios: [{
      rank: 1,
      owner: { id: "P1", name: "Player One" },
      investments: [{
        player: { id: "P1", name: "Player One" },
        ownership: "1",
        purchasePrice: "100.250",
        guaranteedWinnings: "50.125",
        currentPayoutValue: "50.125",
        netProfit: "-50.125",
        roi: "-0.5",
      }],
      purchaseCost: "100.250",
      guaranteedWinnings: "50.125",
      currentPayoutValue: "50.125",
      netProfit: "-50.125",
      roi: "-0.5",
    }],
  };
}

function seedCanonicalFixture(cluster, database) {
  const holes = holeDefinitions();
  psql(cluster, database, `
    insert into scoring_authority.tournaments
      (tournament_id, tournament_year, name, source_workbook_id, scoring_authority)
    values
      ('2026', 2026, 'Synthetic Preview', 'synthetic-preview-workbook', 'SUPABASE'),
      ('2027', 2027, 'Wrong Preview Tournament', 'synthetic-preview-workbook-2027', 'SUPABASE'),
      ('2028', 2028, 'Closed Preview Calcutta', 'synthetic-preview-workbook-2028', 'SUPABASE');
    insert into scoring_authority.teams (tournament_id, team_id, team_side, name)
    values
      ('2026', 'T1', 1, 'Team One'), ('2026', 'T2', 2, 'Team Two'),
      ('2027', 'T1-2027', 1, 'Wrong Team One'), ('2027', 'T2-2027', 2, 'Wrong Team Two');
    insert into scoring_authority.players (player_id, display_name) values
      ('P1', 'Player One'), ('P2', 'Inactive Player'), ('P3', 'Player Three'),
      ('PW', 'Wrong Tournament Player');
    insert into scoring_authority.tournament_players
      (tournament_id, player_id, team_id, team_side, participation_status, source_roster_key)
    values
      ('2026', 'P1', 'T1', 1, 'ACTIVE', 'P1'),
      ('2026', 'P2', 'T1', 1, 'INACTIVE', 'P2'),
      ('2026', 'P3', 'T2', 2, 'ACTIVE', 'P3'),
      ('2027', 'PW', 'T1-2027', 1, 'ACTIVE', 'PW');
    insert into scoring_authority.rounds (tournament_id, round_number, format, name, status)
    values ('2026', 1, 'SI', 'Round 1', 'FINAL'), ('2026', 2, 'SI', 'Round 2', 'LIVE');
    insert into scoring_authority.scoring_snapshots
      (snapshot_id, tournament_id, match_id, snapshot_revision, scoring_rules_version, format,
       course_id, tee, rating, slope, par, match_netting_baseline, hole_definitions,
       participant_configuration, team_configuration, canonical_hash)
    values
      ('M1:S1', '2026', 'M1', 1, 'v1', 'SI', 'C1', 'Blue', 72, 125, 72, 'LOW',
       ${jsonSql(holes)}, '{}'::jsonb, '{}'::jsonb, ${sqlLiteral("1".repeat(64))}),
      ('M2:S1', '2026', 'M2', 1, 'v1', 'SI', 'C1', 'Blue', 72, 125, 72, 'LOW',
       ${jsonSql(holes)}, '{}'::jsonb, '{}'::jsonb, ${sqlLiteral("2".repeat(64))});
    insert into scoring_authority.matches
      (match_id, tournament_id, round_number, format, scoring_snapshot_id, status,
       permission_revision, match_revision, scored_holes, current_hole, holes_remaining,
       running_result, result_winner, scorecard_complete, finalized_at)
    values
      ('M1', '2026', 1, 'SI', 'M1:S1', 'FINAL', 1, 18, 18, 18, 0,
       'Team 1 wins', 'Team 1', true, '2026-08-29T18:00:00Z'),
      ('M2', '2026', 2, 'SI', 'M2:S1', 'LIVE', 1, 3, 2, 2, 16,
       'All square through 2', '', false, null);
    insert into scoring_authority.match_participants
      (match_id, player_id, team_side, player_slot, playing_handicap, final_strokes)
    values
      ('M1', 'P1', 1, 1, 2, 2), ('M1', 'P3', 2, 1, 4, 4),
      ('M2', 'P1', 1, 1, 2, 2), ('M2', 'P3', 2, 1, 4, 4);
    insert into scoring_authority.match_holes
      (match_id, hole_number, snapshot_id, stroke_index, par, yardage)
    select match_id, hole, match_id || ':S1', hole, 4, 400 + hole
    from (values ('M1'), ('M2')) matches(match_id)
    cross join generate_series(1, 18) holes(hole);
    insert into scoring_authority.hole_scores
      (match_id, hole_number, hole_revision, team_1_gross_scores, team_2_gross_scores,
       team_1_strokes, team_2_strokes, team_1_net_score, team_2_net_score,
       hole_winner, mutation_key, actor_id)
    select 'M1', hole, 1, '[4]'::jsonb, '[5]'::jsonb, '[0]'::jsonb, '[0]'::jsonb,
      4, 5, 'Team 1', 'seed-m1-' || hole, 'P1'
    from generate_series(1, 18) holes(hole);
    insert into scoring_authority.hole_scores
      (match_id, hole_number, hole_revision, team_1_gross_scores, team_2_gross_scores,
       team_1_strokes, team_2_strokes, team_1_net_score, team_2_net_score,
       hole_winner, mutation_key, actor_id)
    select 'M2', hole, 1, '[4]'::jsonb, '[4]'::jsonb, '[0]'::jsonb, '[0]'::jsonb,
      4, 4, 'Halved', 'seed-m2-' || hole, 'P1'
    from generate_series(1, 2) holes(hole);
    insert into scoring_authority.game_center_presentations
      (match_id, tournament_id, display_match_number, match_sort_order,
       source_workbook_id, source_payload_hash, imported_by)
    values
      ('M1', '2026', '1', 1, 'synthetic-preview-workbook', ${sqlLiteral("3".repeat(64))}, 'test'),
      ('M2', '2026', '2', 2, 'synthetic-preview-workbook', ${sqlLiteral("4".repeat(64))}, 'test');

    insert into scoring_authority.net_skins_configuration_import_runs
      (tournament_id, source_workbook_id, configuration_fingerprint, status,
       round_count, entry_count, requested_by)
    values ('2026', 'synthetic-preview-workbook', ${sqlLiteral(netSkinsConfigurationFingerprint)},
      'APPLIED', 2, 4, 'integration-test');
    insert into scoring_authority.net_skins_configurations
      (tournament_id, round_number, format, enabled, entry_type, buy_in_per_entry,
       expected_pot, completion_rule, payout_rounding, tie_rule,
       configuration_revision, configuration_fingerprint, source_workbook_id, imported_by)
    values
      ('2026', 1, 'SI', true, 'INDIVIDUAL', 25, 50,
       'ALL_ELIGIBLE_ENTRIES_18_HOLES_AND_REFERENCED_MATCHES_OFFICIAL', 'NONE', 'NO_SKIN_NO_CARRY',
       1, ${sqlLiteral(netSkinsConfigurationFingerprint)}, 'synthetic-preview-workbook', 'integration-test'),
      ('2026', 2, 'SI', true, 'INDIVIDUAL', 25, 50,
       'ALL_ELIGIBLE_ENTRIES_18_HOLES_AND_REFERENCED_MATCHES_OFFICIAL', 'NONE', 'NO_SKIN_NO_CARRY',
       1, ${sqlLiteral(netSkinsConfigurationFingerprint)}, 'synthetic-preview-workbook', 'integration-test');
    insert into scoring_authority.net_skins_configuration_entries
      (tournament_id, round_number, entry_id, match_number, format, player_id_1,
       buy_in, eligible, source_payload)
    values
      ('2026', 1, '2026-R1-P1', '1', 'SI', 'P1', 25, true,
       '{"Individual Stroke Allocation":"2"}'::jsonb),
      ('2026', 1, '2026-R1-P3', '1', 'SI', 'P3', 25, true,
       '{"Individual Stroke Allocation":"4"}'::jsonb),
      ('2026', 2, '2026-R2-P1', '2', 'SI', 'P1', 25, true,
       '{"Individual Stroke Allocation":"2"}'::jsonb),
      ('2026', 2, '2026-R2-P3', '2', 'SI', 'P3', 25, true,
       '{"Individual Stroke Allocation":"4"}'::jsonb);
    insert into scoring_authority.competition_derived_snapshots
      (tournament_id, round_number, engine_key, engine_version,
       configuration_fingerprint, source_fingerprint, result_state,
       result_payload, payload_hash, is_current, calculated_at, published_at)
    values
      ('2026', 1, 'NET_SKINS', 'v1', ${sqlLiteral(netSkinsConfigurationFingerprint)},
       ${sqlLiteral("5".repeat(64))}, 'OFFICIAL', ${jsonSql(officialNetSkinsPayload())},
       ${sqlLiteral("6".repeat(64))}, true, '2026-08-30T17:00:00Z', '2026-08-30T17:05:00Z'),
      ('2026', 2, 'NET_SKINS', 'v1', ${sqlLiteral(netSkinsConfigurationFingerprint)},
       ${sqlLiteral("7".repeat(64))}, 'PROVISIONAL',
       '{"complete":false,"finalized":false,"privateDraft":"DRAFT_ONLY_SENTINEL"}'::jsonb,
       ${sqlLiteral("8".repeat(64))}, true, '2026-08-30T17:10:00Z', null);
    insert into scoring_authority.competition_recalculation_jobs
      (tournament_id, round_number, engine_key, status, requested_source_revision,
       attempts, requested_at, completed_at)
    values
      ('2026', 1, 'NET_SKINS', 'SUCCEEDED', '{}'::jsonb, 1, now(), now()),
      ('2026', 2, 'NET_SKINS', 'SUCCEEDED', '{}'::jsonb, 1, now(), now());

    insert into scoring_authority.calcutta_configurations
      (tournament_id, tournament_year, configuration_revision, configuration_fingerprint,
       purchases, ownership, point_structure, payout_structure, financial_contract,
       source_workbook_id, imported_by)
    values (
      '2026', 2026, 1, ${sqlLiteral(calcuttaConfigurationFingerprint)},
      '[{"player_id":"P1","purchase_price":"100.250"}]'::jsonb,
      '[{"player_id":"P1","owner_player_id":"P1","ownership_fraction":"1"}]'::jsonb,
      '[]'::jsonb, '[]'::jsonb,
      '{"total_market_value":"100.250","total_payout_fraction":"1"}'::jsonb,
      'synthetic-preview-workbook', 'integration-test'
    );
    insert into scoring_authority.calcutta_configurations
      (tournament_id, tournament_year, configuration_revision, configuration_fingerprint,
       purchases, ownership, point_structure, payout_structure, financial_contract,
       source_workbook_id, imported_by)
    values
      ('2027', 2027, 1, ${sqlLiteral("d".repeat(64))},
       '[{"player_id":"PW","purchase_price":"25.125"}]'::jsonb,
       '[{"player_id":"PW","owner_player_id":"PW","ownership_fraction":"1"}]'::jsonb,
       '[]'::jsonb, '[]'::jsonb,
       '{"total_market_value":"25.125","total_payout_fraction":"1"}'::jsonb,
       'synthetic-preview-workbook-2027', 'integration-test'),
      ('2028', 2028, 1, ${sqlLiteral("e".repeat(64))},
       '[{"player_id":"P1","purchase_price":"10.125"}]'::jsonb,
       '[{"player_id":"P1","owner_player_id":"P1","ownership_fraction":"1"}]'::jsonb,
       '[]'::jsonb, '[]'::jsonb,
       '{"total_market_value":"10.125","total_payout_fraction":"1"}'::jsonb,
       'synthetic-preview-workbook-2028', 'integration-test');
    insert into scoring_authority.competition_derived_snapshots
      (tournament_id, round_number, engine_key, engine_version,
       configuration_fingerprint, source_fingerprint, result_state,
       result_payload, payload_hash, is_current, calculated_at, published_at)
    values (
      '2026', 0, 'CALCUTTA', 'v1', ${sqlLiteral(calcuttaConfigurationFingerprint)},
      ${sqlLiteral("9".repeat(64))}, 'PROVISIONAL', ${jsonSql(calcuttaResultPayload())},
      ${sqlLiteral("b".repeat(64))}, true, '2026-08-30T17:15:00Z', '2026-08-30T17:20:00Z'
    );
    insert into scoring_authority.competition_derived_snapshots
      (tournament_id, round_number, engine_key, engine_version,
       configuration_fingerprint, source_fingerprint, result_state,
       result_payload, payload_hash, is_current, calculated_at, published_at)
    values
      ('2027', 0, 'CALCUTTA', 'v1', ${sqlLiteral("f".repeat(64))},
       ${sqlLiteral("1".repeat(64))}, 'PROVISIONAL', '{"available":true}'::jsonb,
       ${sqlLiteral("2".repeat(64))}, true, '2026-08-30T17:15:00Z', null),
      ('2028', 0, 'CALCUTTA', 'v1', ${sqlLiteral("e".repeat(64))},
       ${sqlLiteral("3".repeat(64))}, 'PROVISIONAL', '{"available":false}'::jsonb,
       ${sqlLiteral("4".repeat(64))}, true, '2026-08-30T17:15:00Z', null);
    insert into scoring_authority.competition_recalculation_jobs
      (tournament_id, round_number, engine_key, status, requested_source_revision,
       attempts, requested_at, completed_at)
    values ('2026', 0, 'CALCUTTA', 'SUCCEEDED', '{}'::jsonb, 1, now(), now())
    on conflict (tournament_id, round_number, engine_key) do update set
      status = 'SUCCEEDED', completed_at = now();
  `);
}

function synchronizeNetSkinsSourceFingerprints(cluster, database) {
  const source = rpc(cluster, database, "read_preview_mobile_net_skins_v1", {
    environment: "PREVIEW",
    tournament_id: "2026",
    player_id: "P1",
  }).data.input.source_revision;
  for (const roundNumber of [1, 2]) {
    const matches = source.matches.filter((row) => Number(row.round) === roundNumber);
    const matchIds = new Set(matches.map((row) => String(row.matchId)));
    const holes = source.holes.filter((row) => matchIds.has(String(row.matchId)));
    const fingerprint = scoringShadowPayloadHash({ tournamentId: "2026", matches, holes });
    psql(cluster, database, `
      update scoring_authority.competition_derived_snapshots
      set source_fingerprint = ${sqlLiteral(fingerprint)}
      where tournament_id = '2026' and round_number = ${roundNumber}
        and engine_key = 'NET_SKINS' and is_current;
    `);
  }
}

test("Preview mobile secondary Leaderboards authority is safe in PostgreSQL 17", {
  timeout: 120_000,
}, async (t) => {
  if (!(await allBinariesAvailable())) {
    t.skip(`PostgreSQL 17 toolchain is unavailable at ${pgBin}`);
    return;
  }

  const cluster = await createCluster();
  const database = "preview_mobile_secondary_leaderboards";
  runCommand(postgresBinaries.createdb, [database], { env: psqlEnvironment(cluster) });
  installSupabaseCompatibility(cluster, database);
  installRequiredPreviewMigrations(cluster, database);
  seedCanonicalFixture(cluster, database);
  psqlFile(cluster, database, migration);
  synchronizeNetSkinsSourceFingerprints(cluster, database);

  const originalFetch = globalThis.fetch;
  const rpcCalls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, previewSupabaseUrl);
    assert.match(url.pathname, /^\/rest\/v1\/rpc\/[a-z0-9_]+$/);
    const name = url.pathname.split("/").at(-1);
    const body = JSON.parse(init.body || "{}");
    rpcCalls.push({ name, input: structuredClone(body.input) });
    return Response.json(rpc(cluster, database, name, body.input));
  };

  try {
    await t.test("active participant reads stay bound to exact Preview tournament membership", async () => {
      const skins = rpc(cluster, database, "read_preview_mobile_net_skins_v1", {
        environment: "PREVIEW", tournament_id: "2026", player_id: "P1",
      });
      const calcutta = rpc(cluster, database, "read_preview_mobile_calcutta_v1", {
        environment: "PREVIEW", tournament_id: "2026", player_id: "P1",
      });
      assert.equal(skins.ok, true);
      assert.equal(skins.data.input.tournament.tournament_id, "2026");
      assert.equal(calcutta.ok, true);
      assert.equal(calcutta.data.tournament_id, "2026");

      for (const [playerId, tournamentId] of [
        ["P2", "2026"],
        ["PW", "2026"],
        ["P1", "2027"],
        ["MISSING", "2026"],
      ]) {
        for (const name of [
          "read_preview_mobile_net_skins_v1",
          "read_preview_mobile_calcutta_v1",
        ]) {
          const denied = rpc(cluster, database, name, {
            environment: "PREVIEW", tournament_id: tournamentId, player_id: playerId,
          });
          assert.deepEqual(denied, { ok: false, code: "PREVIEW_PARTICIPANT_RESOURCE_REQUIRED" });
        }
      }
      for (const name of [
        "read_preview_mobile_net_skins_v1",
        "read_preview_mobile_calcutta_v1",
      ]) {
        const productionShadow = rpc(cluster, database, name, {
          environment: "PRODUCTION", tournament_id: "2026", player_id: "P1",
        });
        assert.deepEqual(productionShadow, {
          ok: false,
          code: "PREVIEW_PARTICIPANT_RESOURCE_REQUIRED",
        });
      }
    });

    await t.test("Net Skins exposes only exact official canonical results", async () => {
      const result = await mobileNetSkinsResult(identity, {
        env: previewEnv,
        now: new Date("2026-08-30T18:00:00Z"),
      });
      assert.equal(result.body.data.publicationPolicy, "OFFICIAL_ONLY");
      assert.equal(result.body.data.rounds[0].state, "OFFICIAL");
      assert.equal(result.body.data.rounds[0].officialResults.skins[0].holeNumber, 7);
      assert.equal(result.body.data.rounds[1].state, "IN_PROGRESS");
      assert.equal(result.body.data.rounds[1].officialResults, null);
      assert.equal(JSON.stringify(result.body).includes("DRAFT_ONLY_SENTINEL"), false);
      assert.deepEqual(rpcCalls.at(-1), {
        name: "read_preview_mobile_net_skins_v1",
        input: { environment: "PREVIEW", tournament_id: "2026", player_id: "P1" },
      });
    });

    await t.test("Calcutta publication gate hides values and publication can be toggled safely", async () => {
      const adopted = JSON.parse(psql(cluster, database, `select coalesce(json_agg(value order by value.tournament_id), '[]'::json)::text
        from (select tournament_id, publication_state, configuration_fingerprint
          from scoring_authority.preview_mobile_calcutta_publications) value;`));
      assert.deepEqual(adopted, [{
        tournament_id: "2026",
        publication_state: "PUBLISHED",
        configuration_fingerprint: calcuttaConfigurationFingerprint,
      }]);

      const published = await mobileCalcuttaResult(identity, {
        env: previewEnv,
        now: new Date("2026-08-30T18:00:00Z"),
      });
      assert.equal(published.body.data.published, true);
      assert.equal(published.body.data.market.pot, "100.25");
      assert.equal(published.body.data.market.purchases[0].purchasePrice, "100.25");
      assert.equal(published.body.data.result.golfers[0].guaranteedWinnings, "50.125");

      const unpublishedTransition = rpc(
        cluster,
        database,
        "set_preview_mobile_calcutta_publication",
        {
          environment: "PREVIEW",
          tournament_id: "2026",
          publication_state: "UNPUBLISHED",
          requested_by: "integration-test",
        },
      );
      assert.equal(unpublishedTransition.ok, true);
      assert.equal(unpublishedTransition.publication_state, "UNPUBLISHED");
      const unpublished = await mobileCalcuttaResult(identity, {
        env: previewEnv,
        now: new Date("2026-08-30T18:01:00Z"),
      });
      assert.equal(unpublished.body.data.publicationState, "UNPUBLISHED");
      assert.equal(unpublished.body.data.published, false);
      assert.equal(unpublished.body.data.market, null);
      assert.equal(unpublished.body.data.result, null);
      assert.equal(JSON.stringify(unpublished.body).includes("100.25"), false);
      assert.equal(JSON.stringify(unpublished.body).includes("50.125"), false);

      const republishedTransition = rpc(
        cluster,
        database,
        "set_preview_mobile_calcutta_publication",
        {
          environment: "PREVIEW",
          tournament_id: "2026",
          publication_state: "PUBLISHED",
          requested_by: "integration-test",
        },
      );
      assert.equal(republishedTransition.ok, true);
      assert.equal(republishedTransition.publication_state, "PUBLISHED");
      const republished = await mobileCalcuttaResult(identity, {
        env: previewEnv,
        now: new Date("2026-08-30T18:02:00Z"),
      });
      assert.equal(republished.body.data.published, true);
      assert.equal(republished.body.data.market.pot, "100.25");

      psql(cluster, database, `update scoring_authority.calcutta_configurations
        set configuration_fingerprint = ${sqlLiteral("7".repeat(64))}
        where tournament_id = '2026' and is_current;`);
      const reset = await mobileCalcuttaResult(identity, {
        env: previewEnv,
        now: new Date("2026-08-30T18:03:00Z"),
      });
      assert.equal(reset.body.data.publicationState, "UNPUBLISHED");
      assert.equal(reset.body.data.published, false);
      assert.equal(reset.body.data.market, null);
      assert.equal(reset.body.data.result, null);
    });

    await t.test("RPC execution and publication storage remain service-role-only with RLS", () => {
      const privileges = JSON.parse(psql(cluster, database, `select json_build_object(
        'skinsService', has_function_privilege('service_role',
          'public.read_preview_mobile_net_skins_v1(jsonb)', 'EXECUTE'),
        'calcuttaService', has_function_privilege('service_role',
          'public.read_preview_mobile_calcutta_v1(jsonb)', 'EXECUTE'),
        'publicationService', has_function_privilege('service_role',
          'public.set_preview_mobile_calcutta_publication(jsonb)', 'EXECUTE'),
        'skinsAnon', has_function_privilege('anon',
          'public.read_preview_mobile_net_skins_v1(jsonb)', 'EXECUTE'),
        'calcuttaAuthenticated', has_function_privilege('authenticated',
          'public.read_preview_mobile_calcutta_v1(jsonb)', 'EXECUTE'),
        'publicationAuthenticated', has_function_privilege('authenticated',
          'public.set_preview_mobile_calcutta_publication(jsonb)', 'EXECUTE'),
        'publicationTableAuthenticated', has_table_privilege('authenticated',
          'scoring_authority.preview_mobile_calcutta_publications', 'SELECT'),
        'publicationRls', (select relrowsecurity from pg_class
          where oid = 'scoring_authority.preview_mobile_calcutta_publications'::regclass)
      )::text;`));
      assert.deepEqual(privileges, {
        skinsService: true,
        calcuttaService: true,
        publicationService: true,
        skinsAnon: false,
        calcuttaAuthenticated: false,
        publicationAuthenticated: false,
        publicationTableAuthenticated: false,
        publicationRls: true,
      });
      assert.throws(() => rpc(
        cluster,
        database,
        "read_preview_mobile_net_skins_v1",
        { environment: "PREVIEW", tournament_id: "2026", player_id: "P1" },
        { role: "authenticated" },
      ), /permission denied for function read_preview_mobile_net_skins_v1/i);
      assert.throws(() => rpc(
        cluster,
        database,
        "set_preview_mobile_calcutta_publication",
        {
          environment: "PREVIEW",
          tournament_id: "2026",
          publication_state: "UNPUBLISHED",
          requested_by: "not-authorized",
        },
        { role: "anon" },
      ), /permission denied for function set_preview_mobile_calcutta_publication/i);
    });
  } finally {
    globalThis.fetch = originalFetch;
    await destroyCluster(cluster);
  }
});
