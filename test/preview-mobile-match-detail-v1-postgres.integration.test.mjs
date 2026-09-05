import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { mobileMatchesResult } from "../lib/mobile-v1-tournament-reads.js";
import { mobileMatchDetailResult } from "../lib/mobile-v1-match-detail.js";
import { assertMobileV1Schema } from "./support/mobile-v1-schema-validator.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(repositoryRoot, "supabase", "migrations");
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const postgresBinaries = Object.fromEntries(
  ["createdb", "initdb", "pg_ctl", "psql"].map((name) => [name, path.join(pgBin, name)]),
);

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
  assert.ok(line, "The Preview Match Detail RPC must return JSON.");
  return JSON.parse(line);
}

function rpc(cluster, database, input, { role = "service_role" } = {}) {
  assert.match(role, /^(service_role|authenticated|anon)$/);
  return parseJsonOutput(psql(
    cluster,
    database,
    `set role ${role}; select public.read_preview_mobile_match_detail_v1(${jsonSql(input)})::text; reset role;`,
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
  const clusterRoot = await mkdtemp("/tmp/bagger-match-detail-pg17-");
  const dataDirectory = path.join(clusterRoot, "data");
  const socketDirectory = path.join(clusterRoot, "socket");
  const logFile = path.join(clusterRoot, "postgres.log");
  const port = await availablePort();
  await mkdir(socketDirectory, { mode: 0o700 });
  runCommand(postgresBinaries.initdb, [
    "-D", dataDirectory, "--username=postgres", "--auth=trust", "--no-locale", "--encoding=UTF8",
  ]);
  runCommand(postgresBinaries.pg_ctl, [
    "-D", dataDirectory, "-l", logFile,
    "-o", `-F -k ${socketDirectory} -h '' -p ${port}`, "-w", "start",
  ]);
  return { clusterRoot, dataDirectory, socketDirectory, logFile, port, started: true };
}

async function destroyCluster(cluster) {
  if (cluster.started) {
    runCommand(postgresBinaries.pg_ctl, [
      "-D", cluster.dataDirectory, "-m", "fast", "-w", "stop",
    ]);
    cluster.started = false;
  }
  assert.equal(path.dirname(cluster.clusterRoot), "/tmp");
  assert.match(path.basename(cluster.clusterRoot), /^bagger-match-detail-pg17-/);
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

function installRequiredMigrations(cluster, database) {
  for (const name of [
    "202608120001_preview_scoring_authority_schema.sql",
    "202608120004_preview_scoring_authority_course_handicap_precision.sql",
    "202608120005_preview_scoring_authority_playing_handicap_precision.sql",
    "202608120012_preview_participant_identity_foundation.sql",
    "202608120013_preview_participant_identity_pgcrypto.sql",
    "202608120014_preview_single_participant_auth_rehearsal.sql",
    "202608120015_preview_single_participant_auth_diagnostics.sql",
    "202608120016_preview_single_participant_auth_email_confirmation.sql",
    "202608120017_preview_game_center_reads.sql",
    "202608120024_preview_participant_home_reads.sql",
    "202608120025_preview_tournament_live_reads.sql",
    "202608120026_preview_tournament_published_context.sql",
    "202609030001_preview_mobile_match_detail_v1.sql",
    "202609040001_preview_mobile_opaque_match_id_contract.sql",
    "202609050001_preview_mobile_scramble_team_hcp.sql",
  ]) {
    psqlFile(cluster, database, path.join(migrationsDirectory, name));
  }
}

function holeDefinitions() {
  return Array.from({ length: 18 }, (_, index) => ({
    hole_number: index + 1,
    stroke_index: index + 1,
    par: index % 3 === 0 ? 5 : index % 3 === 1 ? 4 : 3,
    yardage: 340 + (index * 11),
  }));
}

const opaqueSinglesId = "match:round/3#opaque-10";

const fixtures = [
  { id: "BB-Z", round: 1, format: "BB", sort: 1, display: "10", status: "UPCOMING", players: [["P2", 1, 1, "7.5", 0], ["P3", 1, 2, "11.2", 4], ["P4", 2, 1, "8.0", 1], ["P5", 2, 2, "12.1", 5]] },
  { id: "BB-MY", round: 1, format: "BB", sort: 2, display: "2", status: "UPCOMING", players: [["P1", 1, 1, "10.4", 2], ["P3", 1, 2, "11.2", 4], ["P4", 2, 1, "8.0", 1], ["P5", 2, 2, "12.1", 5]] },
  { id: "SC-MY", round: 2, format: "SC", sort: 1, display: "1", status: "LIVE", players: [["P1", 1, 1, "10.4", 0], ["P3", 1, 2, "11.2", 0], ["P4", 2, 1, "8.0", 0], ["P5", 2, 2, "12.1", 0]] },
  { id: "SC-A", round: 2, format: "SC", sort: 2, display: "10", status: "LIVE", players: [["P2", 1, 1, "7.5", 0], ["P3", 1, 2, "11.2", 0], ["P4", 2, 1, "8.0", 0], ["P5", 2, 2, "12.1", 0]] },
  { id: "SI-Z", round: 3, format: "SI", sort: 1, display: "1", status: "FINAL", players: [["P2", 1, 1, "7.5", 0], ["P4", 2, 1, "8.0", 1]] },
  { id: opaqueSinglesId, round: 3, format: "SI", sort: 2, display: "10", status: "FINAL", players: [["P2", 1, 1, "17.0", 4], ["P4", 2, 1, "12.9", 0]], rich: true },
  { id: "SI-MY", round: 3, format: "SI", sort: 3, display: "2", status: "FINAL", players: [["P1", 1, 1, "10.4", 2], ["P5", 2, 1, "12.1", 0]] },
];

function seedFixture(cluster, database, matchFixtures = fixtures) {
  const holes = holeDefinitions();
  psql(cluster, database, `
    insert into scoring_authority.tournaments
      (tournament_id, tournament_year, name, source_workbook_id, scoring_authority)
    values
      ('2026', 2026, 'Synthetic Preview Invitational', 'preview-workbook', 'SUPABASE'),
      ('2027', 2027, 'Wrong Preview Invitational', 'wrong-workbook', 'SUPABASE');
    insert into scoring_authority.teams (tournament_id, team_id, team_side, name)
    values
      ('2026', 'T1', 1, 'Team One'), ('2026', 'T2', 2, 'Team Two'),
      ('2027', 'WT1', 1, 'Wrong Team One'), ('2027', 'WT2', 2, 'Wrong Team Two');
    insert into scoring_authority.players (player_id, display_name)
    values
      ('P1', 'Authenticated Player'), ('P2', 'Player Two'), ('P3', 'Player Three'),
      ('P4', 'Player Four'), ('P5', 'Player Five'), ('PI', 'Inactive Player'),
      ('PW', 'Wrong Tournament Player');
    insert into scoring_authority.tournament_players
      (tournament_id, player_id, team_id, team_side, participation_status, source_roster_key)
    values
      ('2026', 'P1', 'T1', 1, 'ACTIVE', 'P1'),
      ('2026', 'P2', 'T1', 1, 'ACTIVE', 'P2'),
      ('2026', 'P3', 'T1', 1, 'ACTIVE', 'P3'),
      ('2026', 'P4', 'T2', 2, 'ACTIVE', 'P4'),
      ('2026', 'P5', 'T2', 2, 'ACTIVE', 'P5'),
      ('2026', 'PI', 'T1', 1, 'INACTIVE', 'PI'),
      ('2027', 'PW', 'WT1', 1, 'ACTIVE', 'PW');
    insert into scoring_authority.rounds
      (tournament_id, round_number, format, name, status)
    values
      ('2026', 1, 'BB', 'Best Ball', 'UPCOMING'),
      ('2026', 2, 'SC', 'Scramble', 'LIVE'),
      ('2026', 3, 'SI', 'Singles', 'FINAL'),
      ('2027', 1, 'SI', 'Wrong Round', 'UPCOMING');
  `);

  const snapshotRows = matchFixtures.map((fixture) => {
    const teamConfiguration = fixture.format === "SC" ? {
      team_1_playing_handicap: 3.5,
      team_2_playing_handicap: 1.0,
      team_1_strokes: 2,
      team_2_strokes: 0,
    } : {};
    return `(${sqlLiteral(`${fixture.id}:S1`)}, '2026', ${sqlLiteral(fixture.id)}, 1, 'v1', ${sqlLiteral(fixture.format)},
      'OC', 'Gold', 74.7, 150, 72, 'LOW', ${jsonSql(holes)}, '{}'::jsonb,
      ${jsonSql(teamConfiguration)}, ${sqlLiteral("a".repeat(64))})`;
  }).join(",\n");
  psql(cluster, database, `
    insert into scoring_authority.scoring_snapshots
      (snapshot_id, tournament_id, match_id, snapshot_revision, scoring_rules_version,
       format, course_id, tee, rating, slope, par, match_netting_baseline,
       hole_definitions, participant_configuration, team_configuration, canonical_hash)
    values ${snapshotRows};
  `);

  const matchRows = matchFixtures.map((fixture) => {
    const scored = fixture.rich ? 18 : 0;
    const current = fixture.rich ? 18 : 0;
    const remaining = fixture.rich ? 0 : 18;
    const teamOne = fixture.rich ? 7 : 0;
    const result = fixture.rich ? "Team 1 wins 7 & 5" : fixture.status === "LIVE" ? "All square through 0" : "Scheduled";
    const winner = fixture.rich ? "Team 1" : "";
    return `(${sqlLiteral(fixture.id)}, '2026', ${fixture.round}, ${sqlLiteral(fixture.format)},
      ${sqlLiteral(`${fixture.id}:S1`)}, ${sqlLiteral(fixture.status)}, ${scored}, ${current}, ${remaining},
      ${teamOne}, 0, ${sqlLiteral(result)}, ${sqlLiteral(winner)},
      ${fixture.rich ? "true" : "false"}, ${fixture.rich ? "true" : "false"},
      '2026-08-11T19:10:00Z'::timestamptz, ${fixture.rich ? "'2026-08-11T19:10:00Z'::timestamptz" : "null"})`;
  }).join(",\n");
  psql(cluster, database, `
    insert into scoring_authority.matches
      (match_id, tournament_id, round_number, format, scoring_snapshot_id, status,
       scored_holes, current_hole, holes_remaining, team_1_holes_won, team_2_holes_won,
       running_result, result_winner, clinched, scorecard_complete,
       authority_updated_at, finalized_at)
    values ${matchRows};
  `);

  const participantRows = matchFixtures.flatMap((fixture) => fixture.players.map(
    ([player, side, slot, handicap, strokes]) => `(${sqlLiteral(fixture.id)}, ${sqlLiteral(player)}, ${side}, ${slot}, ${handicap}, ${strokes})`,
  )).join(",\n");
  psql(cluster, database, `
    insert into scoring_authority.match_participants
      (match_id, player_id, team_side, player_slot, playing_handicap, final_strokes)
    values ${participantRows};
  `);

  const presentationRows = matchFixtures.map((fixture) => `(
    ${sqlLiteral(fixture.id)}, '2026', 'The Ocean Course', 'ocean.svg', '6793',
    '10:10 AM', '1', ${sqlLiteral(fixture.display)}, ${fixture.sort},
    'team-one.svg', '#123456', '#abcdef', 'team-two.svg', '#654321', '#fedcba',
    'Kiawah Island', 'tournament.svg', 'Live', 'America/New_York',
    'preview-workbook', '2026-08-11T19:00:00Z'::timestamptz, ${sqlLiteral("b".repeat(64))}, 'integration-test'
  )`).join(",\n");
  psql(cluster, database, `
    insert into scoring_authority.game_center_presentations
      (match_id, tournament_id, course_name, course_logo, course_yardage,
       tee_time, starting_hole, display_match_number, match_sort_order,
       team_1_logo, team_1_primary_color, team_1_secondary_color,
       team_2_logo, team_2_primary_color, team_2_secondary_color,
       tournament_location, tournament_logo, tournament_status, tournament_time_zone,
       source_workbook_id, source_updated_at, source_payload_hash, imported_by)
    values ${presentationRows};
    insert into scoring_authority.match_holes
      (match_id, hole_number, snapshot_id, stroke_index, par, yardage)
    select fixture.id, hole.number, fixture.id || ':S1', hole.number,
      case when hole.number % 3 = 1 then 5 when hole.number % 3 = 2 then 4 else 3 end,
      340 + (hole.number * 11)
    from (values ${matchFixtures.map((fixture) => `(${sqlLiteral(fixture.id)})`).join(",")}) fixture(id)
    cross join pg_catalog.generate_series(1, 18) hole(number);
  `);

  const scoreRows = Array.from({ length: 18 }, (_, index) => {
    const hole = index + 1;
    const winner = hole <= 6 || hole === 13 ? "Team 1" : "Halved";
    return `(${sqlLiteral(opaqueSinglesId)}, ${hole}, 99, '[4]'::jsonb, '[5]'::jsonb, '[0]'::jsonb, '[0]'::jsonb,
      4, 5, ${sqlLiteral(winner)}, ${sqlLiteral(`private-mutation-${hole}`)}, 'private-actor',
      '2026-08-11T19:${String(hole).padStart(2, "0")}:00Z'::timestamptz,
      '2026-08-11T19:${String(hole).padStart(2, "0")}:00Z'::timestamptz)`;
  }).join(",\n");
  psql(cluster, database, `
    insert into scoring_authority.hole_scores
      (match_id, hole_number, hole_revision, team_1_gross_scores, team_2_gross_scores,
       team_1_strokes, team_2_strokes, team_1_net_score, team_2_net_score,
       hole_winner, mutation_key, actor_id, created_at, updated_at)
    values ${scoreRows};
  `);
}

test("Scramble published Team HCP passes through real Preview SQL into both mobile endpoint projections", {
  timeout: 120_000,
}, async (t) => {
  if (!(await allBinariesAvailable())) {
    t.skip(`PostgreSQL 17 toolchain is unavailable at ${pgBin}`);
    return;
  }
  const cluster = await createCluster();
  const database = "preview_scramble_team_hcp";
  try {
    runCommand(postgresBinaries.createdb, [database], { env: psqlEnvironment(cluster) });
    installSupabaseCompatibility(cluster, database);
    installRequiredMigrations(cluster, database);
    // Seed only the disposable local database. No remote data or auth is used.
    const scrambleTemplate = fixtures.find(({ id }) => id === "SC-A");
    const extraScrambles = ["SC-THREE", "SC-FOUR", "2026-R2-5", " match:round/2#🦅 "]
      .map((id, index) => ({ ...scrambleTemplate, id, sort: index + 3, display: String(index + 3) }));
    seedFixture(cluster, database, [...fixtures, ...extraScrambles]);
    // The existing SQL-only seed uses a "Scheduled" placeholder. The mobile
    // schema requires unavailable Upcoming status text to be null instead.
    psql(cluster, database, "update scoring_authority.matches set running_result = '' where status = 'UPCOMING';");
    const target = "2026-R2-5";
    const opaque = extraScrambles.at(-1).id;
    const input = { environment: "PREVIEW", tournament_id: "2026", player_id: "P1" };
    const now = new Date("2026-09-05T12:00:00Z");
    const publish = (display) => psql(cluster, database, `
      insert into scoring_authority.participant_home_presentations
        (tournament_id, presentation, source_workbook_id, source_fingerprint, imported_by)
      values ('2026', ${jsonSql({ tournament: { status: "Live", currentRound: 2 }, tournamentMatchDisplay: display })},
        'preview-workbook', '${"c".repeat(64)}', 'local-regression')
      on conflict (tournament_id) do update set presentation = excluded.presentation;
    `);
    const projections = async (matchId, playerId = "P1") => {
      const liveRead = parseJsonOutput(psql(cluster, database,
        "set role service_role; select public.read_tournament_live_view('2026')::text; reset role;"));
      const identity = { tournamentId: "2026", playerId };
      const collection = await mobileMatchesResult(identity, { now, dependencies: {
        requireTournamentReadSource: () => ({ resolved: "supabase" }),
        readTournamentLiveView: async () => ({ payload: liveRead }),
        readGuideProjection: async () => ({ payload: { ok: true, data: {} } }),
        applyGuideCoursesToTournament: (value) => value,
      } });
      const raw = rpc(cluster, database, { ...input, player_id: playerId, match_id: matchId });
      const detail = await mobileMatchDetailResult(identity, matchId, { now, dependencies: {
        readMobilePreviewMatchDetailV1: async () => ({ payload: raw }),
      } });
      await assertMobileV1Schema("matches", collection.body);
      await assertMobileV1Schema("match-detail", detail.body);
      const listed = collection.body.data.matches.find((match) => match.matchId === matchId);
      assert.ok(listed);
      assert.equal(detail.body.data.match.matchId, listed.matchId);
      return { listed, detail, raw };
    };
    const teamHcp = (match) => match.teams.map((team) => team.playingHandicap);
    const teamStrokes = (match) => match.teams.map((team) => team.strokesReceived);
    const withoutTeamHcp = (data) => {
      const copy = structuredClone(data);
      copy.match.teams.forEach((team) => { delete team.playingHandicap; });
      return copy;
    };
    psql(cluster, database, `
      update scoring_authority.scoring_snapshots set team_configuration =
        team_configuration || '{"team_1_playing_handicap":null,"team_2_playing_handicap":null}'::jsonb
      where match_id = ${sqlLiteral(target)};
    `);
    publish({ [target]: { team1PlayingHcp: 3.0, team2PlayingHcp: 1.0, team1Stroke: 2, team2Stroke: 0 } });
    // Capture the real old RPC response, then replace only the read projection.
    psqlFile(cluster, database, path.join(migrationsDirectory, "202609040001_preview_mobile_opaque_match_id_contract.sql"));
    const before = await projections(target);
    const beforeBB = await projections("BB-Z");
    const beforeSI = await projections(opaqueSinglesId);
    assert.deepEqual(teamHcp(before.listed), [3, 1]);
    assert.deepEqual(teamHcp(before.detail.body.data.match), [null, null]);
    const fingerprint = () => psql(cluster, database, `
      select jsonb_build_object(
        'snapshots', (select md5(jsonb_agg(to_jsonb(v) order by v.snapshot_id collate "C")::text) from scoring_authority.scoring_snapshots v),
        'participants', (select md5(jsonb_agg(to_jsonb(v) order by v.match_id collate "C", v.team_side, v.player_slot)::text) from scoring_authority.match_participants v),
        'scores', (select md5(jsonb_agg(to_jsonb(v) order by v.match_id collate "C", v.hole_number)::text) from scoring_authority.hole_scores v),
        'published', (select md5(jsonb_agg(to_jsonb(v) order by v.tournament_id)::text) from scoring_authority.participant_home_presentations v)
      )::text;
    `);
    const beforeMigration = fingerprint();
    psqlFile(cluster, database, path.join(migrationsDirectory, "202609050001_preview_mobile_scramble_team_hcp.sql"));
    await t.test("Round 2 Match 5/6: HCP 3/1, strokes 2/0, only two response values change", async () => {
      const after = await projections(target);
      assert.deepEqual(teamHcp(after.listed), [3, 1]);
      assert.deepEqual(teamHcp(after.detail.body.data.match), [3, 1]);
      assert.deepEqual(teamStrokes(after.listed), [2, 0]);
      assert.deepEqual(teamStrokes(after.detail.body.data.match), [2, 0]);
      assert.equal(after.raw.navigation.round_match_index, 5);
      assert.equal(after.raw.navigation.round_match_count, 6);
      assert.deepEqual(withoutTeamHcp(after.detail.body.data), withoutTeamHcp(before.detail.body.data));
      assert.notEqual(after.detail.revision, before.detail.revision, "HCP change invalidates the old ETag revision");
      assert.equal((await projections(target)).detail.revision, after.detail.revision, "unchanged response retains ETag revision");
      assert.equal(fingerprint(), beforeMigration, "migration and reads must not change stored values");
    });
    await t.test("Best Ball and Singles participant HCP and every other response field remain unchanged", async () => {
      assert.deepEqual((await projections("BB-Z")).detail.body, beforeBB.detail.body);
      assert.deepEqual((await projections(opaqueSinglesId)).detail.body, beforeSI.detail.body);
    });
    for (const [label, published, expected] of [
      ["published overrides non-null snapshot", { team1PlayingHcp: 3, team2PlayingHcp: 1 }, [3, 1]],
      ["numeric zero is preserved", { team1PlayingHcp: 0, team2PlayingHcp: 0 }, [0, 0]],
      ["negative and fractional values are not rounded or calculated", { team1PlayingHcp: -1.25, team2PlayingHcp: 2.375 }, [-1.25, 2.375]],
      ["null falls back identically to snapshot", { team1PlayingHcp: null, team2PlayingHcp: null }, [3.5, 1]],
      ["missing falls back identically to snapshot", {}, [3.5, 1]],
      ["side-specific fallback", { team1PlayingHcp: 0, team2PlayingHcp: null }, [0, 1]],
    ]) {
      await t.test(label, async () => {
        publish({ "SC-A": published });
        const result = await projections("SC-A");
        assert.deepEqual(teamHcp(result.listed), expected);
        assert.deepEqual(teamHcp(result.detail.body.data.match), expected);
        assert.deepEqual(teamStrokes(result.detail.body.data.match), [2, 0]);
      });
    }
    await t.test("owned/non-owned and exact whitespace/reserved/non-BMP keys use the same published authority", async () => {
      publish({ [opaque]: { team1PlayingHcp: 6.25, team2PlayingHcp: 0 },
        [opaque.trim()]: { team1PlayingHcp: 99, team2PlayingHcp: 99 } });
      for (const player of ["P1", "P2"]) {
        const result = await projections(opaque, player);
        assert.deepEqual(teamHcp(result.listed), [6.25, 0]);
        assert.deepEqual(teamHcp(result.detail.body.data.match), [6.25, 0]);
        assert.equal(result.detail.body.data.match.authenticatedPlayer.involved, player === "P2");
        assert.deepEqual(teamStrokes(result.detail.body.data.match), [2, 0]);
      }
    });
    await t.test("missing publication stays null with absent snapshot HCP; no derivation", async () => {
      publish({});
      const result = await projections(target);
      assert.deepEqual(teamHcp(result.listed), [null, null]);
      assert.deepEqual(teamHcp(result.detail.body.data.match), [null, null]);
    });
    await t.test("another tournament's same Match key cannot supply Team HCP", async () => {
      psql(cluster, database, `insert into scoring_authority.participant_home_presentations
        (tournament_id, presentation, source_workbook_id, source_fingerprint, imported_by)
        values ('2027', ${jsonSql({ tournamentMatchDisplay: { [target]: { team1PlayingHcp: 99, team2PlayingHcp: 99 } } })},
          'wrong-workbook', '${"d".repeat(64)}', 'local-regression');`);
      const result = await projections(target);
      assert.deepEqual(teamHcp(result.detail.body.data.match), [null, null]);
      assert.deepEqual(rpc(cluster, database, { ...input, player_id: "PI", match_id: target }),
        { ok: false, code: "PREVIEW_PARTICIPANT_MATCH_DETAIL_REQUIRED" });
      assert.deepEqual(rpc(cluster, database, { ...input, tournament_id: "2027", player_id: "PW", match_id: target }),
        { ok: false, code: "MATCH_DETAIL_NOT_FOUND" });
    });
  } finally {
    await destroyCluster(cluster);
  }
});

const exactOpaqueCases = [
  ["leading whitespace", " leading"],
  ["trailing whitespace", "trailing "],
  ["internal spaces", "match with internal spaces"],
  ["whitespace-only ID", " "],
  ["tabs and line breaks", "\tmatch\n"],
  ["slash", "/"],
  ["hash", "#"],
  ["colon", ":"],
  ["reserved combination", "match:round/2#opaque"],
  ["literal percent encoding", "%2F"],
  ["literal double percent encoding", "%252F"],
  ["backslash", "match\\opaque"],
  ["non-BMP Unicode", "match:🦅"],
  ["200 BMP scalar values", "x".repeat(200)],
  ["200 non-BMP scalar values / 400 UTF-16 units", "🦅".repeat(200)],
  ["200 mixed scalar values / 300 UTF-16 units", "x".repeat(100) + "🦅".repeat(100)],
  ["untrimmed collision baseline", "same"],
  ["untrimmed leading collision", " same"],
  ["untrimmed trailing collision", "same "],
  ["composed Unicode", "é"],
  ["decomposed Unicode", "e\u0301"],
  ["Next.js query prefix", "nxtPmatchId"],
  ["Next.js interception prefix", "nxtImatchId"],
];

test("Preview SQL preserves the canonical exact opaque Match-ID contract", {
  timeout: 120_000,
}, async (t) => {
  if (!(await allBinariesAvailable())) {
    t.skip(`PostgreSQL 17 toolchain is unavailable at ${pgBin}`);
    return;
  }
  const cluster = await createCluster();
  const database = "preview_mobile_exact_opaque_ids";
  try {
    runCommand(postgresBinaries.createdb, [database], { env: psqlEnvironment(cluster) });
    installSupabaseCompatibility(cluster, database);
    installRequiredMigrations(cluster, database);
    const opaqueFixtures = exactOpaqueCases.map(([, id], index) => ({
      id, round: 3, format: "SI", sort: index + 4,
      display: String(index + 20), status: "UPCOMING",
      players: [["P1", 1, 1, "10.4", 2], ["P4", 2, 1, "8.0", 1]],
    }));
    seedFixture(cluster, database, [...fixtures, ...opaqueFixtures]);
    const input = { environment: "PREVIEW", tournament_id: "2026", player_id: "P1" };
    const live = parseJsonOutput(psql(cluster, database,
      "set role service_role; select public.read_tournament_live_view('2026')::text; reset role;"));
    assert.equal(live.ok, true);
    const projectedIds = live.data.matches.map((entry) => entry.match.match_id);

    const readOnlyFingerprint = () => psql(cluster, database, `
      select jsonb_build_object(
        'matches', (select md5(jsonb_agg(to_jsonb(v) order by v.match_id collate "C")::text) from scoring_authority.matches v),
        'scores', (select md5(jsonb_agg(to_jsonb(v) order by v.match_id collate "C", v.hole_number)::text) from scoring_authority.hole_scores v),
        'snapshots', (select md5(jsonb_agg(to_jsonb(v) order by v.snapshot_id collate "C")::text) from scoring_authority.scoring_snapshots v),
        'permissions', (select md5(coalesce(jsonb_agg(to_jsonb(v))::text, '[]')) from scoring_authority.scoring_permissions v),
        'audit', (select md5(coalesce(jsonb_agg(to_jsonb(v))::text, '[]')) from scoring_authority.audit_events v)
      )::text;
    `);
    const beforeReads = readOnlyFingerprint();
    for (const [label, id] of exactOpaqueCases) {
      await t.test(`exact /matches → Match Detail round-trip: ${label}`, () => {
        const projected = projectedIds.find((candidate) => candidate === id);
        assert.equal(projected, id);
        const detail = rpc(cluster, database, { ...input, match_id: projected });
        assert.equal(detail.ok, true);
        assert.equal(detail.match.match_id, id);
        assert.deepEqual(Buffer.from(detail.match.match_id, "utf8"), Buffer.from(id, "utf8"));
        assert.equal(detail.navigation.is_my_match, false);
        // Canonical navigation carries the same exact neighboring strings.
        const position = opaqueFixtures.findIndex((fixture) => fixture.id === id);
        assert.equal(detail.navigation.previous_match_id,
          position === 0 ? "SI-MY" : opaqueFixtures[position - 1].id);
        assert.equal(detail.navigation.next_match_id, opaqueFixtures[position + 1]?.id ?? null);
      });
    }

    for (const [label, id] of [
      ["empty", ""], ["dot", "."], ["double dot", ".."],
      ["201 BMP scalars", "x".repeat(201)],
      ["201 non-BMP scalars", "🦅".repeat(201)],
      ["null", null], ["number", 7], ["boolean", true], ["array", []], ["object", {}],
    ]) {
      await t.test(`invalid ID rejected by SQL: ${label}`, () => {
        assert.deepEqual(rpc(cluster, database, { ...input, match_id: id }), {
          ok: false, code: "PREVIEW_PARTICIPANT_MATCH_DETAIL_REQUIRED",
        });
      });
    }
    for (const [label, id] of [
      ["NUL", "match\u0000id"],
      ["unpaired high surrogate", "match\ud800"],
      ["unpaired low surrogate", "match\udc00"],
      ["reversed surrogate pair", "\udc00\ud800"],
    ]) {
      await t.test(`invalid Unicode rejected before RPC: ${label}`, () => {
        assert.throws(() => rpc(cluster, database, { ...input, match_id: id }),
          /unsupported Unicode escape sequence|invalid input syntax for type json|Unicode low surrogate|Unicode high surrogate/);
      });
    }
    await t.test("no trimmed or normalized fallback lookup", () => {
      for (const id of ["leading", "trailing", "match", "É"]) {
        assert.deepEqual(rpc(cluster, database, { ...input, match_id: id }), {
          ok: false, code: "MATCH_DETAIL_NOT_FOUND",
        });
      }
    });
    await t.test("opaque owned/non-owned IDs preserve participant and tournament isolation", () => {
      const id = exactOpaqueCases[0][1];
      assert.equal(rpc(cluster, database, { ...input, match_id: id }).participants
        .some((participant) => participant.is_authenticated_player), true);
      assert.equal(rpc(cluster, database, { ...input, player_id: "P2", match_id: id }).participants
        .some((participant) => participant.is_authenticated_player), false);
      assert.deepEqual(rpc(cluster, database, { ...input, player_id: "PI", match_id: id }), {
        ok: false, code: "PREVIEW_PARTICIPANT_MATCH_DETAIL_REQUIRED",
      });
      assert.deepEqual(rpc(cluster, database, {
        ...input, tournament_id: "2027", player_id: "PW", match_id: id,
      }), { ok: false, code: "MATCH_DETAIL_NOT_FOUND" });
    });
    await t.test("service-role-only access, stable security definer, RLS and scoring rows remain unchanged", () => {
      assert.equal(psql(cluster, database, `
        select concat_ws('|',
          has_function_privilege('service_role', 'public.read_preview_mobile_match_detail_v1(jsonb)', 'EXECUTE'),
          has_function_privilege('authenticated', 'public.read_preview_mobile_match_detail_v1(jsonb)', 'EXECUTE'),
          has_function_privilege('anon', 'public.read_preview_mobile_match_detail_v1(jsonb)', 'EXECUTE'));
      `), "t|f|f");
      assert.equal(psql(cluster, database, `
        select concat_ws('|', p.prosecdef, p.provolatile, p.proconfig[1])
        from pg_catalog.pg_proc p where p.oid = 'public.read_preview_mobile_match_detail_v1(jsonb)'::regprocedure;
      `), "t|s|search_path=pg_catalog, scoring_authority, public");
      assert.equal(psql(cluster, database, `
        select bool_and(c.relrowsecurity) from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'scoring_authority' and c.relname in
          ('matches', 'match_participants', 'match_holes', 'hole_scores', 'scoring_snapshots', 'game_center_presentations');
      `), "t");
      assert.equal(readOnlyFingerprint(), beforeReads);
    });
  } finally {
    await destroyCluster(cluster);
  }
});

test("Preview Match Detail RPC compiles and enforces participant-safe canonical reads", {
  timeout: 120_000,
}, async (t) => {
  if (!(await allBinariesAvailable())) {
    t.skip(`PostgreSQL 17 toolchain is unavailable at ${pgBin}`);
    return;
  }

  const cluster = await createCluster();
  const database = "preview_mobile_match_detail_v1";
  try {
    runCommand(postgresBinaries.createdb, [database], { env: psqlEnvironment(cluster) });
    installSupabaseCompatibility(cluster, database);
    installRequiredMigrations(cluster, database);
    seedFixture(cluster, database);

    const input = { environment: "PREVIEW", tournament_id: "2026", player_id: "P1", match_id: opaqueSinglesId };
    const detail = rpc(cluster, database, input);
    assert.equal(detail.ok, true);
    assert.deepEqual(Object.keys(detail).sort(), [
      "holes", "match", "navigation", "ok", "participants", "presentation",
      "round", "scores", "snapshot", "teams", "tournament",
    ]);
    assert.equal(detail.tournament.tournament_id, "2026");
    assert.equal(detail.round.format, "SI");
    assert.equal(detail.match.running_result, "Team 1 wins 7 & 5");
    assert.equal(Date.parse(detail.match.authority_updated_at), Date.parse("2026-08-11T19:10:00Z"));
    assert.equal(Date.parse(detail.match.finalized_at), Date.parse("2026-08-11T19:10:00Z"));
    assert.deepEqual(detail.navigation, {
      round_match_index: 2,
      round_match_count: 3,
      previous_match_id: "SI-Z",
      next_match_id: "SI-MY",
      my_match_id: "SI-MY",
      is_my_match: false,
    });
    assert.equal(detail.presentation.display_match_number, "10");
    assert.equal(detail.presentation.course_yardage, "6793");
    assert.equal(detail.snapshot.course_id, "OC");
    assert.equal(detail.snapshot.rating, 74.7);
    assert.equal(detail.snapshot.slope, 150);
    assert.equal(detail.holes.length, 18);
    assert.equal(detail.scores.length, 18);
    assert.deepEqual(detail.holes.map((hole) => hole.hole_number), Array.from({ length: 18 }, (_, index) => index + 1));
    assert.deepEqual(Object.keys(detail.scores[0]).sort(), [
      "hole_number", "hole_winner", "team_1_gross_scores", "team_1_net_score",
      "team_1_strokes", "team_2_gross_scores", "team_2_net_score",
      "team_2_strokes", "updated_at",
    ]);
    assert.deepEqual(detail.scores[0].team_1_gross_scores, [4]);
    assert.deepEqual(detail.scores[0].team_1_strokes, [0]);
    assert.equal(detail.participants.some((player) => player.is_authenticated_player), false);
    assert.equal(Buffer.byteLength(JSON.stringify(detail), "utf8") < 128 * 1024, true);

    const serialized = JSON.stringify(detail);
    for (const forbidden of [
      "permission_revision", "match_revision", "hole_revision", "mutation_key",
      "private-mutation", "actor_id", "private-actor", "unresolved_mutations",
      "course_handicap", "handicap_index", "read_diagnostics", "query_ms",
    ]) assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));

    const owned = rpc(cluster, database, { ...input, match_id: "SI-MY" });
    assert.equal(owned.navigation.is_my_match, true);
    assert.equal(owned.navigation.my_match_id, "SI-MY");
    assert.equal(owned.navigation.previous_match_id, opaqueSinglesId);
    assert.equal(owned.navigation.next_match_id, null);
    assert.equal(owned.participants.filter((player) => player.is_authenticated_player).length, 1);

    const bestBall = rpc(cluster, database, { ...input, match_id: "BB-Z" });
    assert.equal(bestBall.round.format, "BB");
    assert.deepEqual(bestBall.navigation, {
      round_match_index: 1,
      round_match_count: 2,
      previous_match_id: null,
      next_match_id: "BB-MY",
      my_match_id: "BB-MY",
      is_my_match: false,
    });
    assert.equal(bestBall.participants[0].playing_handicap, 7.5);
    assert.equal(bestBall.participants[1].final_strokes, 4);

    const scramble = rpc(cluster, database, { ...input, match_id: "SC-A" });
    assert.equal(scramble.round.format, "SC");
    assert.deepEqual(scramble.snapshot.team_configuration, {
      team_1_playing_handicap: 3.5,
      team_2_playing_handicap: 1.0,
      team_1_strokes: 2,
      team_2_strokes: 0,
    });
    assert.equal(scramble.navigation.previous_match_id, "SC-MY");
    assert.equal(scramble.navigation.next_match_id, null);
    assert.equal(scramble.navigation.my_match_id, "SC-MY");

    for (const deniedInput of [
      { ...input, environment: "PRODUCTION" },
      { ...input, player_id: "PI" },
      { ...input, player_id: "PW" },
      { ...input, tournament_id: "2027" },
      { ...input, player_id: "" },
    ]) {
      const denied = rpc(cluster, database, deniedInput);
      assert.deepEqual(denied, { ok: false, code: "PREVIEW_PARTICIPANT_MATCH_DETAIL_REQUIRED" });
    }
    assert.deepEqual(rpc(cluster, database, { ...input, match_id: "UNKNOWN" }), {
      ok: false, code: "MATCH_DETAIL_NOT_FOUND",
    });
    assert.deepEqual(rpc(cluster, database, {
      environment: "PREVIEW",
      tournament_id: "2027",
      player_id: "PW",
      match_id: opaqueSinglesId,
    }), {
      ok: false, code: "MATCH_DETAIL_NOT_FOUND",
    });

    const privileges = psql(cluster, database, `
      select concat_ws('|',
        has_function_privilege('service_role',
          'public.read_preview_mobile_match_detail_v1(jsonb)', 'EXECUTE'),
        has_function_privilege('authenticated',
          'public.read_preview_mobile_match_detail_v1(jsonb)', 'EXECUTE'),
        has_function_privilege('anon',
          'public.read_preview_mobile_match_detail_v1(jsonb)', 'EXECUTE'));
    `);
    assert.equal(privileges, "t|f|f");
    assert.throws(() => rpc(cluster, database, input, { role: "authenticated" }),
      /permission denied for function read_preview_mobile_match_detail_v1/i);

    // A duplicate canonical sort position is invalid. The RPC must not fall
    // back to Match IDs or display Match numbers to manufacture an order.
    psql(cluster, database, `
      update scoring_authority.game_center_presentations
      set match_sort_order = 2 where match_id = 'SI-MY';
    `);
    assert.deepEqual(rpc(cluster, database, input), {
      ok: false, code: "MATCH_DETAIL_AUTHORITY_INVALID",
    });
    psql(cluster, database, `
      update scoring_authority.game_center_presentations
      set match_sort_order = 3 where match_id = 'SI-MY';
    `);

    // Unsafe oversized score arrays fail closed rather than being truncated.
    psql(cluster, database, `
      update scoring_authority.hole_scores
      set team_1_gross_scores = '[4,5,6]'::jsonb
      where match_id = ${sqlLiteral(opaqueSinglesId)} and hole_number = 1;
    `);
    assert.deepEqual(rpc(cluster, database, input), {
      ok: false, code: "MATCH_DETAIL_AUTHORITY_INVALID",
    });
  } finally {
    await destroyCluster(cluster);
  }
});
