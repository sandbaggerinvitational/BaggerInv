import assert from "node:assert/strict";
import test from "node:test";
import {
  createDatabase, createIsolatedCluster, destroyIsolatedCluster, jsonLiteral,
  postgres17Available, sql, sqlResult,
} from "./support/reliability/postgres17.mjs";
import {
  installCertifiedSqlRepairs, installRelease139FunctionCandidates,
  installRelease139Schema,
} from "./support/reliability/release139-schema.mjs";
import { seedSyntheticSideGameHistory } from "./support/reliability/synthetic-history.mjs";
import { runtimeScope, seedSyntheticTournament } from "./support/reliability/synthetic-tournament.mjs";

function verboseResult(cluster, database, statement) {
  return sqlResult(cluster, database, `\\set VERBOSITY verbose\n${statement}`);
}

function securitySnapshot(cluster, database) {
  return JSON.parse(sql(cluster, database, `select jsonb_agg(jsonb_build_object(
    'signature',p.oid::regprocedure::text,'owner',p.proowner,'acl',p.proacl,
    'securityDefiner',p.prosecdef,'config',p.proconfig) order by p.oid::regprocedure::text)
    from pg_proc p where p.oid in(
      'public.read_production_net_skins_frozen_2026_v1(jsonb)'::regprocedure,
      'public.claim_production_net_skins_v1_recalculation(jsonb)'::regprocedure,
      'production_control.normalize_production_net_skins_v1_official_result(integer,jsonb)'::regprocedure,
      'public.claim_production_calcutta_v1_recalculation(jsonb)'::regprocedure);`));
}

test("NA-2026-010/012 reproduce real qualifier failures and prove scoped installers", async (t) => {
  assert.equal(await postgres17Available(), true, "PostgreSQL 17 is required");
  const cluster = await createIsolatedCluster();
  t.after(() => destroyIsolatedCluster(cluster));
  createDatabase(cluster, "never_again_sql");
  await installRelease139Schema(cluster, "never_again_sql");
  installRelease139FunctionCandidates(cluster, "never_again_sql");
  seedSyntheticTournament(cluster, "never_again_sql");
  seedSyntheticSideGameHistory(cluster, "never_again_sql", 1);

  const netSkinsCurrent = JSON.parse(sql(cluster, "never_again_sql", `select
    jsonb_build_object(
      'expected_configuration_revision', configuration_revision
    ) from scoring_authority.net_skins_v1_configuration_current
    where tournament_id='2026';`));
  const calcuttaCurrent = JSON.parse(sql(cluster, "never_again_sql", `select
    jsonb_build_object(
      'expected_configuration_revision', configuration_revision,
      'expected_configuration_fingerprint', configuration_fingerprint,
      'expected_auction_revision', auction_revision,
      'expected_auction_fingerprint', auction_fingerprint
    ) from scoring_authority.calcutta_v1_current
    where tournament_id='2026';`));
  const netSkinsClaimInput = runtimeScope({
    ...netSkinsCurrent,
    worker_id: "reliability-net-skins-worker",
    lease_seconds: 60,
    request_fingerprint: "a".repeat(64),
  });
  const calcuttaClaimInput = runtimeScope({
    ...calcuttaCurrent,
    worker_id: "reliability-calcutta-worker",
    lease_seconds: 60,
    request_fingerprint: "b".repeat(64),
  });

  const before = securitySnapshot(cluster, "never_again_sql");
  const oldCalcutta = verboseResult(cluster, "never_again_sql",
    `select public.claim_production_calcutta_v1_recalculation(${jsonLiteral(calcuttaClaimInput)});`);
  assert.notEqual(oldCalcutta.status, 0);
  assert.match(oldCalcutta.stderr, /42883: function pg_catalog\.(?:least|greatest)/);

  const oldNetSkinsClaim = verboseResult(cluster, "never_again_sql",
    `select public.claim_production_net_skins_v1_recalculation(${jsonLiteral(netSkinsClaimInput)});`);
  assert.notEqual(oldNetSkinsClaim.status, 0);
  assert.match(oldNetSkinsClaim.stderr, /42883: function pg_catalog\.(?:least|greatest)/);

  const oldNetSkinsRead = verboseResult(cluster, "never_again_sql",
    `select public.read_production_net_skins_v1(${jsonLiteral(runtimeScope())});`);
  assert.notEqual(oldNetSkinsRead.status, 0);
  assert.match(oldNetSkinsRead.stderr, /42883: function pg_catalog\.(?:least|greatest)/);

  installCertifiedSqlRepairs(cluster, "never_again_sql");
  assert.deepEqual(securitySnapshot(cluster, "never_again_sql"), before,
    "owner, ACL, SECURITY DEFINER and function config must not change");

  const definitions = JSON.parse(sql(cluster, "never_again_sql", `select jsonb_agg(
    pg_get_functiondef(p.oid) order by p.oid::regprocedure::text) from pg_proc p where p.oid in(
      'public.read_production_net_skins_frozen_2026_v1(jsonb)'::regprocedure,
      'public.claim_production_net_skins_v1_recalculation(jsonb)'::regprocedure,
      'production_control.normalize_production_net_skins_v1_official_result(integer,jsonb)'::regprocedure,
      'public.claim_production_calcutta_v1_recalculation(jsonb)'::regprocedure);`));
  assert.ok(definitions.every((definition) => !definition.includes("pg_catalog.least(")
    && !definition.includes("pg_catalog.greatest(")));

  const fixedRead = JSON.parse(sql(cluster, "never_again_sql",
    `select public.read_production_net_skins_v1(${jsonLiteral(runtimeScope())});`));
  assert.equal(fixedRead.ok, true);

  const fixedCalcuttaClaim = JSON.parse(sql(cluster, "never_again_sql",
    `select public.claim_production_calcutta_v1_recalculation(${jsonLiteral(calcuttaClaimInput)});`));
  assert.equal(fixedCalcuttaClaim.ok, true);
  assert.equal(fixedCalcuttaClaim.code, "PRODUCTION_CALCUTTA_V1_RECALCULATION_EMPTY");
  assert.equal(fixedCalcuttaClaim.job, null);

  const fixedNetSkinsClaim = JSON.parse(sql(cluster, "never_again_sql",
    `select public.claim_production_net_skins_v1_recalculation(${jsonLiteral(netSkinsClaimInput)});`));
  assert.equal(fixedNetSkinsClaim.ok, true);
  assert.equal(fixedNetSkinsClaim.code, "PRODUCTION_NET_SKINS_V1_RECALCULATION_EMPTY");
  assert.equal(fixedNetSkinsClaim.job, null);

  for (const statement of [
    "select public.claim_production_calcutta_v1_recalculation('{}'::jsonb);",
    "select public.claim_production_net_skins_v1_recalculation('{}'::jsonb);",
    "select production_control.normalize_production_net_skins_v1_official_result(1,'{}'::jsonb);",
  ]) {
    const fixed = verboseResult(cluster, "never_again_sql", statement);
    assert.notEqual(fixed.status, 0, "malformed request must still fail closed");
    assert.doesNotMatch(fixed.stderr, /42883: function pg_catalog\.(?:least|greatest)/);
  }
});
