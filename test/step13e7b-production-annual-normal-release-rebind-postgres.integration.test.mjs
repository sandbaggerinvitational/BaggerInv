import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixturePath = path.join(
  repositoryRoot,
  "test/fixtures/step13e7b-production-annual-normal-release-rebind.sql",
);
const testPath = path.join(
  repositoryRoot,
  "test/option2-production-maintenance-precommit-deployment-rebind-postgres.integration.test.mjs",
);
const migrationNames = (await readdir(path.join(
  repositoryRoot,
  "supabase/production_migrations",
)))
  .filter((name) => {
    const match = name.match(/^\d{8}00(\d{2})_.*\.sql$/);
    const sequence = match == null ? -1 : Number(match[1]);
    return sequence >= 54 && sequence <= 78;
  })
  .sort();

let source = await readFile(testPath, "utf8");
source = source.replace(
  'import test from "node:test";',
  `import nodeTest from "node:test";
const test = (name, options, callback) => {
  if (!name.startsWith("migration 051 binds one maintenance deployment")) {
    return undefined;
  }
  return nodeTest(
    "migration 078 rebinds future annual normal releases without mutating annual state",
    options,
    async (context) => {
      const nestedTest = context.test.bind(context);
      context.test = (childName, ...childArgs) =>
        childName.startsWith("commit, workers, Odds")
          ? nestedTest(
            "future annual authorization, replay, stale and invariance",
            ...childArgs,
          )
          : Promise.resolve();
      return callback(context);
    },
  );
};`,
);
source = source.replace(
  `const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);`,
  `const repositoryRoot = ${JSON.stringify(repositoryRoot)};`,
);

const originalInstall = `        psqlFile(
          cluster,
          database,
          path.join(migrationsDirectory, postcutoverNormalReleaseMigration),
        );`;
const annualTuple = {
  expected_release_sequence: 2,
  expected_current_tournament_id: "2099",
  expected_pointer_revision: 2,
  expected_runtime_generation_id: "10000000-0000-4000-8000-000000000091",
  expected_annual_authority_generation_id:
    "20000000-0000-4000-8000-000000000092",
  expected_annual_admission_generation_id:
    "30000000-0000-4000-8000-000000000093",
};
const procedureFingerprintSql = (signature) => `
  select oid::text || ':' || encode(
    extensions.digest(prosrc, 'sha256'), 'hex'
  )
  from pg_catalog.pg_proc
  where oid = '${signature}'::regprocedure;
`;
const activeTransitionProbeSql = `
  do $review$
  declare blocked boolean := false;
  begin
    insert into production_control.annual_scoring_transitions_v1 (
      contract_version, transition_status,
      predecessor_tournament_id, successor_tournament_id,
      expected_pointer_revision, predecessor_lifecycle_revision,
      successor_prepared_lifecycle_revision, runtime_generation_id,
      authority_generation_id, admission_generation_id,
      readiness_fingerprint, prepared_by_player_id,
      prepared_by_auth_user_id
    ) values (
      'production-annual-scoring-transition-v1', 'PREPARED',
      '2026', '2099', 1, 2, 2,
      '10000000-0000-4000-8000-000000000091',
      '20000000-0000-4000-8000-000000000092',
      '30000000-0000-4000-8000-000000000093',
      repeat('6', 64), 'AR01',
      '00000000-0000-4000-8000-000000000091'
    );
    begin
      perform production_control.postcutover_annual_release_context_v1();
    exception when sqlstate '55000' then
      if sqlerrm = 'PRODUCTION_ANNUAL_NORMAL_RELEASE_NOT_SAFE' then
        blocked := true;
      else
        raise;
      end if;
    end;
    delete from production_control.annual_scoring_transitions_v1
    where runtime_generation_id =
      '10000000-0000-4000-8000-000000000091';
    if not blocked then
      raise exception 'ACTIVE_ANNUAL_TRANSITION_WAS_NOT_BLOCKED';
    end if;
  end;
  $review$;
`;
const runningWorkerProbeSql = `
  do $review$
  declare blocked boolean := false;
  begin
    insert into scoring_authority.competition_recalculation_jobs (
      tournament_id, round_number, engine_key, status,
      requested_source_revision, attempts, requested_at,
      started_at, updated_at
    ) values (
      '2099', 0, 'RELEASE_REVIEW_BLOCKER', 'RUNNING',
      '{}'::jsonb, 1, pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
    );
    begin
      perform production_control.postcutover_annual_release_context_v1();
    exception when sqlstate '55000' then
      if sqlerrm = 'PRODUCTION_ANNUAL_NORMAL_RELEASE_NOT_SAFE' then
        blocked := true;
      else
        raise;
      end if;
    end;
    delete from scoring_authority.competition_recalculation_jobs
    where tournament_id = '2099'
      and round_number = 0
      and engine_key = 'RELEASE_REVIEW_BLOCKER';
    if not blocked then
      raise exception 'RUNNING_ANNUAL_WORKER_WAS_NOT_BLOCKED';
    end if;
  end;
  $review$;
`;
const orphanWorkerLeaseProbeSql = `
  do $review$
  declare blocked boolean := false;
  begin
    insert into scoring_authority.competition_recalculation_jobs (
      tournament_id, round_number, engine_key, status,
      requested_source_revision, attempts, requested_at,
      completed_at, claim_token, claimed_by, lease_expires_at, updated_at
    ) values (
      '2099', 0, 'RELEASE_REVIEW_ORPHAN_LEASE', 'FAILED',
      '{}'::jsonb, 1, pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp(),
      '40000000-0000-4000-8000-000000000094',
      'orphan-review-worker', pg_catalog.clock_timestamp() + interval '5 minutes',
      pg_catalog.clock_timestamp()
    );
    begin
      perform production_control.postcutover_annual_release_context_v1();
    exception when sqlstate '55000' then
      if sqlerrm = 'PRODUCTION_ANNUAL_NORMAL_RELEASE_NOT_SAFE' then
        blocked := true;
      else
        raise;
      end if;
    end;
    delete from scoring_authority.competition_recalculation_jobs
    where tournament_id = '2099'
      and round_number = 0
      and engine_key = 'RELEASE_REVIEW_ORPHAN_LEASE';
    if not blocked then
      raise exception 'ORPHAN_ANNUAL_WORKER_LEASE_WAS_NOT_BLOCKED';
    end if;
  end;
  $review$;
`;
const retiredMirrorWorkerProbeSql = `
  do $review$
  declare blocked boolean := false;
  begin
    perform pg_catalog.set_config('session_replication_role', 'replica', true);
    insert into scoring_authority.odds_google_mirror_jobs (
      id, tournament_id, snapshot_id, status
    ) values (
      '50000000-0000-4000-8000-000000000095', '2099',
      '60000000-0000-4000-8000-000000000096', 'RUNNING'
    );
    perform pg_catalog.set_config('session_replication_role', 'origin', true);
    begin
      perform production_control.postcutover_annual_release_context_v1();
    exception when sqlstate '55000' then
      if sqlerrm = 'PRODUCTION_ANNUAL_NORMAL_RELEASE_NOT_SAFE' then
        blocked := true;
      else
        raise;
      end if;
    end;
    delete from scoring_authority.odds_google_mirror_jobs
    where id = '50000000-0000-4000-8000-000000000095';
    if not blocked then
      raise exception 'RUNNING_RETIRED_MIRROR_JOB_WAS_NOT_BLOCKED';
    end if;
  exception when others then
    perform pg_catalog.set_config('session_replication_role', 'origin', true);
    raise;
  end;
  $review$;
`;
const platformBindingProbeSql = `
  do $review$
  declare
    original_generation uuid;
    blocked boolean := false;
  begin
    select platform_admission_generation_id into strict original_generation
    from production_control.annual_scoring_runtime_authorities_v1
    where tournament_id = '2099';
    update production_control.annual_scoring_runtime_authorities_v1
    set platform_admission_generation_id =
      '70000000-0000-4000-8000-000000000097'
    where tournament_id = '2099';
    begin
      perform production_control.postcutover_annual_release_context_v1();
    exception when sqlstate '55000' then
      if sqlerrm = 'PRODUCTION_ANNUAL_NORMAL_RELEASE_NOT_SAFE' then
        blocked := true;
      else
        raise;
      end if;
    end;
    update production_control.annual_scoring_runtime_authorities_v1
    set platform_admission_generation_id = original_generation
    where tournament_id = '2099';
    if not blocked then
      raise exception 'ANNUAL_PLATFORM_BINDING_MISMATCH_WAS_NOT_BLOCKED';
    end if;
  end;
  $review$;
`;
const injected = `        for (const migrationName of ${JSON.stringify(migrationNames)}.slice(0, -1)) {
          psqlFile(cluster, database, path.join(migrationsDirectory, migrationName));
        }
        const frozenAuthorizationBefore = psql(
          cluster,
          database,
          ${JSON.stringify(procedureFingerprintSql("production_control.authorize_production_postcutover_normal_release(jsonb)"))},
        );
        const frozenRebindBefore = psql(
          cluster,
          database,
          ${JSON.stringify(procedureFingerprintSql("production_control.rebind_production_postcutover_normal_release(jsonb)"))},
        );
        psqlFile(
          cluster,
          database,
          path.join(migrationsDirectory, ${JSON.stringify(migrationNames.at(-1))}),
        );
        assert.equal(psql(
          cluster,
          database,
          ${JSON.stringify(procedureFingerprintSql("production_control.authorize_production_postcutover_normal_release_frozen_2026_v1(jsonb)"))},
        ), frozenAuthorizationBefore);
        assert.equal(psql(
          cluster,
          database,
          ${JSON.stringify(procedureFingerprintSql("production_control.rebind_production_postcutover_normal_release_frozen_2026_v1(jsonb)"))},
        ), frozenRebindBefore);
        const frozenDatabase = "annual_normal_release_frozen_2026";
        createDatabase(cluster, frozenDatabase, database);
        const frozenAuthorizationInput = normalReleaseAuthorizationInput(
          applicationState,
          "migration-078-frozen-2026",
          { expected_release_sequence: 2 },
        );
        const frozenAuthorization = ownerControlFunction(
          cluster,
          frozenDatabase,
          "authorize_production_postcutover_normal_release",
          frozenAuthorizationInput,
        );
        assert.equal(frozenAuthorization.release_sequence, 2);
        const frozenRebindInput = normalReleaseDirectInput(
          applicationState,
          "migration-078-frozen-2026",
          { expected_release_sequence: 2 },
        );
        const frozenRebind = rpc(
          cluster,
          frozenDatabase,
          "rebind_production_postcutover_normal_release",
          frozenRebindInput,
        );
        assert.equal(frozenRebind.release_sequence, 2);
        assert.equal(rpc(
          cluster,
          frozenDatabase,
          "rebind_production_postcutover_normal_release",
          frozenRebindInput,
        ).idempotent, true);
        psqlFile(cluster, database, ${JSON.stringify(fixturePath)});
        psql(cluster, database, ${JSON.stringify(activeTransitionProbeSql)});
        psql(cluster, database, ${JSON.stringify(runningWorkerProbeSql)});
        psql(cluster, database, ${JSON.stringify(orphanWorkerLeaseProbeSql)});
        psql(cluster, database, ${JSON.stringify(retiredMirrorWorkerProbeSql)});
        psql(cluster, database, ${JSON.stringify(platformBindingProbeSql)});
        const annualBefore = psql(
          cluster,
          database,
          "select public.annual_release_review_target_snapshot();",
        );
        const annualStateBefore = JSON.parse(psql(
          cluster,
          database,
          "select public.annual_release_review_target_state()::text;",
        ));
        const annualAuthorizationInput = normalReleaseAuthorizationInput(
          applicationState,
          "annual-future",
          ${JSON.stringify(annualTuple)},
        );
        assertCommandFailure(
          () => ownerControlFunction(
            cluster,
            database,
            "authorize_production_postcutover_normal_release",
            {
              ...annualAuthorizationInput,
              expected_pointer_revision: "2",
            },
          ),
          /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_INVALID/,
        );
        assertCommandFailure(
          () => ownerControlFunction(
            cluster,
            database,
            "authorize_production_postcutover_normal_release",
            {
              ...annualAuthorizationInput,
              expected_current_tournament_id: "2098",
            },
          ),
          /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_NOT_SAFE/,
        );
        assertCommandFailure(
          () => ownerControlFunction(
            cluster,
            database,
            "authorize_production_postcutover_normal_release",
            {
              ...annualAuthorizationInput,
              expected_runtime_generation_id:
                "00000000-0000-0000-0000-000000000000",
            },
          ),
          /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_INVALID/,
        );
        const annualAuthorization = ownerControlFunction(
          cluster,
          database,
          "authorize_production_postcutover_normal_release",
          annualAuthorizationInput,
        );
        assert.equal(annualAuthorization.release_sequence, 2);
        assert.equal(annualAuthorization.idempotent, false);
        const annualAuthorizationReplay = ownerControlFunction(
          cluster,
          database,
          "authorize_production_postcutover_normal_release",
          annualAuthorizationInput,
        );
        assert.equal(annualAuthorizationReplay.idempotent, true);
        assert.equal(
          annualAuthorizationReplay.release_intent_id,
          annualAuthorization.release_intent_id,
        );
        assertCommandFailure(
          () => ownerControlFunction(
            cluster,
            database,
            "authorize_production_postcutover_normal_release",
            { ...annualAuthorizationInput, actor_id: "conflicting-actor" },
          ),
          /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_CONFLICT/,
        );
        assertCommandFailure(
          () => ownerControlFunction(
            cluster,
            database,
            "authorize_production_postcutover_normal_release",
            {
              ...annualAuthorizationInput,
              request_fingerprint: fingerprint("annual-future-pending-intent"),
            },
          ),
          /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_NOT_SAFE/,
        );
        const annualRebindInput = normalReleaseDirectInput(
          applicationState,
          "annual-future",
          {
            expected_release_sequence: 2,
            runtime_odds_publication_authority: "SUPABASE",
            runtime_supabase_odds_publication_enabled: true,
            runtime_supabase_odds_google_mirror_enabled: false,
          },
        );
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "rebind_production_postcutover_normal_release",
            { ...annualRebindInput, expected_release_sequence: "2" },
          ),
          /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INPUT_INVALID/,
        );
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "rebind_production_postcutover_normal_release",
            { ...annualRebindInput, epoch_id: "------------------------------------" },
          ),
          /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INPUT_INVALID/,
        );
        psql(
          cluster,
          database,
          "update production_control.current_tournament_pointer_v1 set pointer_revision = 3 where scope_key = 'BAGGER_INV_PRODUCTION';",
        );
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "rebind_production_postcutover_normal_release",
            annualRebindInput,
          ),
          /PRODUCTION_ANNUAL_NORMAL_RELEASE_NOT_SAFE/,
        );
        psql(
          cluster,
          database,
          "update production_control.current_tournament_pointer_v1 set pointer_revision = 2 where scope_key = 'BAGGER_INV_PRODUCTION';",
        );
        const annualRebind = rpc(
          cluster,
          database,
          "rebind_production_postcutover_normal_release",
          annualRebindInput,
        );
        assert.equal(annualRebind.release_sequence, 2);
        assert.equal(annualRebind.idempotent, false);
        const annualRebindReplay = rpc(
          cluster,
          database,
          "rebind_production_postcutover_normal_release",
          annualRebindInput,
        );
        assert.equal(annualRebindReplay.idempotent, true);
        assert.equal(
          annualRebindReplay.release_rebind_id,
          annualRebind.release_rebind_id,
        );
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "rebind_production_postcutover_normal_release",
            {
              ...annualRebindInput,
              runtime_deployment_hostname: "conflict.vercel.app",
            },
          ),
          /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_REQUEST_CONFLICT/,
        );
        const firstReleaseState = baseState(cluster, database);
        const secondAuthorizationInput = normalReleaseAuthorizationInput(
          firstReleaseState,
          "annual-future-sequence-3",
          {
            ...${JSON.stringify(annualTuple)},
            expected_release_sequence: 3,
            target_deployment_commit: repeatedNormalReleaseSha,
            expected_predecessor_deployment_id: normalReleaseDeployment,
            expected_predecessor_deployment_commit: normalReleaseSha,
          },
        );
        const secondAuthorization = ownerControlFunction(
          cluster,
          database,
          "authorize_production_postcutover_normal_release",
          secondAuthorizationInput,
        );
        assert.equal(secondAuthorization.release_sequence, 3);
        const secondRebindInput = normalReleaseDirectInput(
          firstReleaseState,
          "annual-future-sequence-3",
          {
            expected_release_sequence: 3,
            original_deployment_id: normalReleaseDeployment,
            expected_predecessor_deployment_id: normalReleaseDeployment,
            expected_predecessor_deployment_commit: normalReleaseSha,
            deployment_id: repeatedNormalReleaseDeployment,
            deployment_commit: repeatedNormalReleaseSha,
            runtime_deployment_commit: repeatedNormalReleaseSha,
            runtime_deployment_hostname:
              repeatedNormalReleaseDeploymentHostname,
            runtime_odds_publication_authority: "SUPABASE",
            runtime_supabase_odds_publication_enabled: true,
            runtime_supabase_odds_google_mirror_enabled: false,
          },
        );
        const secondRebind = rpc(
          cluster,
          database,
          "rebind_production_postcutover_normal_release",
          secondRebindInput,
        );
        assert.equal(secondRebind.release_sequence, 3);
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "rebind_production_postcutover_normal_release",
            annualRebindInput,
          ),
          /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_STALE_REPLAY/,
        );
        assert.equal(psql(
          cluster,
          database,
          "select current_tournament_id || ':' || current_tournament_year::text from production_control.resource_scope where scope_key = 'BAGGER_INV_PRODUCTION';",
        ), "2026:2026");
        assert.equal(psql(
          cluster,
          database,
          "select state || ':' || admission_state || ':' || admission_deployment_id || ':' || admission_generation_id::text from scoring_authority.ingress_gates where tournament_id = '2026';",
        ), "OPEN:CLOSED:" + repeatedNormalReleaseDeployment + ":" +
          applicationState.admission_generation_id);
        assert.equal(psql(
          cluster,
          database,
          "select expected_deployment_commit || ':' || authority_generation_id::text from production_control.cutover_activation_state where scope_key = 'BAGGER_INV_PRODUCTION';",
        ), repeatedNormalReleaseSha + ":" +
          applicationState.authority_generation_id);
        const annualAfter = psql(
          cluster,
          database,
          "select public.annual_release_review_target_snapshot();",
        );
        const annualStateAfter = JSON.parse(psql(
          cluster,
          database,
          "select public.annual_release_review_target_state()::text;",
        ));
        const changedAnnualRelations = Object.keys(annualStateBefore)
          .filter((name) => JSON.stringify(annualStateBefore[name]) !==
            JSON.stringify(annualStateAfter[name]));
        if (changedAnnualRelations.length > 0) {
          console.log(JSON.stringify({
            marker: "ANNUAL_RELEASE_INVARIANCE_DIFF",
            changedAnnualRelations,
            before: Object.fromEntries(changedAnnualRelations.map((name) => [
              name, annualStateBefore[name],
            ])),
            after: Object.fromEntries(changedAnnualRelations.map((name) => [
              name, annualStateAfter[name],
            ])),
          }));
        }
        assert.equal(annualAfter, annualBefore);
        console.log(JSON.stringify({
          result: "ANNUAL_RELEASE_REVIEW_OK",
          migrations: ${JSON.stringify(migrationNames)}.length,
          annualSnapshot: annualAfter,
          authorization: annualAuthorization,
          rebind: annualRebind,
          secondRebind,
        }));
        return;`;

if (!source.includes(originalInstall)) {
  throw new Error("Normal-release installation site was not found");
}
source = source.replace(originalInstall, injected);
source += "\n//# sourceURL=annual-normal-release-rebind-generated.mjs\n";
await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
