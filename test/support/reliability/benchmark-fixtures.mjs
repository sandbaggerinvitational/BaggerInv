import assert from "node:assert/strict";
import { createDatabase, sql } from "./postgres17.mjs";
import { installCertifiedSqlRepairs } from "./release139-schema.mjs";
import {
  actualCounts, seedSyntheticSideGameHistory, targetCounts,
} from "./synthetic-history.mjs";
import { seedSyntheticArchivedYears } from "./synthetic-archived-years.mjs";

export const primaryFixtureVariant = "SYNTHETIC_CURRENT_WITH_SCALED_HISTORY";
export const preparationFixtureVariant =
  "SYNTHETIC_PRE_SIDE_GAME_TEMPLATE";

// The template is cloned before scaled side-game history is seeded. This
// validates that PREPARE uses an already valid pre-side-game lifecycle without
// altering the installed dependency guard or rewriting current side-game rows.
export function assertPreparationLifecycleVariant(cluster, database) {
  const dependencies = JSON.parse(sql(cluster, database, `select
    production_control.tournament_setup_dependency_codes_v1(
      null,null,3,'2026-R3-12','SCORING_CONTEXT')`, { role: "" }));
  const sideGameDependencies = dependencies.filter((code) =>
    /^(CALCUTTA|NET_SKINS|ODDS)_/.test(code));
  assert.deepEqual(sideGameDependencies, [],
    "pre-side-game template must have no active side-game dependency");
  return {
    variant: preparationFixtureVariant,
    installedDependencyGuard: "UNCHANGED",
    sideGameDependencies,
    selection: "CLONED_BEFORE_SCALED_SIDE_GAME_HISTORY_SEED",
  };
}

export function benchmarkDatabaseForOperation(operationId, databases) {
  assert.ok(databases?.primaryDatabase && databases?.preparationDatabase);
  if (operationId === "prepare-match") {
    return { database: databases.preparationDatabase,
      fixtureVariant: preparationFixtureVariant };
  }
  return { database: databases.primaryDatabase,
    fixtureVariant: primaryFixtureVariant };
}

// Shared by latency and query-plan capture so both use byte-identical fixture
// selection and seeding. The caller owns one already-initialized template in
// the same private cluster; this helper accepts no host, URL, or connection.
export function initializeBenchmarkScaleVariants(cluster, scale) {
  const primaryDatabase = `rel139_scale_${scale}`;
  const preparationDatabase = `rel139_prepare_${scale}`;
  createDatabase(cluster, primaryDatabase, { template: "rel139_template" });
  createDatabase(cluster, preparationDatabase, { template: "rel139_template" });
  seedSyntheticSideGameHistory(cluster, primaryDatabase, scale);
  installCertifiedSqlRepairs(cluster, primaryDatabase);
  installCertifiedSqlRepairs(cluster, preparationDatabase);
  const counts = actualCounts(cluster, primaryDatabase);
  assert.deepEqual(counts, targetCounts(scale));
  const archivedCounts = seedSyntheticArchivedYears(cluster, primaryDatabase, scale);
  const preparationArchivedCounts = seedSyntheticArchivedYears(
    cluster, preparationDatabase, scale);
  const preparationFixture = assertPreparationLifecycleVariant(
    cluster, preparationDatabase);
  return {
    primaryDatabase, preparationDatabase, counts, archivedCounts,
    preparationArchivedCounts, preparationFixture,
  };
}
