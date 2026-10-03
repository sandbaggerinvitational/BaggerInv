import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { collectTimedSqlSamples } from "./benchmark-result-validation.mjs";

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), "../../..",
);

function discoverPostgresBin() {
  if (process.env.BAGGER_RELIABILITY_PG_BIN) {
    assert.ok(path.isAbsolute(process.env.BAGGER_RELIABILITY_PG_BIN),
      "BAGGER_RELIABILITY_PG_BIN must be an absolute local directory");
    return path.normalize(process.env.BAGGER_RELIABILITY_PG_BIN);
  }
  const homebrew = "/opt/homebrew/opt/postgresql@17/bin";
  const configured = spawnSync("pg_config", ["--bindir"], {
    encoding: "utf8", env: { PATH: process.env.PATH || "" },
  });
  const candidates = [homebrew];
  if (configured.status === 0 && path.isAbsolute(configured.stdout.trim())) {
    candidates.push(path.normalize(configured.stdout.trim()));
  }
  return candidates.find((candidate) => {
    const version = spawnSync(path.join(candidate, "postgres"), ["--version"],
      { encoding: "utf8" });
    return version.status === 0 && /PostgreSQL\) 17\./.test(version.stdout);
  }) || homebrew;
}

export const postgresBin = discoverPostgresBin();
export const binaries = Object.freeze(Object.fromEntries(
  ["createdb", "dropdb", "initdb", "pg_ctl", "psql", "postgres"].map(
    (name) => [name, path.join(postgresBin, name)],
  ),
));

const prefix = "bagger-reliability-pg17-";
const clusterMarker = Symbol("isolated-reliability-cluster");
const databaseNamePattern = /^[a-z][a-z0-9_]{0,62}$/;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    const error = new Error([
      command,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
    error.result = result;
    throw error;
  }
  return result.stdout.trim();
}

export function runResult(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
}

function assertOwnedCluster(cluster) {
  assert.equal(cluster?.marker, clusterMarker, "isolated cluster object required");
  const resolved = path.resolve(cluster.directory);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.match(path.basename(resolved), /^bagger-reliability-pg17-/);
  assert.equal(path.resolve(cluster.socket), path.join(resolved, "socket"));
  return cluster;
}

function cleanEnvironment(cluster, role = "service_role", extras = {}) {
  assertOwnedCluster(cluster);
  const environment = { ...process.env };
  for (const name of [
    "DATABASE_URL", "DIRECT_URL", "PGDATABASE", "PGHOST", "PGHOSTADDR",
    "PGPASSWORD", "PGPORT", "PGSERVICE", "PGSERVICEFILE", "PGUSER",
    "POSTGRES_URL", "POSTGRES_PRISMA_URL", "SUPABASE_DB_URL",
  ]) delete environment[name];
  return {
    ...environment,
    PGHOST: cluster.socket,
    PGPORT: String(cluster.port),
    PGUSER: "postgres",
    PGOPTIONS: role ? `-c request.jwt.claim.role=${role}` : "",
    ...extras,
  };
}

export async function postgres17Available() {
  try {
    await Promise.all(Object.values(binaries).map((filename) =>
      access(filename, fsConstants.X_OK)));
    return true;
  } catch {
    return false;
  }
}

export async function createIsolatedCluster() {
  assert.ok(await postgres17Available(), "PostgreSQL 17 binaries are required");
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const data = path.join(directory, "data");
  const socket = path.join(directory, "socket");
  const log = path.join(directory, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  const cluster = {
    marker: clusterMarker,
    directory,
    data,
    socket,
    log,
    port: 60400 + (process.pid % 500),
    started: false,
  };
  try {
    run(binaries.initdb, [
      "-D", data,
      "--username=postgres",
      "--auth=trust",
      "--no-locale",
      "--encoding=UTF8",
      "--set=shared_memory_type=mmap",
      "--set=dynamic_shared_memory_type=mmap",
    ], {
      // initdb starts a bootstrap backend before the generated configuration is
      // available. Force that backend onto mmap too, so this isolated fixture
      // does not consume a host-wide System V shared-memory identifier.
      env: cleanEnvironment(cluster, "", {
        PGOPTIONS: "-c shared_memory_type=mmap -c dynamic_shared_memory_type=mmap",
      }),
    });
    run(binaries.pg_ctl, [
      "-D", data,
      "-l", log,
      "-o", `-F -k ${socket} -h '' -p ${cluster.port} -c shared_buffers=32MB -c max_connections=20`,
      "-w", "start",
    ]);
    cluster.started = true;
    const version = sql(cluster, "postgres", "show server_version_num", { role: "" });
    assert.match(version, /^17\d{4}$/, `PostgreSQL 17 required, found ${version}`);
    return cluster;
  } catch (error) {
    if (cluster.started) {
      runResult(binaries.pg_ctl, ["-D", data, "-m", "immediate", "-w", "stop"]);
    }
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function destroyIsolatedCluster(cluster) {
  assertOwnedCluster(cluster);
  if (cluster.started) {
    run(binaries.pg_ctl, ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
    cluster.started = false;
  }
  await rm(cluster.directory, { recursive: true, force: true });
}

// Test-only physical process restart. Ownership is verified before pg_ctl; no
// URL/host argument is accepted. This is not a power-loss durability claim.
export function restartIsolatedCluster(cluster) {
  assertOwnedCluster(cluster);
  assert.equal(cluster.started, true, 'Only the owned running fixture may restart');
  run(binaries.pg_ctl, ['-D', cluster.data, '-m', 'fast', '-w', 'stop']);
  cluster.started = false;
  run(binaries.pg_ctl, ['-D', cluster.data, '-l', cluster.log,
    '-o', `-F -k ${cluster.socket} -h '' -p ${cluster.port} -c shared_buffers=32MB -c max_connections=20`,
    '-w', 'start']);
  cluster.started = true;
  assert.match(sql(cluster, 'postgres', 'show server_version_num', {role: ''}), /^17\d{4}$/);
}

export function createDatabase(cluster, database, { template } = {}) {
  assertOwnedCluster(cluster);
  assert.match(database, databaseNamePattern);
  const args = template ? ["-T", template, database] : [database];
  return run(binaries.createdb, args, { env: cleanEnvironment(cluster, "") });
}

export function sql(cluster, database, input, { role = "service_role" } = {}) {
  assertOwnedCluster(cluster);
  assert.match(database, databaseNamePattern);
  return run(binaries.psql, [
    "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-h", cluster.socket, "-p", String(cluster.port), "-U", "postgres",
    "-d", database,
  ], { env: cleanEnvironment(cluster, role), input });
}

export function sqlResult(cluster, database, input, { role = "service_role" } = {}) {
  assertOwnedCluster(cluster);
  assert.match(database, databaseNamePattern);
  return runResult(binaries.psql, [
    "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-h", cluster.socket, "-p", String(cluster.port), "-U", "postgres",
    "-d", database,
  ], { env: cleanEnvironment(cluster, role), input });
}

export function timedSqlSamples(cluster, database, statement, count,
  { role = "service_role", setup = "", validateResult } = {}) {
  assertOwnedCluster(cluster);
  assert.match(database, databaseNamePattern);
  assert.ok(Number.isInteger(count) && count >= 1 && count <= 1000);
  assert.ok(typeof statement === "string" && statement.trim() !== "");
  assert.equal(typeof validateResult, "function", "Every timed SQL sample requires semantic validation");
  const marker = `BAGGER_LOCAL_SAMPLE_${process.pid}`;
  const sample = index => `\\timing off
\\set QUIET 1
begin;
${setup}
\\echo ${marker}_${index + 1}_BEGIN
\\timing on
${statement.replace(/;\s*$/, "")};
\\timing off
\\echo ${marker}_${index + 1}_END
rollback;`;
  const result = runResult(binaries.psql, [
    "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-h", cluster.socket, "-p", String(cluster.port), "-U", "postgres",
    "-d", database,
  ], {
    env: cleanEnvironment(cluster, role),
    input: Array.from({ length: count }, (_, index) => sample(index)).join("\n"),
  });
  // Capture output only in this process. Validation occurs after psql timing;
  // raw payloads are neither logged nor attached to errors/evidence.
  return collectTimedSqlSamples(result, { count, marker, validateResult });
}

export function sqlFile(cluster, database, filename, { role = "service_role" } = {}) {
  assertOwnedCluster(cluster);
  assert.match(database, databaseNamePattern);
  assert.ok(path.resolve(filename).startsWith(repositoryRoot + path.sep),
    "SQL file must be inside this checkout");
  return run(binaries.psql, [
    "-X", "-q", "-v", "ON_ERROR_STOP=1",
    "-h", cluster.socket, "-p", String(cluster.port), "-U", "postgres",
    "-d", database, "-f", filename,
  ], { env: cleanEnvironment(cluster, role) });
}

export async function clusterLog(cluster) {
  assertOwnedCluster(cluster);
  return readFile(cluster.log, "utf8");
}

export function jsonLiteral(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

// A single private socket session lets a real SQL claim, JS calculator and SQL
// completion share one rolled-back benchmark transaction. No URL/host argument.
export function openSqlSession(cluster, database) {
  assertOwnedCluster(cluster);
  assert.match(database, databaseNamePattern);
  const child = spawn(binaries.psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-h", cluster.socket, "-p", String(cluster.port), "-U", "postgres", "-d", database],
    { cwd: repositoryRoot, env: cleanEnvironment(cluster), stdio: ["pipe", "pipe", "pipe"] });
  let pending = null, output = "", errors = "", counter = 0, exited = false;
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  const fail = error => {
    if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = null; }
  };
  child.on("error", fail);
  child.stdin.on("error", fail);
  child.on("close", code => {
    exited = true;
    fail(new Error(`Owned SQL session closed (${code}): ${errors.slice(-4000)}`));
    resolveClosed(code);
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => { errors = (errors + chunk).slice(-16000); });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", chunk => {
    output += chunk;
    if (output.length > 16 * 1024 * 1024) {
      fail(new Error("Owned SQL session response exceeded 16 MiB")); child.kill("SIGTERM"); return;
    }
    if (!pending) return;
    const boundary = output.indexOf(pending.marker + "\n");
    if (boundary < 0) return;
    const result = output.slice(0, boundary).trim();
    output = output.slice(boundary + pending.marker.length + 1);
    const request = pending; pending = null; clearTimeout(request.timer); request.resolve(result);
  });
  return {
    query(statement) {
      assertOwnedCluster(cluster);
      assert.equal(exited, false, "Owned SQL session already closed");
      assert.equal(pending, null, "Only one SQL query may be in flight");
      assert.equal(typeof statement, "string");
      const marker = `__BAGGER_LOCAL_SQL_${process.pid}_${++counter}__`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { fail(new Error("Owned SQL session exceeded 30 seconds")); child.kill("SIGTERM"); }, 30000);
        pending = { marker, resolve, reject, timer };
        child.stdin.write(statement.replace(/;\s*$/, "") + `;\n\\echo ${marker}\n`);
      });
    },
    async close() {
      if (!exited) { child.stdin.end("\\q\n"); }
      await closed;
    },
  };
}

export function deterministicUuid(namespace, value) {
  const source = `${namespace}:${value}`;
  let hash = 2166136261;
  let out = "";
  for (let index = 0; index < 32; index += 1) {
    const code = source.charCodeAt(index % source.length);
    hash ^= code + index;
    hash = Math.imul(hash, 16777619) >>> 0;
    out += (hash & 15).toString(16);
  }
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-4${out.slice(13, 16)}-8${out.slice(17, 20)}-${out.slice(20, 32)}`;
}
