import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  mobileScoringFinalizeResult,
  mobileScoringHoleResult,
} from "../lib/mobile-v1-scoring.js";
import { persistParticipantScore } from "../lib/scoring-persistence-adapter.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(repositoryRoot, "supabase", "migrations");
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const postgresBinaries = Object.fromEntries(
  ["createdb", "initdb", "pg_ctl", "psql"].map((name) => [name, path.join(pgBin, name)]),
);
const authUserId = "11111111-1111-4111-8111-111111111111";
const previewWorkbookId = "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts";
const previewSupabaseUrl = "https://idgigvjjqkfbqjeredpb.supabase.co";
const previewEnv = Object.freeze({
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: previewWorkbookId,
  GOOGLE_SHEETS_SPREADSHEET_ID: previewWorkbookId,
  PREVIEW_SCORING_SHEET_ID: previewWorkbookId,
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

function rpc(cluster, database, name, input) {
  assert.match(name, /^[a-z][a-z0-9_]+$/);
  return parseJsonOutput(psql(
    cluster,
    database,
    `select public.${name}(${jsonSql(input)})::text;`,
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
  const clusterRoot = await mkdtemp("/tmp/bms-pg17-");
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
  assert.match(path.basename(cluster.clusterRoot), /^bms-pg17-/);
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
  `);
}

function installPreviewScoringMigrations(cluster, database) {
  const names = [
    "202608120001_preview_scoring_authority_schema.sql",
    "202608120002_preview_scoring_authority_transactions.sql",
    "202608120003_preview_scoring_authority_authorization_guards.sql",
    "202608120004_preview_scoring_authority_course_handicap_precision.sql",
    "202608120005_preview_scoring_authority_playing_handicap_precision.sql",
    "202608120006_preview_scoring_authority_import_delete_order.sql",
    "202608120007_preview_scoring_authority_cutover_ingress.sql",
    "202608120008_preview_scoring_client_diagnostics.sql",
    "202608120009_preview_scoring_authority_no_change_guard.sql",
    "202608120010_preview_scoring_authority_finalization_permissions.sql",
    "202608290001_preview_mobile_scoring_authority_recovery.sql",
  ];
  for (const name of names) psqlFile(cluster, database, path.join(migrationsDirectory, name));
}

function seedFixture(cluster, database) {
  const holes = Array.from({ length: 18 }, (_, index) => ({
    hole_number: index + 1,
    par: 4,
    stroke_index: index + 1,
    yardage: 400 + index,
  }));
  const fingerprint = createHash("sha256").update("preview-mobile-scoring-fixture").digest("hex");
  psql(cluster, database, `
    insert into scoring_authority.tournaments
      (tournament_id, tournament_year, name, source_workbook_id, scoring_authority)
    values ('2026', 2026, 'Synthetic Preview', 'synthetic-preview-workbook', 'SUPABASE');
    insert into scoring_authority.teams (tournament_id, team_id, team_side, name)
    values ('2026', 'T1', 1, 'Team One'), ('2026', 'T2', 2, 'Team Two');
    insert into scoring_authority.players (player_id, display_name) values
      ('P1', 'Player One'), ('P2', 'Player Two'), ('P3', 'Player Three'),
      ('P4', 'Player Four'), ('P9', 'Unassigned Player');
    insert into scoring_authority.tournament_players
      (tournament_id, player_id, team_id, team_side, source_roster_key)
    values
      ('2026', 'P1', 'T1', 1, 'P1'), ('2026', 'P2', 'T1', 1, 'P2'),
      ('2026', 'P3', 'T2', 2, 'P3'), ('2026', 'P4', 'T2', 2, 'P4'),
      ('2026', 'P9', 'T2', 2, 'P9');
    insert into scoring_authority.rounds (tournament_id, round_number, format, name, status)
    values ('2026', 1, 'BB', 'Round 1', 'LIVE');
    insert into scoring_authority.scoring_snapshots
      (snapshot_id, tournament_id, match_id, snapshot_revision, scoring_rules_version, format,
       course_id, tee, rating, slope, par, match_netting_baseline, hole_definitions,
       participant_configuration, team_configuration, canonical_hash)
    values
      ('M1:S1', '2026', 'M1', 1, 'v1', 'BB', 'C1', 'Blue', 72, 125, 72, 'LOW',
       ${jsonSql(holes)}, '{}'::jsonb, '{}'::jsonb, ${sqlLiteral(fingerprint)}),
      ('MF:S1', '2026', 'MF', 1, 'v1', 'BB', 'C1', 'Blue', 72, 125, 72, 'LOW',
       ${jsonSql(holes)}, '{}'::jsonb, '{}'::jsonb, ${sqlLiteral(fingerprint)}),
      ('M2:S1', '2026', 'M2', 1, 'v1', 'BB', 'C1', 'Blue', 72, 125, 72, 'LOW',
       ${jsonSql(holes)}, '{}'::jsonb, '{}'::jsonb, ${sqlLiteral(fingerprint)});
    insert into scoring_authority.matches
      (match_id, tournament_id, round_number, format, scoring_snapshot_id, status,
       scoring_locked, permission_revision, match_revision, scored_holes, current_hole,
       holes_remaining, team_1_holes_won, team_2_holes_won, running_result,
       result_winner, scorecard_complete)
    values
      ('M1', '2026', 1, 'BB', 'M1:S1', 'LIVE', false, 7, 10, 0, 0, 18, 0, 0, 'Scheduled', '', false),
      ('M2', '2026', 1, 'BB', 'M2:S1', 'LIVE', false, 7, 10, 0, 0, 18, 0, 0, 'Scheduled', '', false),
      ('MF', '2026', 1, 'BB', 'MF:S1', 'LIVE', false, 7, 18, 18, 18, 0, 18, 0,
       'Team 1 wins 18 UP', 'Team 1', true);
    insert into scoring_authority.match_participants
      (match_id, player_id, team_side, player_slot, playing_handicap, final_strokes)
    select match_id, player_id, team_side, player_slot, 0, 0
    from (values
      ('M1', 'P1', 1, 1), ('M1', 'P2', 1, 2), ('M1', 'P3', 2, 1), ('M1', 'P4', 2, 2),
      ('M2', 'P1', 1, 1), ('M2', 'P2', 1, 2), ('M2', 'P3', 2, 1), ('M2', 'P4', 2, 2),
      ('MF', 'P1', 1, 1), ('MF', 'P2', 1, 2), ('MF', 'P3', 2, 1), ('MF', 'P4', 2, 2)
    ) fixture(match_id, player_id, team_side, player_slot);
    insert into scoring_authority.scoring_permissions
      (match_id, player_id, can_score, permission_revision)
    select match_id, player_id, true, 7
    from (values
      ('M1', 'P1'), ('M1', 'P2'), ('M2', 'P1'), ('MF', 'P1')
    ) fixture(match_id, player_id);
    insert into scoring_authority.match_holes
      (match_id, hole_number, snapshot_id, stroke_index, par, yardage)
    select match_id, hole_number, match_id || ':S1', hole_number, 4, 400 + hole_number
    from (values ('M1'), ('M2'), ('MF')) matches(match_id)
    cross join generate_series(1, 18) holes(hole_number);
    insert into scoring_authority.hole_scores
      (match_id, hole_number, hole_revision, team_1_gross_scores, team_2_gross_scores,
       team_1_strokes, team_2_strokes, team_1_net_score, team_2_net_score,
       hole_winner, mutation_key, actor_id)
    select 'MF', hole_number, 1, '[4,5]'::jsonb, '[5,6]'::jsonb,
      '[0,0]'::jsonb, '[0,0]'::jsonb, 4, 5, 'Team 1', 'seed-mf-' || hole_number, 'P1'
    from generate_series(1, 18) holes(hole_number);
    insert into scoring_authority.ingress_gates
      (tournament_id, state, authority, updated_by)
    values ('2026', 'OPEN', 'SUPABASE', 'integration-test');
  `);
}

function identity(matchId = "M1", playerId = "P1") {
  return {
    authUserId,
    playerId,
    tournamentId: "2026",
    context: {
      membership: { active: true },
      matches: [{
        matchId,
        round: 1,
        format: "BB",
        status: "LIVE",
        scoringLocked: false,
        matchRevision: matchId === "MF" ? 18 : 10,
        canScore: true,
        permissionRevision: 7,
      }],
    },
  };
}

function holeRequest(overrides = {}) {
  return {
    matchId: "M1",
    holeNumber: 2,
    teamOneGrossScores: [4, 5],
    teamTwoGrossScores: [5, 6],
    mutationId: "11111111-1111-4111-8111-111111111111",
    expectedMatchRevision: 10,
    expectedHoleRevision: 0,
    ...overrides,
  };
}

function decision({ allowed = true, code = "AUTHORIZED", revision = 7, matchId = "M1", playerId = "P1" } = {}) {
  return { payload: {
    allowed,
    code,
    match_id: matchId,
    player_id: playerId,
    permission_revision: revision,
  } };
}

function dependencies(env, decisionValue = decision()) {
  return {
    scoringAuthorityEnvironment: () => ({ resolved: "supabase" }),
    requireScoringReadSource: () => ({ resolved: "supabase" }),
    authorizeMatchAccess: async () => decisionValue,
    persistParticipantScore: (input) => persistParticipantScore({ ...input, env }),
  };
}

function directInput(rpcInput, overrides = {}) {
  return {
    ...structuredClone(rpcInput),
    ...overrides,
    authorization: {
      ...structuredClone(rpcInput.authorization),
      ...(overrides.authorization || {}),
    },
  };
}

test("Preview mobile scoring authority and same-ID recovery are safe in PostgreSQL 17", {
  timeout: 120_000,
}, async (t) => {
  if (!(await allBinariesAvailable())) {
    t.skip(`PostgreSQL 17 toolchain is unavailable at ${pgBin}`);
    return;
  }

  const cluster = await createCluster();
  const database = "preview_mobile_scoring_recovery";
  runCommand(postgresBinaries.createdb, [database], { env: psqlEnvironment(cluster) });
  installSupabaseCompatibility(cluster, database);
  installPreviewScoringMigrations(cluster, database);
  seedFixture(cluster, database);

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
    let canonicalHoleInput;
    await t.test("authorized mobile adapter reaches the real Preview hole RPC", async () => {
      const result = await mobileScoringHoleResult(identity(), holeRequest(), {
        dependencies: dependencies(previewEnv),
      });
      canonicalHoleInput = rpcCalls.find((call) => call.name === "submit_hole_score_authoritative")?.input;
      assert.ok(canonicalHoleInput);
      assert.equal(canonicalHoleInput.authorization.passport_verified, true);
      assert.equal(canonicalHoleInput.authorization.production_verified, false);
      assert.equal(canonicalHoleInput.authorization.auth_user_id, authUserId);
      assert.equal(canonicalHoleInput.authorization.player_id, "P1");
      assert.equal(result.body.data.accepted, true);
      assert.equal(result.body.data.idempotent, false);
      assert.equal(psql(cluster, database, "select count(*) from scoring_authority.score_mutations where match_id='M1';"), "1");
    });

    await t.test("same ID remains recoverable through the mobile adapter after mutable denial", async () => {
      psql(cluster, database, `
        update scoring_authority.matches set permission_revision=8 where match_id='M1';
        update scoring_authority.scoring_permissions set can_score=false, revoked_at=now(), permission_revision=8
        where match_id='M1' and player_id='P1';
      `);
      const revokedReplay = await mobileScoringHoleResult(identity(), holeRequest(), {
        dependencies: dependencies(previewEnv, decision({
          allowed: false,
          code: "SCORING_PERMISSION_REVOKED",
          revision: 8,
        })),
      });
      assert.equal(revokedReplay.body.data.accepted, true);
      assert.equal(revokedReplay.body.data.idempotent, true);
      await assert.rejects(() => mobileScoringHoleResult(identity(), holeRequest({
        mutationId: "22222222-2222-4222-8222-222222222222",
      }), {
        dependencies: dependencies(previewEnv, decision({
          allowed: false,
          code: "SCORING_PERMISSION_REVOKED",
          revision: 8,
        })),
      }), (error) => error.code === "SCORING_NOT_AUTHORIZED");
      const revokedNew = rpc(cluster, database, "submit_hole_score_authoritative", directInput(canonicalHoleInput, {
        mutation_key: "22222222-2222-4222-8222-222222222222",
      }));
      assert.equal(revokedNew.code, "UNAUTHORIZED");

      psql(cluster, database, `
        update scoring_authority.matches set scoring_locked=true where match_id='M1';
        update scoring_authority.scoring_permissions set can_score=true, revoked_at=null where match_id='M1' and player_id='P1';
      `);
      const lockedReplay = await mobileScoringHoleResult(identity(), holeRequest(), {
        dependencies: dependencies(previewEnv, decision({ allowed: false, code: "MATCH_LOCKED", revision: 8 })),
      });
      assert.equal(lockedReplay.body.data.idempotent, true);
      const lockedNew = rpc(cluster, database, "submit_hole_score_authoritative", directInput(canonicalHoleInput, {
        mutation_key: "33333333-3333-4333-8333-333333333333",
        authorization: { permission_revision: 8 },
      }));
      assert.equal(lockedNew.code, "SCORING_LOCKED");

      psql(cluster, database, "update scoring_authority.matches set scoring_locked=false, status='FINAL' where match_id='M1';");
      const finalReplay = await mobileScoringHoleResult(identity(), holeRequest(), {
        dependencies: dependencies(previewEnv, decision({ allowed: false, code: "MATCH_FINAL", revision: 8 })),
      });
      assert.equal(finalReplay.body.data.idempotent, true);
      const finalNew = rpc(cluster, database, "submit_hole_score_authoritative", directInput(canonicalHoleInput, {
        mutation_key: "44444444-4444-4444-8444-444444444444",
        authorization: { permission_revision: 8 },
      }));
      assert.equal(finalNew.code, "MATCH_FINAL");
      assert.equal(psql(cluster, database, "select count(*) from scoring_authority.score_mutations where match_id='M1';"), "1");
    });

    await t.test("same ID with different intent conflicts through the mobile adapter", async () => {
      await assert.rejects(() => mobileScoringHoleResult(identity(), holeRequest({
        teamOneGrossScores: [3, 5],
      }), {
        dependencies: dependencies(previewEnv, decision({ allowed: false, code: "MATCH_FINAL", revision: 8 })),
      }), (error) => error.code === "IDEMPOTENCY_CONFLICT");
      const conflict = rpc(cluster, database, "submit_hole_score_authoritative", directInput(canonicalHoleInput, {
        team_1_gross_scores: [3, 5],
      }));
      assert.equal(conflict.ok, false);
      assert.equal(conflict.code, "IDEMPOTENCY_CONFLICT");
    });

    await t.test("wrong participant cannot recover through the mobile adapter", async () => {
      await assert.rejects(() => mobileScoringHoleResult(identity("M1", "P2"), holeRequest(), {
        dependencies: dependencies(previewEnv, decision({ playerId: "P2", revision: 8 })),
      }), (error) => error.code === "SCORING_NOT_AUTHORIZED");
      await assert.rejects(() => mobileScoringHoleResult(identity("M1", "P9"), holeRequest(), {
        dependencies: dependencies(previewEnv, decision({ playerId: "P9", revision: 8 })),
      }), (error) => error.code === "SCORING_NOT_AUTHORIZED");
    });

    await t.test("wrong Match boundary, passport, and identifier cannot recover the receipt", () => {
      const wrongActor = rpc(cluster, database, "submit_hole_score_authoritative", directInput(canonicalHoleInput, {
        authorization: { player_id: "P2" },
      }));
      assert.equal(wrongActor.code, "UNAUTHORIZED");
      const nonparticipant = rpc(cluster, database, "submit_hole_score_authoritative", directInput(canonicalHoleInput, {
        authorization: { player_id: "P9" },
      }));
      assert.equal(nonparticipant.code, "UNAUTHORIZED");
      const wrongMatchBoundary = rpc(cluster, database, "submit_hole_score_authoritative", directInput(canonicalHoleInput, {
        authorization: { match_id: "M2" },
      }));
      assert.equal(wrongMatchBoundary.code, "UNAUTHORIZED");
      const invalidIdentity = rpc(cluster, database, "submit_hole_score_authoritative", directInput(canonicalHoleInput, {
        authorization: { passport_verified: false },
      }));
      assert.equal(invalidIdentity.code, "UNAUTHORIZED");
      const invalidMutation = rpc(cluster, database, "submit_hole_score_authoritative", directInput(canonicalHoleInput, {
        mutation_key: "invalid mutation id",
      }));
      assert.equal(invalidMutation.code, "INVALID_REQUEST");
    });

    await t.test("authorized mobile adapter reaches the real Preview finalization RPC", async () => {
      const result = await mobileScoringFinalizeResult(identity("MF"), {
        matchId: "MF",
        mutationId: "finalize:MF:18",
        expectedMatchRevision: 18,
      }, {
        dependencies: dependencies(previewEnv, {
          payload: {
            allowed: true,
            code: "AUTHORIZED",
            match_id: "MF",
            player_id: "P1",
            permission_revision: 7,
          },
        }),
      });
      const finalization = rpcCalls.find((call) => call.name === "finalize_match_authoritative");
      assert.ok(finalization);
      assert.equal(finalization.input.authorization.passport_verified, true);
      assert.equal(finalization.input.authorization.production_verified, false);
      assert.equal(result.body.data.accepted, true);
      assert.equal(result.body.data.match.status, "completed");
      assert.equal(psql(cluster, database, "select status from scoring_authority.matches where match_id='MF';"), "FINAL");
      const wrongParticipant = rpc(cluster, database, "finalize_match_authoritative", directInput(finalization.input, {
        mutation_key: "finalize:MF:wrong-participant",
        authorization: { player_id: "P2" },
      }));
      assert.equal(wrongParticipant.code, "UNAUTHORIZED");
    });

    await t.test("effective Preview RPC remains service-role-only", () => {
      const privileges = JSON.parse(psql(cluster, database, `select json_build_object(
        'service', has_function_privilege('service_role', 'public.submit_hole_score_authoritative(jsonb)', 'EXECUTE'),
        'innerService', has_function_privilege('service_role', 'public.submit_hole_score_authoritative_phase2_inner(jsonb)', 'EXECUTE'),
        'anon', has_function_privilege('anon', 'public.submit_hole_score_authoritative(jsonb)', 'EXECUTE'),
        'authenticated', has_function_privilege('authenticated', 'public.submit_hole_score_authoritative(jsonb)', 'EXECUTE')
      )::text;`));
      assert.deepEqual(privileges, { service: true, innerService: false, anon: false, authenticated: false });
    });
  } finally {
    globalThis.fetch = originalFetch;
    await destroyCluster(cluster);
  }
});
