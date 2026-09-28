// Local synthetic branch fixtures, not evidence of legitimate late-R3 issuance.
// Uses actual R139 compatibility/score bodies; accepts only an owned PG17 cluster.
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createIsolatedCluster, createDatabase, destroyIsolatedCluster, sql,
  jsonLiteral, deterministicUuid, sqlFile, repositoryRoot } from "./postgres17.mjs";
import { installRelease139Schema, installRelease139FunctionCandidates,
  installCertifiedSqlRepairs } from "./release139-schema.mjs";
import { seedSyntheticTournament, syntheticDirector, syntheticRuntime } from "./synthetic-tournament.mjs";
import { seedSyntheticSideGameHistory, actualCounts, targetCounts } from "./synthetic-history.mjs";

export const eligibleHistoryFixtureVersion = "phase2-eligible-history-v2";
export const candidateMigration = "supabase/production_migrations/202609280121_score_derived_intents_v1.sql";
export const compatibilityVariants = Object.freeze([
  { name: "none", eligible: false, compatible: false, receipts: 0 },
  { name: "current_compatible", eligible: true, compatible: true, receipts: 1 },
  { name: "current_incompatible_consumed", eligible: true, compatible: false, receipts: 1 },
  { name: "current_incompatible_financial", eligible: true, compatible: false, receipts: 1 },
  { name: "stale_source", eligible: true, compatible: false, receipts: 1 },
  { name: "stale_result_binding", eligible: false, compatible: false, receipts: 1 },
  { name: "superseded_result", eligible: false, compatible: false, receipts: 1 },
  { name: "multiple_receipts", eligible: true, compatible: true, receipts: 2 },
].map(Object.freeze));

const textSql = value => `${jsonLiteral(value)}#>>'{}'`;
export function compatibilitySql(binding, sourceSql =
  "production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision('2026'))") {
  assert.match(binding.resultId, /^[a-f0-9-]{36}$/);
  return `select production_control.late_r3_result_compatible_v1(
    (${textSql(binding.resultId)})::uuid,${sourceSql})`;
}

export function eligibilitySql(binding) {
  return `select exists(select 1 from production_control.late_r3_calcutta_compatibility_v1 c
    join scoring_authority.calcutta_v1_result_revisions r on r.result_id=c.result_id
    where r.result_id=(${textSql(binding.resultId)})::uuid and r.is_current
      and r.tournament_id='2026'
      and c.original_result_source_fingerprint=r.source_fingerprint
      and c.policy='late-r3-calculation-neutral-v1')`;
}

// Call once per fresh database. Receipt contents are synthetic proof objects
// inserted by the fixture owner; immutable receipt guards remain installed.
// All variants make the current result source differ from current authority, so
// reads/enqueue cannot avoid compatibility merely by exact source equality.
export function seedCompatibilityVariant(cluster, database, variantName) {
  const variant = compatibilityVariants.find(value => value.name === variantName);
  assert.ok(variant, "unknown compatibility fixture variant");
  assert.equal(sql(cluster, database,
    "select count(*) from production_control.late_r3_calcutta_compatibility_v1"), "0");
  sql(cluster, database, `set session_replication_role=replica;
    with prior as (select production_control.calcutta_v1_source_revision('2026') ||
      jsonb_build_object('synthetic_fixture_prior_source',true) as source)
    update scoring_authority.calcutta_v1_result_revisions r set
      source_fingerprint=production_control.calcutta_v1_hash(prior.source)
    from prior where r.tournament_id='2026' and r.is_current;
    update scoring_authority.calcutta_v1_recalculation_jobs j set
      source_fingerprint=r.source_fingerprint,
      source_revision=production_control.calcutta_v1_source_revision('2026') ||
        jsonb_build_object('synthetic_fixture_prior_source',true)
    from scoring_authority.calcutta_v1_result_revisions r
    where r.tournament_id='2026' and r.is_current and j.job_id=r.job_id;
    set session_replication_role=origin;`, { role: "" });
  const resultId = sql(cluster, database, `select result_id from
    scoring_authority.calcutta_v1_result_revisions where tournament_id='2026'
    and ${variantName === "superseded_result" ? "not is_current" : "is_current"}
    order by result_revision desc limit 1`);
  assert.match(resultId, /^[a-f0-9-]{36}$/);
  const binding = { ...variant, resultId };
  if (variant.receipts) {
    // Keep the complete key short: the shared fixture UUID helper consumes
    // only the first 32 source characters, so a long namespace hides ordinals.
    const operationIds = Array.from({ length: variant.receipts }, (_, i) =>
      deterministicUuid("p2compat", `${compatibilityVariants.indexOf(variant)}:${i + 1}`));
    assert.equal(new Set(operationIds).size, variant.receipts);
    const ordinalRows = operationIds.map((id, i) => `(${i + 1},'${id}'::uuid)`).join(",");
    const staleSource = variantName === "stale_source";
    const badConsumed = variantName === "current_incompatible_consumed";
    const badFinancial = variantName === "current_incompatible_financial";
    const badBinding = variantName === "stale_result_binding";
    sql(cluster, database, `with proof as materialized (
      select production_control.calcutta_v1_source_revision('2026') as source,
        production_control.late_r3_consumed_fingerprint_v1() as consumed,
        production_control.late_r3_financial_fingerprint_v1() as financial
    ), rows(ordinal,operation_id) as (values ${ordinalRows})
    insert into production_control.late_r3_calcutta_compatibility_v1(
      tournament_id,operation_request_id,operation,match_ids,source_before,source_after,
      source_before_fingerprint,source_after_fingerprint,result_id,
      original_result_source_fingerprint,consumed_fingerprint,financial_fingerprint)
    select '2026',rows.operation_id,'SYNTHETIC_BRANCH_FIXTURE',array['2026-R3-12'],
      proof.source || jsonb_build_object('synthetic_fixture_prior_source',true),
      proof.source${staleSource ? " || jsonb_build_object('synthetic_stale_source',true)" : ""},
      production_control.calcutta_v1_hash(proof.source || jsonb_build_object('synthetic_fixture_prior_source',true)),
      production_control.calcutta_v1_hash(proof.source${staleSource ? " || jsonb_build_object('synthetic_stale_source',true)" : ""}),
      r.result_id,${badBinding ? "repeat('0',64)" : "r.source_fingerprint"},
      case when ${badConsumed} or (${variantName === "multiple_receipts"} and rows.ordinal=1)
        then repeat('0',64) else proof.consumed end,
      case when ${badFinancial} then repeat('0',64) else proof.financial end
    from proof cross join rows cross join scoring_authority.calcutta_v1_result_revisions r
    where r.result_id=(${textSql(resultId)})::uuid;`, { role: "" });
  }
  assert.equal(sql(cluster, database, eligibilitySql(binding)), variant.eligible ? "t" : "f");
  assert.equal(sql(cluster, database, compatibilitySql(binding)), variant.compatible ? "t" : "f");
  assert.equal(Number(sql(cluster, database,
    "select count(*) from production_control.late_r3_calcutta_compatibility_v1")), variant.receipts);
  return binding;
}

export async function createEligibleHistoryFixture({ scales = [1, 10], candidate = false } = {}) {
  assert.ok(scales.length > 0 && new Set(scales).size === scales.length);
  scales.forEach(targetCounts);
  const cluster = await createIsolatedCluster();
  try {
    const base = "phase2_eligible_base";
    createDatabase(cluster, base);
    await installRelease139Schema(cluster, base);
    installRelease139FunctionCandidates(cluster, base);
    seedSyntheticTournament(cluster, base);
    installCertifiedSqlRepairs(cluster, base);
    const databases = {}, baselineDatabases = {};
    const candidateEvidence = candidate ? { path: candidateMigration,
      sha256: createHash("sha256").update(await readFile(path.join(repositoryRoot, candidateMigration))).digest("hex") } : null;
    for (const scale of scales) {
      const database = `phase2_eligible_${scale}x`;
      createDatabase(cluster, database, { template: base });
      seedSyntheticSideGameHistory(cluster, database, scale);
      const counts = actualCounts(cluster, database);
      for (const key of ["tournamentPlayers", "matches", "matchParticipants", "holeScores",
        "calcuttaJobs", "calcuttaResults", "calcuttaConfigurationRevisions",
        "calcuttaAuctionRevisions", "calcuttaPublicationRevisions"]) {
        assert.equal(counts[key], targetCounts(scale)[key], `fixture count ${key}`);
      }
      baselineDatabases[scale] = database;
      if (candidate) {
        const candidateDatabase = `phase2_eligible_candidate_${scale}x`;
        createDatabase(cluster, candidateDatabase, { template: database });
        sqlFile(cluster, candidateDatabase, path.join(repositoryRoot, candidateMigration), { role: "" });
        databases[scale] = candidateDatabase;
      } else databases[scale] = database;
    }
    return { cluster, databases, baselineDatabases, counter: 0, metadata: {
      fixture: eligibleHistoryFixtureVersion, source: "PHASE1_184b5c65_R139_FUNCTIONS",
      candidate: candidateEvidence,
      environment: "ISOLATED_LOCAL_POSTGRESQL17", fsync: false, syntheticReceipts: true,
      runtimeSubstitutions: ["assert_production_scoring_runtime", "assert_production_cutover_read_scope"],
      limitations: ["Not legitimate late-R3 lifecycle issuance or hosted admission proof",
        "Financial results are synthetic history, not payout correctness proof",
        "Short warm rollback samples are diagnostic only, not production percentiles"] } };
  } catch (error) { await destroyIsolatedCluster(cluster); throw error; }
}

export function cloneEligibleHistoryDatabase(fixture, scale, variantName) {
  assert.ok(fixture.databases[scale], "missing history scale");
  const database = `p2_eligible_${++fixture.counter}`;
  createDatabase(fixture.cluster, database, { template: fixture.databases[scale] });
  return { database, binding: seedCompatibilityVariant(fixture.cluster, database, variantName) };
}

// Transaction-local failure injection, never used for latency measurements.
export const historicalFingerprintSpySql = `
  create or replace function production_control.late_r3_financial_fingerprint_v1()
  returns text language plpgsql stable security definer set search_path=pg_catalog as $spy$
  begin raise exception 'PHASE2_ELIGIBLE_HISTORY_EVALUATED'; end $spy$;
  create or replace function production_control.late_r3_consumed_fingerprint_v1()
  returns text language plpgsql stable security definer set search_path=pg_catalog as $spy$
  begin raise exception 'PHASE2_ELIGIBLE_HISTORY_EVALUATED'; end $spy$;`;

// Same synthetic Calcutta points/payouts used by the Phase1 real-processor
// harness. Apply BEFORE compatibility receipts: config is financial authority.
export function seedCalcuttaProcessorConfiguration(cluster, database) {
  sql(cluster, database, `begin; set local session_replication_role=replica;
    update scoring_authority.calcutta_v1_configuration_revisions set configuration_manifest=
      jsonb_build_object('point_structure',jsonb_build_array(
        jsonb_build_object('place',1,'round_1_award',10,'round_2_award',20,'round_3_award',30),
        jsonb_build_object('place',2,'round_1_award',5,'round_2_award',10,'round_3_award',15)),
        'payout_structure',jsonb_build_array(jsonb_build_object('place',1,
          'round_1_fraction',0.1,'round_2_fraction',0.1,'round_3_fraction',0.1,'overall_fraction',0.7)))
    where configuration_revision_id=(select configuration_revision_id from scoring_authority.calcutta_v1_current where tournament_id='2026');
    update scoring_authority.calcutta_v1_configuration_revisions set
      configuration_fingerprint=production_control.calcutta_v1_hash(configuration_manifest)
    where configuration_revision_id=(select configuration_revision_id from scoring_authority.calcutta_v1_current where tournament_id='2026');
    update scoring_authority.calcutta_v1_current c set configuration_fingerprint=r.configuration_fingerprint
    from scoring_authority.calcutta_v1_configuration_revisions r where r.configuration_revision_id=c.configuration_revision_id;
    update scoring_authority.calcutta_v1_result_revisions r set configuration_fingerprint=c.configuration_fingerprint
    from scoring_authority.calcutta_v1_current c where r.is_current and r.tournament_id=c.tournament_id;
    update scoring_authority.calcutta_v1_recalculation_jobs j set configuration_fingerprint=c.configuration_fingerprint
    from scoring_authority.calcutta_v1_current c where j.tournament_id=c.tournament_id;
    commit;`, { role: "" });
}

// Explicit opt-in/entry configuration copied from the Phase1 processor fixture.
// Make one BB match Live solely to allow a canonical correction; no Reopen proof.
export function seedNetSkinsProcessorConfiguration(cluster, database) {
  sql(cluster, database, `begin; set local session_replication_role=replica;
    insert into production_control.net_skins_entry_revisions_v1(tournament_id,round_number,revision,
      request_id,request_hash,field_fingerprint,configured,entries,actor_player_id,actor_auth_user_id,created_at,response)
    select '2026',rn,1,md5('processor-entry:'||rn)::uuid,repeat('d',64),
      production_control.tournament_setup_hash_v1(production_control.net_skins_entry_field_v1('2026',rn)),true,
      (select jsonb_agg(item||'{"entered":true}'::jsonb) from jsonb_array_elements(production_control.net_skins_entry_field_v1('2026',rn)) item),
      '${syntheticDirector.playerId}','${syntheticDirector.authUserId}','2026-08-01T00:00:00Z','{}'
    from generate_series(1,2) rn;
    update scoring_authority.net_skins_v1_configuration_revisions set
      configuration_manifest=production_control.full_net_skins_manifest_v2('2026',array[1,2],'{"1":1,"2":1}')
    where configuration_revision_id=(select configuration_revision_id from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026');
    update scoring_authority.net_skins_v1_configuration_revisions set
      configuration_fingerprint=production_control.net_skins_v1_hash(configuration_manifest)
    where configuration_revision_id=(select configuration_revision_id from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026');
    delete from scoring_authority.net_skins_configuration_entries
    where tournament_id='2026';
    delete from scoring_authority.net_skins_configurations
    where tournament_id='2026';
    with manifest as (
      select configuration_revision,configuration_manifest
      from scoring_authority.net_skins_v1_configuration_revisions
      where configuration_revision_id=(select configuration_revision_id
        from scoring_authority.net_skins_v1_configuration_current
        where tournament_id='2026')
    ), rounds as (
      select manifest.configuration_revision,item.round_value
      from manifest cross join lateral
        jsonb_array_elements(manifest.configuration_manifest->'rounds')
          as item(round_value)
    )
    insert into scoring_authority.net_skins_configurations(
      tournament_id,round_number,format,enabled,entry_type,buy_in_per_entry,
      expected_pot,completion_rule,payout_rounding,tie_rule,
      configuration_revision,configuration_fingerprint,source_workbook_id,
      imported_by,imported_at,approved_at,updated_at)
    select '2026',(round_value->>'round_number')::integer,
      round_value->>'format',true,round_value->>'entry_type',
      (round_value->>'buy_in_per_entry')::numeric,
      (round_value->>'expected_pot')::numeric,round_value->>'completion_rule',
      round_value->>'payout_rounding',round_value->>'tie_rule',
      configuration_revision,round_value->>'configuration_fingerprint',
      '${syntheticRuntime.sourceWorkbookId}','reliability-fixture',
      clock_timestamp(),clock_timestamp(),clock_timestamp()
    from rounds;
    with manifest as (
      select configuration_manifest
      from scoring_authority.net_skins_v1_configuration_revisions
      where configuration_revision_id=(select configuration_revision_id
        from scoring_authority.net_skins_v1_configuration_current
        where tournament_id='2026')
    ), entries as (
      select round_item.round_value,entry_item.entry_value
      from manifest
      cross join lateral jsonb_array_elements(configuration_manifest->'rounds')
        as round_item(round_value)
      cross join lateral jsonb_array_elements(round_item.round_value->'entries')
        as entry_item(entry_value)
    )
    insert into scoring_authority.net_skins_configuration_entries(
      tournament_id,round_number,entry_id,match_number,format,
      player_id_1,player_id_2,team_handicap,buy_in,eligible,source_payload)
    select '2026',(round_value->>'round_number')::integer,
      entry_value->>'entry_id',entry_value->>'match_number',
      round_value->>'format',entry_value->>'player_id_1',
      nullif(entry_value->>'player_id_2',''),
      nullif(entry_value->>'team_handicap','')::numeric,
      (entry_value->>'buy_in')::numeric,
      coalesce((entry_value->>'eligible')::boolean,false),
      jsonb_build_object(
        'Entry Revision',entry_value->'entry_revision',
        'Entry Key',entry_value->>'entry_key',
        'Entry Binding Fingerprint',entry_value->>'binding_fingerprint',
        'Canonical Match ID',entry_value->>'match_id',
        'Net Handicap Basis','production-full-course-handicap-v1',
        'Individual Stroke Allocation',
          entry_value->>'individual_stroke_allocation')
    from entries;

    delete from scoring_authority.finalized_scorecard_snapshots where match_id='2026-R1-1';
    update scoring_authority.matches set status='LIVE',scoring_locked=false,
      scorecard_complete=false,finalized_at=null where match_id='2026-R1-1';
    update scoring_authority.scoring_permissions set can_score=true,revoked_at=null
      where match_id='2026-R1-1';
    commit;`, { role: "" });
}
