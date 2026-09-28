// Proof layers: POSTGRESQL / INTEGRATION / FAILURE_INJECTION.
// Socket-only, disposable PostgreSQL; no external database identity is accepted.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { createIsolatedCluster, createDatabase, destroyIsolatedCluster,
  repositoryRoot, sql, sqlResult, jsonLiteral, openSqlSession } from "./support/reliability/postgres17.mjs";
import { installRelease139Schema, installCertifiedSqlRepairs,
  installRelease139FunctionCandidates } from "./support/reliability/release139-schema.mjs";
import { seedSyntheticTournament } from "./support/reliability/synthetic-tournament.mjs";
import { seedSyntheticSideGameHistory } from "./support/reliability/synthetic-history.mjs";
import { reusableScoreInput, benchmarkOperations } from "./support/reliability/benchmark-operations.mjs";
import { inputFor, rpcSql } from "./support/reliability/phase2-score-fixture.mjs";

const migrationPath = "supabase/production_migrations/202609280121_score_derived_intents_v1.sql";
const migration = await readFile(path.join(repositoryRoot, migrationPath), "utf8");
const signatures = [...migration.matchAll(/select pg_temp\.patch_score_derived_source_v1\('([^']+)'/g)]
  .map(match => match[1]);
const output = process.env.BAGGER_PHASE2_MIGRATION_OUTPUT;
const artifact = output ? path.resolve(repositoryRoot, output) : null;
if (artifact) {
  assert.ok(artifact.startsWith(path.join(repositoryRoot, "docs/reliability/phase2") + path.sep));
  assert.match(artifact, /\.json$/);
}
const json = (cluster, database, query, role = "") => JSON.parse(sql(cluster, database, query, { role }));
const fingerprint = (cluster, database) => sql(cluster, database, `
  select encode(extensions.digest(jsonb_build_object(
    'functions',(select jsonb_agg(jsonb_build_object('oid',p.oid,'name',p.proname,
      'source',p.prosrc,'acl',p.proacl,'config',p.proconfig,'definer',p.prosecdef)
      order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('production_control','scoring_authority','public')),
    'relations',(select jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.relname,
      'acl',c.relacl,'rls',c.relrowsecurity) order by c.oid)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('production_control','scoring_authority','public'))
  )::text,'sha256'),'hex')`, { role: "" });
const security = (cluster, database) => json(cluster, database, `
  select jsonb_object_agg(signature,jsonb_build_object('owner',p.proowner,
    'acl',p.proacl,'definer',p.prosecdef,'config',p.proconfig,
    'volatility',p.provolatile,'parallel',p.proparallel))
  from jsonb_array_elements_text(${jsonLiteral(signatures)}) v(signature)
  join pg_proc p on p.oid=signature::regprocedure`);
const canonical = (cluster, database) => sql(cluster, database, `
  select encode(extensions.digest(jsonb_build_object(
    'matches',(select jsonb_agg(to_jsonb(m) order by match_id) from scoring_authority.matches m),
    'holes',(select jsonb_agg(to_jsonb(h) order by match_id,hole_number) from scoring_authority.hole_scores h),
    'receipts',(select jsonb_agg(to_jsonb(r) order by match_id,mutation_key) from scoring_authority.score_mutations r),
    'results',(select jsonb_agg(to_jsonb(r) order by snapshot_id) from scoring_authority.finalized_scorecard_snapshots r)
  )::text,'sha256'),'hex')`, { role: "" });
const executeCandidate = (cluster, database) => sql(cluster, database, migration, { role: "" });

test("Phase2 migration safety and explicitly unresolved annual worker regression", {
  timeout: 360000,
}, async t => {
  const cluster = await createIsolatedCluster();
  const evidence = { schemaVersion: 1, environment: "ISOLATED_LOCAL_POSTGRESQL17",
    timestamp: new Date().toISOString(), migration: migrationPath,
    migrationSha256: createHash("sha256").update(migration).digest("hex"),
    production: false, tests: [], limitations: [
      "Effective clean install includes explicit historical Release139 SQL repairs and synthetic platform prerequisite rows",
      "Expected annual worker SQL failures are reproduced defects, not successful annual worker certification",
      "No hosted admission/release identity, Production migration or rollback deployment is certified",
    ] };
  let sequence = 0;
  const clone = template => {
    const database = `phase2_migration_${++sequence}`;
    createDatabase(cluster, database, { template });
    return database;
  };
  const run = (id, title, body) => t.test(`${id}: ${title}`, async () => {
    const row = { id, title, proofLayer: "POSTGRESQL", result: "FAIL" };
    try { row.details = await body(); row.result = "PASS"; }
    catch (error) { row.error = error.message; throw error; }
    finally { evidence.tests.push(row); }
  });
  try {
    const pristine = "phase2_migration_pristine";
    createDatabase(cluster, pristine);
    await installRelease139Schema(cluster, pristine);
    installCertifiedSqlRepairs(cluster, pristine);
    installRelease139FunctionCandidates(cluster, pristine);
    const seeded = clone(pristine);
    seedSyntheticTournament(cluster, seeded);
    seedSyntheticSideGameHistory(cluster, seeded, 1);
    const installed = clone(seeded);
    const baselineSecurity = security(cluster, installed);
    const baselineEmergency = sql(cluster, installed, "select pg_get_functiondef('public.close_production_scoring_admission(jsonb)'::regprocedure)");
    const beforeCanonical = canonical(cluster, installed);
    executeCandidate(cluster, installed);

    await run("P2-MIG-CLEAN", "effective clean schema installs and executes implementation manifest", () => {
      const database = clone(pristine);
      executeCandidate(cluster, database);
      const manifest = json(cluster, database, "select production_control.annual_side_game_implementation_manifest_v1()");
      assert.equal(manifest.scoreDerivedIntentContract, "score-derived-intent-v1");
      assert.equal(manifest.scoreDerivedIntentHelpers.length, 4);
      assert.equal(manifest.scoreDerivedIntentIndexes.length, 4);
      const index = json(cluster, database, `select jsonb_build_object('definition',pg_get_indexdef(indexrelid),
        'valid',indisvalid,'ready',indisready,'table',indrelid::regclass::text)
        from pg_index where indexrelid='production_control.google_writer_fence_rehearsals_unrestored_idx'::regclass`);
      assert.equal(index.valid, true);
      assert.equal(index.ready, true);
      assert.equal(index.table, "production_control.google_writer_fence_rehearsals");
      assert.match(index.definition, /restoration_confirmed/);
      return { installed: true, manifestExecuted: true, helpers: 4, indexes: 4,
        admissionGuardIndex: index,
        schema: "Release139 migrations + shipped incremental repairs + explicit Resume candidate" };
    });
    await run("P2-MIG-UPGRADE", "synthetic history upgrade preserves canonical data and security attributes", () => {
      assert.equal(canonical(cluster, installed), beforeCanonical);
      assert.deepEqual(security(cluster, installed), baselineSecurity);
      assert.equal(sql(cluster, installed, "select pg_get_functiondef('public.close_production_scoring_admission(jsonb)'::regprocedure)"), baselineEmergency);
      return { canonicalHashUnchanged: true, replacedFunctions: signatures.length,
        existingSecurityAttributesUnchanged: true, emergencyAdmissionFunctionUnchanged: true };
    });
    await run("P2-MIG-REAPPLY", "non-idempotent reapplication rejects atomically", () => {
      const database = clone(installed), before = fingerprint(cluster, database);
      const result = sqlResult(cluster, database, migration, { role: "" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /(score_derived_intents_v1|google_writer_fence_rehearsals_unrestored_idx).*already exists/);
      assert.equal(fingerprint(cluster, database), before);
      return { reapply: "REJECTED_ATOMICALLY", catalogUnchanged: true,
        deploymentRequirement: "migration runner records apply-once identity" };
    });
    await run("P2-MIG-CERTIFICATION", "existing annual certification blocks install without changing it", () => {
      const database = clone(seeded);
      // Fixture-only certification sentinel. FK triggers are bypassed only to
      // model existence; this is not a valid annual authority/certification.
      sql(cluster, database, `set session_replication_role=replica;
        insert into production_control.annual_side_game_runtime_certifications_v1(
          runtime_generation_id,contract_version,tournament_id,pointer_revision,
          authority_generation_id,admission_generation_id,project_ref,project_url,
          source_workbook_id,resource_revision,resource_fingerprint,
          implementation_manifest,implementation_fingerprint,certification_fingerprint)
        values('81000000-0000-4000-8000-000000000001','production-annual-side-game-runtime-v1',
          '2027',2,'81000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000003',
          'synthetic','https://synthetic.invalid','synthetic',1,repeat('a',64),'{}',repeat('b',64),repeat('c',64));
        set session_replication_role=origin;`, { role: "" });
      const before = fingerprint(cluster, database);
      const result = sqlResult(cluster, database, migration, { role: "" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /EXISTING_ANNUAL_CERTIFICATION_REQUIRES_REVIEW/);
      assert.equal(fingerprint(cluster, database), before);
      assert.equal(sql(cluster, database, "select count(*) from production_control.annual_side_game_runtime_certifications_v1"), "1");
      return { install: "REJECTED", certificationPreserved: true, catalogUnchanged: true };
    });
    await run("P2-MIG-SOURCE-HASH", "unexpected installed trigger body rejects all migration changes", () => {
      const database = clone(seeded);
      const original = sql(cluster, database, "select pg_get_functiondef('scoring_authority.enqueue_production_calcutta_v1_change()'::regprocedure)");
      const altered = original.replace("$function$", "$function$\n-- intentional isolated baseline mismatch\n");
      assert.notEqual(altered, original);
      sql(cluster, database, altered, { role: "" });
      const before = fingerprint(cluster, database);
      const result = sqlResult(cluster, database, migration, { role: "" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /SCORE_DERIVED_SOURCE_BASELINE_MISMATCH/);
      assert.equal(fingerprint(cluster, database), before);
      assert.equal(sql(cluster, database, "select to_regclass('scoring_authority.score_derived_intents_v1') is null"), "t");
      return { sourceGuard: "REJECTED", partialTableLeft: false, catalogUnchanged: true };
    });
    await run("P2-MIG-MANIFEST", "manifest rejects private helper or table privilege drift", () => {
      for (const grant of [
        "grant execute on function production_control.flush_score_derived_intents_v1(text,text,integer) to service_role",
        "grant select on scoring_authority.score_derived_intents_v1 to authenticated",
      ]) {
        const database = clone(installed);
        sql(cluster, database, grant, { role: "" });
        const result = sqlResult(cluster, database, "select production_control.annual_side_game_implementation_manifest_v1()", { role: "" });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /SCORE_DERIVED_INTENT_(HELPER|TABLE)_SECURITY_REQUIRED/);
      }
      return { helperPrivilegeDrift: "REJECTED", tablePrivilegeDrift: "REJECTED" };
    });
    await run("P2-MIG-CLOSE", "pending score demand blocks final handoff without changing emergency stop", () => {
      const database = clone(installed);
      const score = json(cluster, database, `select public.submit_production_hole_score(${jsonLiteral(reusableScoreInput)})`, "service_role");
      assert.equal(score.code, "ACCEPTED");
      const result = sqlResult(cluster, database, "select production_control.close_annual_scoring_predecessor_v1('{}','2026')", { role: "" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /SCORE_DERIVED_INTENTS_DRAIN_REQUIRED/);
      assert.equal(sql(cluster, database, "select pg_get_functiondef('public.close_production_scoring_admission(jsonb)'::regprocedure)"), baselineEmergency);
      return { finalHandoff: "DENIED_PENDING_INTENTS", emergencyStopBody: "UNCHANGED",
        emergencyStopRuntime: "NOT_TESTED", canonicalScore: "COMMITTED" };
    });
    await run("P2-MIG-GENERATION", "obsolete intent generation fails closed without rebinding or score loss", () => {
      const database = clone(installed);
      assert.equal(json(cluster, database, `select public.submit_production_hole_score(${jsonLiteral(reusableScoreInput)})`, "service_role").code, "ACCEPTED");
      // Fixture-only alteration models an obsolete generation; never a recovery operation.
      sql(cluster, database, "update scoring_authority.score_derived_intents_v1 set runtime_generation_id='82000000-0000-4000-8000-000000000001' where family='CALCUTTA'", { role: "" });
      const result = json(cluster, database, "select production_control.flush_score_derived_intents_v1('2026','CALCUTTA',8)");
      assert.equal(result.failed, 1);
      assert.equal(result.processed, 0);
      const state = json(cluster, database, "select jsonb_build_object('state',status,'sqlstate',last_sqlstate,'generation',runtime_generation_id) from scoring_authority.score_derived_intents_v1 where family='CALCUTTA'");
      assert.equal(state.state, "RETRYABLE");
      assert.equal(state.sqlstate, "55000");
      assert.equal(state.generation, "82000000-0000-4000-8000-000000000001");
      assert.equal(sql(cluster, database, `select count(*) from scoring_authority.score_mutations where mutation_key='${reusableScoreInput.mutation_key}'`), "1");
      return { staleGeneration: "RETRYABLE_55000", silentlyRebound: false, receiptPreserved: true };
    });
    await run("P2-MIG-LIFECYCLE-SCOPE", "only score transactions defer; actual Lock/Finalize and round triggers retain synchronous work", () => {
      const instrument = database => {
        sql(cluster, database, `create table public.phase2_enqueue_spy(family text);
          create function public.phase2_marker_spy()returns trigger language plpgsql as $$begin
            insert into public.phase2_enqueue_spy values('COMPETITION');return new;end$$;
          create trigger phase2_marker_spy before insert or update on scoring_authority.competition_recalculation_jobs
            for each row execute function public.phase2_marker_spy();`, { role: "" });
        for (const [signature, family] of [
          ["production_control.enqueue_production_calcutta_v1(text,text,boolean,text,text)", "CALCUTTA"],
          ["production_control.enqueue_production_net_skins_v1_round(integer,text,text)", "NET_SKINS"],
        ]) {
          const original = sql(cluster, database, `select pg_get_functiondef('${signature}'::regprocedure)`);
          const definition = original.replace(/\nbegin\n/, `\nbegin\n  insert into public.phase2_enqueue_spy values('${family}');\n`);
          assert.notEqual(definition, original);
          sql(cluster, database, definition, { role: "" });
        }
      };
      const calls = database => json(cluster, database, `select coalesce(jsonb_object_agg(family,n),'{}')
        from(select family,count(*)n from public.phase2_enqueue_spy group by family)s`);
      const scored = clone(installed); instrument(scored);
      assert.equal(json(cluster, scored, `select public.submit_production_hole_score(${jsonLiteral(reusableScoreInput)})`, "service_role").code, "ACCEPTED");
      assert.deepEqual(calls(scored), {});
      assert.equal(sql(cluster, scored, "select count(*) from scoring_authority.score_derived_intents_v1"), "2");

      const locked = clone(installed);
      // Fixture reset from historical Final to Live, before behavioral operation.
      sql(cluster, locked, `set session_replication_role=replica;
        update scoring_authority.matches set status='LIVE',scoring_locked=false where match_id='2026-R1-1';
        update scoring_authority.scoring_permissions set can_score=true,revoked_at=null where match_id='2026-R1-1';
        set session_replication_role=origin;`, { role: "" });
      instrument(locked);
      const control = inputFor(cluster, locked, "2026-R1-1", 1,
        { key: "migration-lock-scope", director: true, operation: "SCORING_LOCK" });
      const lockResult = json(cluster, locked, rpcSql("mutate_production_match_control", control), "service_role");
      assert.equal(lockResult.ok, true, JSON.stringify(lockResult));
      const lockCalls = calls(locked);
      assert.ok(lockCalls.CALCUTTA >= 1 && lockCalls.NET_SKINS >= 1 && lockCalls.COMPETITION >= 5, JSON.stringify(lockCalls));
      assert.equal(sql(cluster, locked, "select count(*) from scoring_authority.score_derived_intents_v1"), "0");

      const finalized = clone(installed); instrument(finalized);
      const operation = benchmarkOperations.find(value => value.id === "finalize");
      const finalizeResult = json(cluster, finalized, `begin;${operation.setupSql}${operation.sql};commit;`, "service_role");
      assert.equal(finalizeResult.code, "FINALIZED", JSON.stringify(finalizeResult));
      const finalizeCalls = calls(finalized);
      assert.ok(finalizeCalls.CALCUTTA >= 1 && finalizeCalls.COMPETITION >= 5, JSON.stringify(finalizeCalls));
      assert.equal(sql(cluster, finalized, "select count(*) from scoring_authority.score_derived_intents_v1"), "0");

      const round = clone(installed); instrument(round);
      sql(cluster, round, "update scoring_authority.rounds set status='LIVE' where tournament_id='2026' and round_number=3", { role: "" });
      assert.ok(calls(round).CALCUTTA >= 1);
      assert.equal(sql(cluster, round, "select count(*) from scoring_authority.score_derived_intents_v1"), "0");
      return { score: { synchronousDerivedCalls: {}, intents: 2 },
        lock: { code: lockResult.code, originalEnqueueCalls: lockCalls, intents: 0 },
        finalize: { code: finalizeResult.code, originalEnqueueCalls: finalizeCalls, intents: 0 },
        round: { originalEnqueueCalls: calls(round), intents: 0, proof: "ACTUAL_ROUND_TRIGGER_ONLY" },
        fullRoundControlLifecycle: "NOT_PROVEN" };
    });
    await run("P2-MIG-ANNUAL-EXPECTED-RED", "actual future worker initializers reproduce pre-existing 42883 before and after", () => {
      const functions = ["future_production_claim_calcutta_recalculation_v1",
        "future_production_claim_competition_derived_jobs_v1",
        "future_production_claim_intelligence_derived_bundle_v1"];
      const failures = [];
      for (const [version, database] of [["PHASE1_BASELINE", seeded], ["PHASE2_CANDIDATE", installed]]) {
        for (const name of functions) {
          const result = sqlResult(cluster, database, `\\set VERBOSITY verbose\nselect public.${name}('{}')`, { role: "" });
          assert.notEqual(result.status, 0);
          assert.match(result.stderr, /42883/);
          assert.match(result.stderr, /pg_catalog\.(greatest|least)/);
          failures.push({ version, function: name, sqlstate: "42883", capabilityStatus: "EXPECTED_RED_PRE_EXISTING" });
        }
      }
      return { reproduced: failures, annualWorkerCertification: "NOT_PROVEN", shippingFix: false };
    });
    await run("P2-MIG-SKINS-DEADLOCK", "mixed-round worker lock inversion is understood and durably retryable", async () => {
      const database = clone(installed);
      // Intent construction only. No bypass is used to write canonical scores.
      // These four valid configured-round demands force opposite round order.
      for (const [match, round] of [["2026-R1-1", 1], ["2026-R2-1", 2],
        ["2026-R2-2", 2], ["2026-R1-2", 1]]) {
        sql(cluster, database, `select production_control.append_score_derived_intent_v1(
          '2026','${match}',${round},'NET_SKINS','ISOLATED_WORKER_ORDER_FIXTURE','{}',null)`, { role: "" });
      }
      const before = canonical(cluster, database);
      const sessions = [openSqlSession(cluster, database), openSqlSession(cluster, database)];
      const command = "select production_control.flush_score_derived_intents_v1('2026','NET_SKINS',1)";
      const readIntents = () => json(cluster, database, `select jsonb_agg(jsonb_build_object(
        'match',match_id,'status',status,'attempts',attempts,'sqlstate',last_sqlstate)
        order by created_at,intent_id) from scoring_authority.score_derived_intents_v1`);
      const outcomes = [];
      try {
        const pids = [];
        for (const session of sessions) {
          pids.push(Number(await session.query("select pg_backend_pid()")));
          await session.query("set log_lock_waits=on;set deadlock_timeout='2s';set statement_timeout='8s';begin");
        }
        // Each transaction first materializes one distinct round, retaining its
        // round advisory lock until commit; next calls request the other round.
        for (const session of sessions) assert.equal(JSON.parse(await session.query(command)).processed, 1);
        const finish = session => session.query(command).then(async value => {
          const result = JSON.parse(value);
          await session.query("commit");
          return result;
        });
        outcomes.push(finish(sessions[0]));
        const graphQuery = `select coalesce(jsonb_agg(jsonb_build_object('pid',pid,
          'blockedBy',pg_blocking_pids(pid),'waitEvent',wait_event) order by pid),'[]')
          from pg_stat_activity where pid in (${pids.join(",")}) and wait_event='advisory'`;
        const waitFor = async count => {
          const end = Date.now() + 1200;
          let graph = [];
          do {
            graph = json(cluster, database, graphQuery);
            if (graph.length >= count) return graph;
            await new Promise(resolve => setTimeout(resolve, 20));
          } while (Date.now() < end);
          assert.fail(`Expected ${count} advisory waiters, saw ${JSON.stringify(graph)}`);
        };
        await waitFor(1);
        outcomes.push(finish(sessions[1]));
        const graph = await waitFor(2);
        assert.ok(graph.every(row => row.blockedBy.some(pid => pids.includes(pid))));
        const locks = json(cluster, database, `select jsonb_agg(jsonb_build_object(
          'pid',pid,'mode',mode,'granted',granted,'classid',classid,'objid',objid,'objsubid',objsubid)
          order by pid,granted,mode) from pg_locks where pid in (${pids.join(",")}) and locktype='advisory'`);
        const responses = await Promise.all(outcomes);
        assert.equal(responses.reduce((sum, value) => sum + value.processed, 0), 1);
        assert.equal(responses.reduce((sum, value) => sum + value.failed, 0), 1);
        const afterDeadlock = readIntents();
        assert.equal(afterDeadlock.filter(row => row.status === "SUCCEEDED").length, 3);
        assert.equal(afterDeadlock.filter(row => row.status === "RETRYABLE" && row.sqlstate === "40P01").length, 1);
        assert.equal(canonical(cluster, database), before);
        // Advance only the fixture retry clock; original canonical authority stays.
        sql(cluster, database, "update scoring_authority.score_derived_intents_v1 set available_at=clock_timestamp()-interval '1 second' where status='RETRYABLE'", { role: "" });
        const retry = json(cluster, database, "select production_control.flush_score_derived_intents_v1('2026','NET_SKINS',8)");
        assert.equal(retry.processed, 1);
        assert.equal(retry.failed, 0);
        assert.ok(readIntents().every(row => row.status === "SUCCEEDED"));
        return { classification: "KNOWN_WORKER_DEADLOCK_RETRYABLE_NOT_ELIMINATED",
          scope: "TWO_MATERIALIZATION_CALLS_PER_WORKER_TRANSACTION",
          lockGraph: graph, locks, responses, afterDeadlock, retry,
          canonicalDataUnchanged: true, automaticSchedulerProven: false,
          limitation: "Production claim batches also retain per-round locks; this reproduces lock-order mechanism, not hosted frequency" };
      } finally {
        await Promise.allSettled(outcomes);
        await Promise.allSettled(sessions.map(session => session.query("rollback")));
        await Promise.allSettled(sessions.map(session => session.close()));
      }
    });
  } finally {
    evidence.completedAt = new Date().toISOString();
    evidence.counts = { pass: evidence.tests.filter(row => row.result === "PASS").length,
      fail: evidence.tests.filter(row => row.result !== "PASS").length };
    if (artifact) { await mkdir(path.dirname(artifact), { recursive: true }); await writeFile(artifact, JSON.stringify(evidence, null, 2) + "\n"); }
    await destroyIsolatedCluster(cluster);
  }
});
