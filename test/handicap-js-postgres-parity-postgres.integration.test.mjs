import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  courseHandicap,
  playingHandicaps,
  roundPostgresNumeric,
} from "../lib/prediction-engine.js";

const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const bin = Object.fromEntries(["initdb", "pg_ctl", "psql"]
  .map((name) => [name, path.join(pgBin, name)]));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error([command, result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

async function available() {
  try {
    await Promise.all(Object.values(bin).map((value) => access(value, fsConstants.X_OK)));
    return true;
  } catch {
    return false;
  }
}

async function createCluster() {
  const directory = await mkdtemp("/tmp/bagger-handicap-parity-pg-");
  const data = path.join(directory, "data");
  const socket = path.join(directory, "socket");
  const log = path.join(directory, "postgres.log");
  const port = 60000 + (process.pid % 1000);
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, ["-D", data, "--username=postgres", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  run(bin.pg_ctl, ["-D", data, "-l", log, "-o", `-F -k ${socket} -h '' -p ${port}`, "-w", "start"]);
  return { directory, data, socket, port, started: true };
}

function sql(cluster, input) {
  return run(bin.psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], {
    env: {
      ...process.env,
      PGHOST: cluster.socket,
      PGPORT: String(cluster.port),
      PGUSER: "postgres",
    },
    input,
  });
}

async function destroyCluster(cluster) {
  if (cluster?.started) run(bin.pg_ctl, ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
  if (cluster?.directory) await rm(cluster.directory, { recursive: true, force: true });
}

test("JavaScript handicap previews match PostgreSQL numeric formulas and final rounding", async (context) => {
  if (!(await available())) {
    context.skip("PostgreSQL 17 Homebrew binaries are not installed.");
    return;
  }

  const migration = await readFile(new URL(
    "../supabase/production_migrations/202608290058_production_handicap_revisions_v1.sql",
    import.meta.url,
  ), "utf8");
  assert.match(migration, /tournament_handicap\s*\* \(snapshot_value\.slope::numeric \/ 113::numeric\)\s*\+ \(snapshot_value\.rating - snapshot_value\.par::numeric\)/);
  assert.match(migration, /\(course\.course_handicap\s*- pg_catalog\.min\(course\.course_handicap\) over \(\)\) \* 0\.9/);
  assert.match(migration, /pg_catalog\.min\(\(value->>'course_handicap'\)::numeric\) \* 0\.35/);

  const cluster = await createCluster();
  context.after(() => destroyCluster(cluster));

  const postgres = JSON.parse(sql(cluster, String.raw`
    with turtle(slot, tournament_handicap) as (
      values (1,12.1::numeric),(2,3.5::numeric),(3,8.2::numeric),(4,-0.8::numeric)
    ), turtle_course as (
      select slot,
        tournament_handicap * (136::numeric / 113::numeric) + (71.9::numeric - 72::numeric) as course_handicap
      from turtle
    ), turtle_bb as (
      select slot, course_handicap,
        round((course_handicap - min(course_handicap) over ()) * 0.9, 0)::integer as strokes
      from turtle_course
    ), divergent(slot, course_handicap) as (
      values (1,4.8::numeric),(2,5.4::numeric),(3,9::numeric),(4,10::numeric)
    ), divergent_bb as (
      select slot,
        round((course_handicap - min(course_handicap) over ()) * 0.9, 0)::integer as strokes
      from divergent
    ), singles(slot, course_handicap) as (
      values (1,4.8::numeric),(2,5.3::numeric)
    ), singles_strokes as (
      select slot,
        round(course_handicap - min(course_handicap) over (), 0)::integer as strokes
      from singles
    ), scramble(team_side, course_handicap) as (
      values (1,-1::numeric),(1,-1::numeric),(2,1::numeric),(2,1::numeric)
    ), scramble_teams as (
      select team_side, round(min(course_handicap) * 0.35 + max(course_handicap) * 0.15, 0)::integer as playing
      from scramble group by team_side
    )
    select jsonb_build_object(
      'rounding', jsonb_build_array(
        round(0.49::numeric,0),round(0.5::numeric,0),round(0.51::numeric,0),
        round(-0.49::numeric,0),round(-0.5::numeric,0),round(-0.51::numeric,0)
      ),
      'divergentBb', (select jsonb_agg(strokes order by slot) from divergent_bb),
      'singles', (select jsonb_agg(strokes order by slot) from singles_strokes),
      'scramblePlaying', (select jsonb_agg(playing order by team_side) from scramble_teams),
      'scrambleStrokes', (select jsonb_agg(playing - (select min(playing) from scramble_teams) order by team_side) from scramble_teams),
      'turtleCourse', (select jsonb_agg(course_handicap order by slot) from turtle_bb),
      'turtleBb', (select jsonb_agg(strokes order by slot) from turtle_bb)
    )::text;
  `));

  assert.deepEqual(
    [0.49, 0.5, 0.51, -0.49, -0.5, -0.51].map(roundPostgresNumeric),
    postgres.rounding.map(Number),
  );

  const divergentCourse = [4.8, 5.4, 9, 10].map((handicap) => courseHandicap(handicap, 72, 113, 72));
  assert.equal(Math.round((Math.round(divergentCourse[1]) - Math.round(divergentCourse[0])) * 0.9), 0);
  assert.deepEqual(playingHandicaps("BB", divergentCourse).playerStrokes, postgres.divergentBb);

  const singlesCourse = [4.8, 5.3].map((handicap) => courseHandicap(handicap, 72, 113, 72));
  assert.deepEqual(playingHandicaps("SI", singlesCourse).playerStrokes, postgres.singles);

  const scramble = playingHandicaps("SC", [-1, -1, 1, 1]);
  assert.deepEqual([scramble.teamA, scramble.teamB], postgres.scramblePlaying);
  assert.deepEqual([scramble.strokesA, scramble.strokesB], postgres.scrambleStrokes);

  const turtleCourse = [12.1, 3.5, 8.2, -0.8].map((handicap) => courseHandicap(handicap, 71.9, 136, 72));
  assert.ok(turtleCourse.every((value, index) => Math.abs(value - Number(postgres.turtleCourse[index])) < 1e-12));
  assert.deepEqual(playingHandicaps("BB", turtleCourse).playerStrokes, postgres.turtleBb);
});
