// Proof layer: SQL / FAILURE_INJECTION. No external database can be supplied.
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createIsolatedCluster, createDatabase, destroyIsolatedCluster, sql,
  sqlResult, sqlFile, jsonLiteral, repositoryRoot } from "./support/reliability/postgres17.mjs";
import { installRelease139Schema, installRelease139FunctionCandidates,
  installCertifiedSqlRepairs } from "./support/reliability/release139-schema.mjs";
import { seedSyntheticTournament } from "./support/reliability/synthetic-tournament.mjs";
import { seedSyntheticSideGameHistory } from "./support/reliability/synthetic-history.mjs";
import { reusableScoreInput } from "./support/reliability/benchmark-operations.mjs";
import { extractSqlFunction } from "./support/reliability/sql-source.mjs";

test("NA-2026-019 canonical score avoids irrelevant historical fingerprint execution under Release139", { timeout: process.env.BAGGER_RELIABILITY_EXTENDED_SETUP === "1" ? 600000 : 120000 }, async () => {
  const cluster = await createIsolatedCluster();
  try {
    createDatabase(cluster, "na019");
    await installRelease139Schema(cluster, "na019");
    installRelease139FunctionCandidates(cluster, "na019");
    seedSyntheticTournament(cluster, "na019");
    const setupStarted = Date.now();
    seedSyntheticSideGameHistory(cluster, "na019", 10);
    installCertifiedSqlRepairs(cluster, "na019");
    if (process.env.BAGGER_RELIABILITY_EXTENDED_SETUP === "1") {
      sql(cluster, "na019", "alter database na019 set statement_timeout='1s'", { role: "" });
      console.log(JSON.stringify({ fixtureSetupMs: Date.now()-setupStarted, measuredStatementTimeoutMs: 1000, scope: "NA019_10X_SYNTHETIC_SETUP_NOT_SCORE_LATENCY" }));
    }
    assert.equal(sql(cluster, "na019", "select count(*) from scoring_authority.calcutta_v1_recalculation_jobs"), "7450");
    assert.equal(sql(cluster, "na019", "select count(*) from production_control.late_r3_calcutta_compatibility_v1"), "0");
    // A failure-injection spy, not a candidate function change. It turns any
    // attempt to evaluate irrelevant consumed-history work into direct evidence.
    // Stable volatility is retained: the 2026 failure included planner evaluation.
    sql(cluster, "na019", `create or replace function production_control.late_r3_consumed_fingerprint_v1()
      returns text language plpgsql stable security definer set search_path=pg_catalog as $spy$
      begin raise exception 'NA_2026_IRRELEVANT_HISTORY_EVALUATED'; end $spy$;`, { role: "" });
    const score = `begin; select public.submit_production_hole_score(${jsonLiteral(reusableScoreInput)}); rollback;`;
    const current = JSON.parse(sql(cluster, "na019", score));
    assert.equal(current.ok, true, JSON.stringify(current));
    assert.equal(current.code, "ACCEPTED", "Exercise a real score mutation, not replay or no-op");
    assert.ok(current.gross && current.strokes && current.net);

    const old = extractSqlFunction(path.join(repositoryRoot, "supabase/production_migrations/202609090097_production_late_r3_initialization_v1.sql"),
      "create function production_control.late_r3_result_compatible_v1(")
      .replace(/^create function/i, "create or replace function");
    sql(cluster, "na019", old, { role: "" });
    const historical = sqlResult(cluster, "na019", score);
    assert.notEqual(historical.status, 0, "Historical implementation must evaluate the sentinel");
    assert.match(historical.stderr, /NA_2026_IRRELEVANT_HISTORY_EVALUATED/);

    sqlFile(cluster, "na019", path.join(repositoryRoot, "supabase/production_migrations/202609270120_bounded_late_r3_result_compatibility_v1.sql"), { role: "" });
    const repaired = JSON.parse(sql(cluster, "na019", score));
    assert.equal(repaired.ok, true);
    assert.equal(repaired.code, "ACCEPTED");
    assert.deepEqual(repaired.gross, current.gross);
    assert.deepEqual(repaired.strokes, current.strokes);
    assert.deepEqual(repaired.net, current.net);
  } finally { await destroyIsolatedCluster(cluster); }
});
