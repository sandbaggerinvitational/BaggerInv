# Phase2C complete migration inventory

**SOURCE INSPECTED.** This inventory describes the intended122→123→124 migration operations in the isolated candidate. It does not claim Production installation or final hosted catalog proof. Exact local catalog/runtime proof remains source-bound to the cited receipts. No Production connection was made.

## Source identities

- supabase/production_migrations/202609280122_score_mutation_recovery_v1.sql: `122080a69e1045c4e189e4cd14752edacd5684f4298183c0524f0bd528a696ce`

- supabase/production_migrations/202609280123_annual_worker_sql_and_net_skins_locks_v1.sql: `4159acdfa22d5cd6699cfe2d4c985261ffbf41f3fbf6087d4eeed5a4aec3bee0`

- supabase/production_migrations/202609280124_score_derived_delivery_v1.sql: `69821b9d98a585c0545e9b5e68968fa7c1a0cebf12e0ba9699c4590f5763bc48`

## Migration 122 functions

New persistent definitions: 4. Existing bodies edited: 2. These are per-migration operations; replacement manifest signatures recur and must not be double-counted as distinct final names.

### New persistent definitions

- `production_control.read_score_mutation_status_v1(jsonb,text)`
- `public.read_production_score_mutation_status_v1(jsonb)`
- `public.future_production_read_score_mutation_status_v1(jsonb)`
- `production_control.annual_side_game_implementation_manifest_v1()`

### Existing body edits

- `public.submit_production_hole_score(jsonb)`
- `public.future_production_submit_hole_score_v1(jsonb)`

### Rename and temporary helper

- `production_control.annual_side_game_implementation_manifest_v1()` → `production_control.annual_side_game_implementation_manifest_pre_score_recovery_v1()`

- Created and dropped within the migration: `pg_temp.patch_score_recovery_source_v1(text,text,jsonb)`

## Migration 123 functions

New persistent definitions: 0. Existing bodies edited: 16. These are per-migration operations; replacement manifest signatures recur and must not be double-counted as distinct final names.

### New persistent definitions

None.

### Existing body edits

- `public.claim_production_future_match_google_compatibility_v2(jsonb)`
- `public.future_production_claim_calcutta_recalculation_v1(jsonb)`
- `public.future_production_claim_competition_derived_jobs_v1(jsonb)`
- `public.future_production_claim_google_outbox_event_pre_generation_v1(jsonb)`
- `public.future_production_claim_google_outbox_pre_generation_v1(jsonb)`
- `public.future_production_claim_intelligence_derived_bundle_v1(jsonb)`
- `public.future_production_claim_scorecard_archive_job_pre_generation_v1(jsonb)`
- `public.future_production_dispatch_odds_pre_withdrawal_v1(jsonb)`
- `public.future_production_fail_google_outbox_pre_generation_v1(jsonb)`
- `public.future_production_fail_scorecard_archive_job_pre_generation_v1(jsonb)`
- `public.future_production_write_competition_derived_snapshot_v1(jsonb)`
- `public.future_production_write_intelligence_derived_bundle_v1(jsonb)`
- `production_control.frozen_2026_write_competition_derived_snapshot_v1(jsonb)`
- `production_control.frozen_2026_write_intelligence_derived_bundle_v1(jsonb)`
- `production_control.flush_score_derived_intents_v1(text,text,integer)`
- `production_control.future_google_writer_implementation_manifest_v2()`

### Rename and temporary helper

No rename.

No persistent patch helper.

## Migration 124 functions

New persistent definitions: 20. Existing bodies edited: 15. These are per-migration operations; replacement manifest signatures recur and must not be double-counted as distinct final names.

### New persistent definitions

- `production_control.capture_derived_delivery_provenance_v1()`
- `production_control.derived_delivery_retryable_v1(text)`
- `production_control.derived_delivery_delay_v1(integer,text)`
- `production_control.capture_derived_delivery_transition_v1()`
- `production_control.assert_score_derived_delivery_scope_v1(jsonb)`
- `production_control.derived_final_recap_ready_v1(text)`
- `public.score_derived_delivery_tick_v1(jsonb)`
- `production_control.intelligence_delivery_ready_v1(text,jsonb)`
- `production_control.lock_net_skins_storylines_v1(text,jsonb)`
- `production_control.enqueue_score_calcutta_v1(text,text,boolean,text,text)`
- `production_control.capture_derived_intent_attempt_v1()`
- `public.requeue_score_derived_delivery_v1(jsonb)`
- `public.fail_intelligence_derived_bundle_v1(jsonb)`
- `public.fail_score_derived_preclaim_v1(jsonb)`
- `public.future_production_score_derived_delivery_tick_v1(jsonb)`
- `public.future_production_requeue_score_derived_delivery_v1(jsonb)`
- `public.future_production_fail_intelligence_derived_bundle_v1(jsonb)`
- `public.future_production_fail_score_derived_preclaim_v1(jsonb)`
- `production_control.recover_derived_calcutta_activation_v1(text)`
- `production_control.annual_side_game_implementation_manifest_v1()`

### Existing body edits

- `production_control.flush_score_derived_intents_v1(text,text,integer)`
- `production_control.frozen_2026_claim_competition_derived_jobs_v1(jsonb)`
- `production_control.frozen_2026_claim_intelligence_derived_bundle_v1(jsonb)`
- `public.claim_production_calcutta_v1_recalculation(jsonb)`
- `public.claim_production_net_skins_v1_recalculation(jsonb)`
- `public.complete_production_calcutta_v1_recalculation(jsonb)`
- `public.complete_production_net_skins_v1_recalculation(jsonb)`
- `public.fail_production_calcutta_v1_recalculation(jsonb)`
- `public.future_production_claim_calcutta_recalculation_v1(jsonb)`
- `public.future_production_claim_competition_derived_jobs_v1(jsonb)`
- `public.future_production_claim_intelligence_derived_bundle_v1(jsonb)`
- `public.future_production_claim_net_skins_recalculation_v1(jsonb)`
- `public.future_production_complete_calcutta_recalculation_v1(jsonb)`
- `public.future_production_complete_net_skins_recalculation_v1(jsonb)`
- `public.future_production_fail_calcutta_recalculation_v1(jsonb)`

### Rename and temporary helper

- `production_control.annual_side_game_implementation_manifest_v1()` → `production_control.annual_side_game_implementation_manifest_pre_delivery_v1()`

- Created and dropped within the migration: `pg_temp.patch_derived_delivery_v1(text,text,jsonb)`

## Tables, columns, metadata and constraints

**122:** add nullable UUID `scoring_authority.score_mutations.originating_auth_user_id`; no default, FK, index or historical Auth backfill. The two score RPCs add the already-validated Auth UUID only to newly accepted receipts. Canonical score request/response and existing receipt fields remain unchanged. Add one annual dispatcher allowlist row for `read_production_score_mutation_status_v1`, CURRENT_READS/READ, targeting the private annual wrapper.

**123:** no table/column/index/trigger addition. Drop exactly `production_control.future_match_google_compatibility_jobs_v1.future_match_google_compatibility_jobs_v_writer_installed_check` only after verifying its exact false-only definition, the validated certified-writer replacement constraint SHA, and the existing NOT NULL/defaultfalse column. All other constraints remain. The Google writer manifest recognizes the already-installed exact sixth Auth attribution trigger; it does not add, drop or modify that trigger. The14 special-expression fixes preserve function attributes and have exact before/after hashes; one of those14 receives an additional local variable rename for42702. The flush helper gets existing per-round advisory locks in R1→R2→R3 order.

**124:** add five columns to each of `scoring_authority.calcutta_v1_recalculation_jobs`, `scoring_authority.net_skins_v1_recalculation_jobs`, and `scoring_authority.competition_recalculation_jobs`: `delivery_available_at timestamptz NOT NULL DEFAULT '-infinity'`, `delivery_cycle bigint NOT NULL DEFAULT1 CHECK(>0)`, `delivery_attempts integer NOT NULL DEFAULT0 CHECK(0..5)`, nullable `delivery_dead_letter_at timestamptz`, and nullable `delivery_error_class text CHECK(RETRYABLE/TERMINAL)`. Add `delivery_score_origin boolean NOT NULL DEFAULTfalse` to Calcutta jobs. Add `delivery_cycle bigint NOT NULL DEFAULT1 CHECK(>0)` to `score_derived_intents_v1`. Together with122,18columns are added to existing tables.

Create private `production_control.score_derived_delivery_attempts_v1` with20columns: `event_id`, `tournament_id`, `family`, `work_identity`, `cycle`, `attempt`, `transition`, `safe_code`, `worker_id`, `runtime_generation_id`, `originating_activation_revision`, `handling_activation_revision`, `handling_release_commit`, `processor_contract`, `related_work_identity`, `recorded_at`, `recovery_request_id`, `recovery_request_hash`, `recovery_actor_id`, `recovery_reason`. The last four are added later in the same transaction. `event_id` is identity/PK; `recovery_request_id` is unique. The new table has eleven CHECK constraints for allowed family/transition/contract, numeric ranges and safe lengths/hash shape. RLS is enabled and all table/sequence rights revoked from PUBLIC, anon, authenticated and service_role. No public insert/update path exists.

Add four annual dispatcher allowlist rows, all WORKERS/MUTATION: `score_derived_delivery_tick_v1`, `fail_score_derived_preclaim_v1`, `requeue_score_derived_delivery_v1`, `fail_intelligence_derived_bundle_v1`; each targets its corresponding private future wrapper. Runtime scope additionally enforces current authority, phase and workers_enabled.

**Backfill:** no explicit scan/update backfill of existing scores, receipts, jobs, results or identity occurs during installation. Existing queue rows acquire constant logical metadata defaults. The attempt ledger starts empty; old historical transitions are not reconstructed. Existing financial/source payloads remain intact. Runtime workers can later append events and advance authorized derived jobs; migration application itself does not run them.

## Trigger inventory

Five new triggers, none on canonical score tables:

1. `production_control.score_derived_delivery_attempts_v1.capture_derived_delivery_provenance`: BEFORE INSERT, calls `capture_derived_delivery_provenance_v1()`.
2. `scoring_authority.calcutta_v1_recalculation_jobs.capture_derived_delivery`: BEFORE INSERT OR UPDATE, calls `capture_derived_delivery_transition_v1()`.
3. `scoring_authority.net_skins_v1_recalculation_jobs.capture_derived_delivery`: same event/function.
4. `scoring_authority.competition_recalculation_jobs.capture_derived_delivery`: same event/function.
5. `scoring_authority.score_derived_intents_v1.capture_derived_intent_attempt`: AFTER UPDATE, WHEN `new.attempts > old.attempts`, calls `capture_derived_intent_attempt_v1()`.

The transition trigger retains canonical requested source metadata on successful Intelligence completion, assigns bounded cycle/attempt/backoff/terminal state, and appends safe provenance. It does not calculate scores, issue financial approval or publish Odds. The intent trigger does not run on the ordinary score's INSERT/coalescing UPDATE unless attempts increase.

## Exact index inventory

Five retained nonunique indexes:

- `scoring_authority.calcutta_v1_recalculation_jobs_delivery_terminal`
- `scoring_authority.net_skins_v1_recalculation_jobs_delivery_terminal`
- `scoring_authority.competition_recalculation_jobs_delivery_due`
- `scoring_authority.score_derived_intents_terminal_v1`
- `production_control.score_derived_delivery_attempts_work_v1`

Two additional indexes back correctness constraints: `production_control.score_derived_delivery_attempts_v1_pkey` and `production_control.score_derived_delivery_attempts_v1_recovery_request_id_key`. Total new indexes:7. No existing index is dropped. Migration122 reuses the score-mutation key;123 adds no index.121's intent/fence indexes are before-state.

Removed from candidate source after actual counterfactual review (they never become installed by final124): Calcutta delivery_due, Net Skins delivery_due, Competition delivery_terminal. Their full qualified definitions remain in the retained85f9 historical evidence. Applicable-state plans distinguish retained5 usefulness, tiny-table counterevidence and unmeasured write amplification. Index builds are ordinary transactional DDL, not concurrent builds.

## Security and implementation manifest

Existing function replacements use exact installed source hashes/anchors and preserve owner/ACL/security-definer/search_path attributes through pg_get_functiondef.123 also asserts attribute equality and expected replacement hashes. New public2026 recovery/tick/requeue/failure endpoints grant EXECUTE only to service_role; annual targets remain owner-only and are reached by the existing dispatcher. Requeue additionally validates an active Director identity. All new private helpers and attempt-table rights remain revoked from API roles. Existing RLS/grants on score authority are not broadened.

122 chains the previous annual manifest under `_pre_score_recovery_v1`, binding shared recovery helper,2026read/source and origin column. Existing enabled annual dispatcher-target enumeration binds the annual scorer/recovery target.124 chains the predecessor under `_pre_delivery_v1`, validates19helper signatures/security attributes, records four queue structures/columns/constraints/indexes/triggers, binds the private attempt table and identity sequence ACL, adds six Calcutta lock-function sources, two Net Skins completion sources and the private score-only enqueue clone. Future claim bodies are bound through inherited enabled annual dispatcher-target fingerprints. The temporary patch functions are dropped before commit.

Each migration rejects existing annual certification rows. Reinstallation is intentionally not blind/idempotent. A deployment must install against a reviewed state, recertify with new source/resource fingerprints and preserve prior certificate evidence; deleting certifications to bypass the guard is not authorized.

## Lock and deployment risk

Future deployment risk: HIGH until staged migration, supervision, protected annual admission, client compatibility and rollback rehearsal complete. DDL obtains table/catalog locks; ordinary index creation can block writes. Constant defaults avoid an explicit data backfill but do not establish hosted lock duration, WAL/write amplification or provider capacity. No timeout is increased.

**Expected duration class:** definition/metadata changes plus ordinary, data-volume-dependent index builds over existing tables. No explicit historical data backfill is scheduled. Index-build and lock-wait duration must be measured in the later hosted rehearsal; no Production execution-time estimate is supported by the local proof.

Runtime ordering: one family per materialization RPC; NetSkins R1→R2→R3 prefix; Calcutta intent→current→job for claim and current→job for complete/fail; owner Net completion Storylines→configuration/job/result, with exact absent-marker demand inserted atomically; Competition marker prefixes follow Team→Storylines→Intelligence→Projection→FinalRecap. Four final failure/lease paths are separately proven in16/16local tests. Exact future expiry target/generation may contain schema-permitted extra rows: the five-row bound describes supported writers only.

No generalized global/match lock or canonical-scoring rule change is added. Runtime guard and required receipt correctness remain separate from nonessential telemetry. Financial approval and Odds publication are unchanged.

## Rollback and evidence boundaries

All three migrations are transaction-wrapped: a precondition/hash/DDL failure rolls back that migration. Cross-migration deployment needs its own sequence and checkpoints. Before any traffic, restoring reviewed prior definitions and removing unused additions may be possible in a disposable rehearsal; no destructive rollback has been authorized for a live environment.

After new receipts/jobs/events exist, do not drop origin provenance, delivery ledger, pending intents, metadata or indexes blindly. Stop only the new worker/routes under a reviewed procedure, retain durable demand/evidence, and apply a compatible forward fix or exact reviewed function restoration. Older processors may not honor new delay/dead-letter metadata, so application rollback alone is not worker-policy rollback. Reverting123 reintroduces42883/42702, manifest/constraint and lock defects; restoring the obsolete false-only CHECK can reject now-valid certified rows. Reverting122 stops new-origin capture and makes later owned recovery unavailable; legacy nulls must remain unresolved. Hosted rollback safety is NOT PROVEN.

**Actual local catalog evidence:** worker-failure-lock-after.json records the installed122/123/124 hashes and five effective function attributes on final12469821b9; its wrapper is16/16, stable sources, cluster destroyed. Other annual, migration, recovery and worker artifacts prove their recorded source versions and must be refreshed or assessed by exact dependency impact before being called final. This source inventory is not a substitute for those runtime gates and is not Production proof.
