# Phase 2C query plans and index evidence

**Scope: local disposable PostgreSQL 17 only.** This report is generated from retained artifacts. A captured plan does not prove Production capacity, physical client behavior, or universal index necessity. Source freshness is reported separately from the historical test result.

**Source identity:** migration 122 `122080a69e1045c4e189e4cd14752edacd5684f4298183c0524f0bd528a696ce`; migration 123 `4159acdfa22d5cd6699cfe2d4c985261ffbf41f3fbf6087d4eeed5a4aec3bee0`; migration 124 `69821b9d98a585c0545e9b5e68968fa7c1a0cebf12e0ba9699c4590f5763bc48`.

## Measurement discipline

Freshness uses the recorded capture-time suite dependency closure and all installed SQL migrations. Legacy receipts without that closure retain historical plan evidence but cannot become current-candidate certification from reconstructed imports alone. Unrelated tests/report gates do not invalidate unchanged SQL plans; runner-envelope changes are reported separately without altering the retained wrapper result. Optional no-impact exceptions require exact artifact/file/before/after hashes and a written reason. Missing runtime or fixture evidence is never converted to PASS.

Nested auto_explain durations overlap and must not be summed. Logged SQL executions are not network round trips or distinct rows. Plan instrumentation is separate from uninstrumented benchmarks. No helper disables sequential scans. Small current relations may correctly use sequential scans. Index counterfactuals remove only named nonunique indexes in a rolled-back transaction; they preserve correctness constraints and are not the old schema. Single plan timings do not establish percentiles or write amplification.

## Canonical score and recovery plans

|Scale|Historical baseline nested executions|Current candidate nested executions|Current recovery nested executions|Current candidate max temp written blocks|
|---|---|---|---|---|
|1×|88|88|7|0|
|2×|88|88|7|0|
|5×|88|88|7|0|
|10×|88|88|7|0|

**common candidate:** CURRENT COMPLETED BENCHMARK — Measured SQL/runtime/fixture dependency hashes match (or have exact reviewed no-impact exceptions).

**eligible candidate:** CURRENT COMPLETED BENCHMARK — Measured SQL/runtime/fixture dependency hashes match (or have exact reviewed no-impact exceptions).

**recovery candidate:** CURRENT COMPLETED BENCHMARK — Measured SQL/runtime/fixture dependency hashes match (or have exact reviewed no-impact exceptions).

Baseline nested executions from the retained actual artifacts: 1×: 88, 2×: 88, 5×: 88, 10×: 88. Financial current-authority relations must be interpreted from the actual plans: calcutta_v1_current, net_skins_v1_configuration_current and net_skins_v1_configuration_revisions support durable intent eligibility; their presence is not a historical calculation scan. The protected annual runtime additionally verifies its implementation/resource manifest. A substituted-runtime common benchmark cannot stand in for that branch; recovery and eligible-history captures are separate.

[candidate-common-1x-none-plan.json](evidence/candidate-common-1x-none-plan.json): 88 nested executions; max temporary written blocks 0; derived relations: calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions

[candidate-recovery-1x-none-plan.json](evidence/candidate-recovery-1x-none-plan.json): 7 nested executions; max temporary written blocks 0; derived relations: none

[candidate-common-10x-none-plan.json](evidence/candidate-common-10x-none-plan.json): 88 nested executions; max temporary written blocks 0; derived relations: calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions

[candidate-recovery-10x-none-plan.json](evidence/candidate-recovery-10x-none-plan.json): 7 nested executions; max temporary written blocks 0; derived relations: none

### Eligible-history score branches

|Scale|Receipt branch|Nested executions|Max temp written blocks|Derived relations reached|
|---|---|---|---|---|
|1|none|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|
|1|current_compatible|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|
|1|current_incompatible_consumed|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|
|1|current_incompatible_financial|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|
|1|stale_source|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|
|1|stale_result_binding|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|
|1|superseded_result|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|
|1|multiple_receipts|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|
|10|multiple_receipts|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|
|10|superseded_result|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|
|10|stale_result_binding|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|
|10|stale_source|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|
|10|current_incompatible_financial|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|
|10|current_incompatible_consumed|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|
|10|current_compatible|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|
|10|none|88|0|calcutta_v1_current, net_skins_v1_configuration_current, net_skins_v1_configuration_revisions|

All eight legitimate receipt branches execute at 1×, 2×, 5× and 10×. Nested plans are captured at 1× and 10× only; interior scales retain measured execution, rollback and result evidence. Every captured branch reaches the same bounded current financial authority reads and durable intent writes. None of these captures reaches Calcutta result-history compatibility aggregation or side-game calculation. This is exact fixture-path evidence, not proof that every future trigger or arbitrarily privileged write is bounded. The 30 timing samples per branch do not prove p99.

### Exact current score/receipt access

|Scale|Operation|Relation|Default access|Rows returned|Rows filtered|Hit blocks|
|---|---|---|---|---|---|---|
|1|common|score_mutations|score_mutations_pkey|0|0|4|
|1|common|hole_scores|scoring_authority_hole_score_revision_idx|0|0|4|
|1|common|hole_scores|Bitmap Heap Scan|1|0|3|
|1|common|hole_scores|scoring_authority_hole_score_revision_idx|1|0|3|
|1|common|hole_scores|Bitmap Heap Scan|1|0|3|
|1|common|score_derived_intents_v1|score_derived_intents_v1_tournament_id_match_id_source_tran_key|1|0|3|
|1|common|score_derived_intents_v1|score_derived_intents_v1_tournament_id_match_id_source_tran_key|1|0|3|
|1|common|score_derived_intents_v1|score_derived_intents_v1_tournament_id_match_id_source_tran_key|1|0|3|
|1|common|google_writer_fence_rehearsals|google_writer_fence_rehearsals_unrestored_idx|0|0|1|
|1|recovery|score_mutations|scoring_authority_mutations_history_idx|1|0|3|
|10|common|score_mutations|score_mutations_pkey|0|0|4|
|10|common|hole_scores|scoring_authority_hole_score_revision_idx|0|0|4|
|10|common|hole_scores|Bitmap Heap Scan|1|0|3|
|10|common|hole_scores|scoring_authority_hole_score_revision_idx|1|0|3|
|10|common|hole_scores|Bitmap Heap Scan|1|0|3|
|10|common|score_derived_intents_v1|score_derived_intents_v1_tournament_id_match_id_source_tran_key|1|0|3|
|10|common|score_derived_intents_v1|score_derived_intents_v1_tournament_id_match_id_source_tran_key|1|0|3|
|10|common|score_derived_intents_v1|score_derived_intents_v1_tournament_id_match_id_source_tran_key|1|0|3|
|10|common|google_writer_fence_rehearsals|google_writer_fence_rehearsals_unrestored_idx|0|0|1|
|10|recovery|score_mutations|score_mutations_pkey|1|0|3|

Recovery is measured after supported SCORING_LOCK commits and active scoring permissions are zero. The exact owned mutation lookup returns COMMITTED in all 1,000 timed samples per scale. The default planner chooses the existing mutation-history key at 1× and the mutation primary key at 10×; both captured nodes return one row with zero filtered rows and three hit blocks. No new recovery index was needed. The seven nested recovery executions are separate from the 88 nested score executions, and neither count is an HTTP/database round-trip count. API authentication and the full protected annual manifest branch have independent tests and must not be inferred from the substituted-runtime common fixture.

Common and eligible plans retain exact score-receipt lookup, current-match/hole lookup, current-transaction intent coalescing and the unrestored-rehearsal partial index. The empty rehearsal predicate remains an IndexOnlyScan at one hit block. Node-level buffer observations overlap across nested functions and cannot be summed into transaction I/O or rows examined. Zero captured temporary writes proves no spill in these measured branches only.

## Candidate index inventory

|Index / constraint|Candidate disposition|Purpose|Evidence interpretation / remaining risk|
|---|---|---|---|
|calcutta_v1_recalculation_jobs_delivery_due|REMOVED after counterfactual review|Current due financial jobs|Actual full claim selectors use the inherited active-job claim index with or without this optional index.|
|net_skins_v1_recalculation_jobs_delivery_due|REMOVED after counterfactual review|Due owner-requested Net Skins jobs|Actual full owner claim selectors use the inherited active-job claim index. Autonomous tick does not calculate or publish Net Skins.|
|competition_recalculation_jobs_delivery_due|RETAINED nonunique|Current due marker selection|Applicable-state proof uses the exact shipped EXISTS. The due branch can avoid irrelevant prior-year markers; the delayed branch can prefer the inherited primary key.|
|calcutta_v1_recalculation_jobs_delivery_terminal|RETAINED nonunique|Capped current terminal count|Full tick counterfactual measures avoidance of accumulated financial job history. Active-job uniqueness does not bound terminal history.|
|net_skins_v1_recalculation_jobs_delivery_terminal|RETAINED nonunique|Capped current terminal count|Full tick counterfactual measures avoidance of accumulated Net Skins terminal history.|
|competition_recalculation_jobs_delivery_terminal|REMOVED after counterfactual review|Capped current terminal count|Inherited current-tournament primary-key lookup examines the five round-0 markers created by supported writers in this fixture; observed one-block savings do not justify another mutable index.|
|score_derived_intents_terminal_v1|RETAINED nonunique|Current DEAD_LETTER intents, cap 101|Empty-current probe has adequate existing unresolved index. Applicable 864-intent backlog below establishes the incremental purpose.|
|score_derived_delivery_attempts_work_v1|RETAINED nonunique|Exact work/cycle forensic history, cap 16|Proposed privileged forensic lookup only. No shipped RPC currently uses this work key; this is not a delivery, score, or requeue latency claim.|
|score_derived_delivery_attempts_v1_pkey|RETAINED correctness|Immutable event identity|Correctness constraint, not an optional performance index.|
|score_derived_delivery_attempts_v1_recovery_request_id_key|RETAINED correctness|Owner recovery identity and replay|Correctness constraint. The requeue RPC uses this exact receipt identity, not the work-history index.|

Migration 124 retains 5 explicit nonunique indexes and two indexes backing event/recovery identity constraints, for 7 new indexes. The 3 removed entries are historical reference definitions used only inside rolled-back tests. Migration 122 reuses the score-mutation receipt key; migration 123 adds no index; migration 121 indexes belong to the before-state.

## Applicable-state optional-index review

[delivery-index-review.json](evidence/delivery-index-review.json): recorded result PASS; counts {'tests': 23, 'pass': 23, 'fail': 0, 'skipped': 0, 'cancelled': 0}; Measured SQL/runtime/fixture dependency hashes match (or have exact reviewed no-impact exceptions).

Measured SQL/runtime/fixture dependency hashes match (or have exact reviewed no-impact exceptions). Execution provenance comes from delivery-index-review.json.

|Scale|Actual query/state|Installed in candidate|Variant|Default access|Filtered rows|Root hits|Root reads|Rollback|
|---|---|---|---|---|---|---|---|---|
|1|CALCUTTA_DUE|False|withIndex|production_calcutta_v1_claim_queue|0|3|0|True|
|1|CALCUTTA_DUE|False|withoutIndex|production_calcutta_v1_claim_queue|0|4|0|True|
|1|CALCUTTA_DELAYED|False|withIndex|production_calcutta_v1_claim_queue|1|3|0|True|
|1|CALCUTTA_DELAYED|False|withoutIndex|production_calcutta_v1_claim_queue|1|3|0|True|
|1|NET_SKINS_DUE|False|withIndex|production_net_skins_v1_claim_queue|0|3|0|True|
|1|NET_SKINS_DUE|False|withoutIndex|production_net_skins_v1_claim_queue|0|3|0|True|
|1|NET_SKINS_DELAYED|False|withIndex|production_net_skins_v1_claim_queue|2|2|0|True|
|1|NET_SKINS_DELAYED|False|withoutIndex|production_net_skins_v1_claim_queue|2|2|0|True|
|1|COMPETITION_DUE|True|withIndex|Result,Seq Scan|20|1|0|True|
|1|COMPETITION_DUE|True|withoutIndex|Result,Seq Scan|20|1|0|True|
|1|COMPETITION_DELAYED|True|withIndex|Result,Seq Scan|25|2|0|True|
|1|COMPETITION_DELAYED|True|withoutIndex|Result,Seq Scan|25|2|0|True|
|1|COMPETITION_TERMINAL_COUNT_DUE|False|withIndex|Limit,Seq Scan|25|3|0|True|
|1|COMPETITION_TERMINAL_COUNT_DUE|False|withoutIndex|Limit,Seq Scan|25|3|0|True|
|1|COMPETITION_TERMINAL_COUNT_TERMINAL|False|withIndex|Limit,Seq Scan|20|3|0|True|
|1|COMPETITION_TERMINAL_COUNT_TERMINAL|False|withoutIndex|Limit,Seq Scan|20|4|0|True|
|1|INTENT_BACKLOG_864_DEAD_0|True|withIndex|score_derived_intents_terminal_v1|0|2|0|True|
|1|INTENT_BACKLOG_864_DEAD_0|True|withoutIndex|Limit,Seq Scan|864|50|0|True|
|1|INTENT_BACKLOG_864_DEAD_1|True|withIndex|score_derived_intents_terminal_v1|0|2|0|True|
|1|INTENT_BACKLOG_864_DEAD_1|True|withoutIndex|Limit,Seq Scan|863|99|0|True|
|1|INTENT_BACKLOG_864_DEAD_101|True|withIndex|score_derived_intents_terminal_v1|0|7|0|True|
|1|INTENT_BACKLOG_864_DEAD_101|True|withoutIndex|Limit,Seq Scan|763|149|0|True|
|10|CALCUTTA_DUE|False|withIndex|production_calcutta_v1_claim_queue|0|3|0|True|
|10|CALCUTTA_DUE|False|withoutIndex|production_calcutta_v1_claim_queue|0|4|0|True|
|10|CALCUTTA_DELAYED|False|withIndex|production_calcutta_v1_claim_queue|1|3|0|True|
|10|CALCUTTA_DELAYED|False|withoutIndex|production_calcutta_v1_claim_queue|1|3|0|True|
|10|NET_SKINS_DUE|False|withIndex|production_net_skins_v1_claim_queue|0|3|0|True|
|10|NET_SKINS_DUE|False|withoutIndex|production_net_skins_v1_claim_queue|0|3|0|True|
|10|NET_SKINS_DELAYED|False|withIndex|production_net_skins_v1_claim_queue|2|2|0|True|
|10|NET_SKINS_DELAYED|False|withoutIndex|production_net_skins_v1_claim_queue|2|2|0|True|
|10|COMPETITION_DUE|True|withIndex|competition_recalculation_jobs_delivery_due|0|2|0|True|
|10|COMPETITION_DUE|True|withoutIndex|Result,Seq Scan|200|7|0|True|
|10|COMPETITION_DELAYED|True|withIndex|competition_recalculation_jobs_delivery_due|5|5|0|True|
|10|COMPETITION_DELAYED|True|withoutIndex|competition_recalculation_jobs_pkey|2|3|0|True|
|10|COMPETITION_TERMINAL_COUNT_DUE|False|withIndex|competition_recalculation_jobs_delivery_terminal|0|2|0|True|
|10|COMPETITION_TERMINAL_COUNT_DUE|False|withoutIndex|competition_recalculation_jobs_pkey|5|3|0|True|
|10|COMPETITION_TERMINAL_COUNT_TERMINAL|False|withIndex|competition_recalculation_jobs_delivery_terminal|0|1|1|True|
|10|COMPETITION_TERMINAL_COUNT_TERMINAL|False|withoutIndex|competition_recalculation_jobs_pkey|0|3|0|True|
|10|INTENT_BACKLOG_864_DEAD_0|True|withIndex|score_derived_intents_terminal_v1|0|2|0|True|
|10|INTENT_BACKLOG_864_DEAD_0|True|withoutIndex|Limit,Seq Scan|864|50|0|True|
|10|INTENT_BACKLOG_864_DEAD_1|True|withIndex|score_derived_intents_terminal_v1|0|2|0|True|
|10|INTENT_BACKLOG_864_DEAD_1|True|withoutIndex|Limit,Seq Scan|863|99|0|True|
|10|INTENT_BACKLOG_864_DEAD_101|True|withIndex|score_derived_intents_terminal_v1|0|7|0|True|
|10|INTENT_BACKLOG_864_DEAD_101|True|withoutIndex|Limit,Seq Scan|763|149|0|True|

Financial selectors are extracted from installed claim functions. Competition readiness uses the exact installed EXISTS predicate, not a query materializing both engines. Terminal selectors retain their actual caps. The current backlog models 432 first-entry hole transactions across 24 matches and two automatic families = 864 intents, with 0/1/101 dead letters. Current Competition has exactly five markers; prior years retain their own keys. Removed optional indexes are restored only as transaction-local reference counterfactuals. These are single plan executions, not tail-latency or write-amplification measurements.

## Index decision and limits

**RECOMMENDATION — candidate index scope is justified by the measured applicable states; no further index removal is required by this review.** Retain the two financial terminal indexes because their current capped-status selectors otherwise traverse retained terminal history; retain Competition due because its actual due EXISTS avoids irrelevant prior-year markers; retain the intent terminal index for a realistically dense current backlog; retain the exact-work attempt index for the explicitly proposed privileged forensic lookup. The latter is not a hot-path optimization. Remove both financial due indexes and the Competition terminal index because inherited current/active keys adequately serve these scoped selectors in the measured states.

This is conditional engineering acceptance of the local candidate DDL, not a universal claim that every retained index wins every plan. The default planner may prefer a sequential scan on a small relation. The delayed Competition branch has a lower-block inherited-key counterfactual, and the empty-intent case has no incremental benefit. The retained indexes solve the documented larger/applicable states while avoiding three unnecessary mutable indexes. Per-index write amplification, hosted DDL duration and workload mix remain staging/deployment questions; none was measured here.

## Financial-history selectors

[worker-history.json](evidence/worker-history.json): recorded result PASS; counts {'tests': 33, 'pass': 33, 'fail': 0, 'skipped': 0, 'cancelled': 0}; Measured SQL/runtime/fixture dependency hashes match (or have exact reviewed no-impact exceptions).

Measured SQL/runtime/fixture dependency hashes match (or have exact reviewed no-impact exceptions). Execution provenance comes from worker-history.json.

|Scale|Calcutta materialization ms|Competition materialization ms|Nonempty Calcutta claim ms|
|---|---|---|---|
|1|n=24; median 10.698; max 21.953|n=24; median 2.991; max 8.016|n=24; median 18.570; max 30.652|
|2|n=24; median 11.829; max 23.283|n=24; median 3.334; max 8.768|n=24; median 19.535; max 36.898|
|5|n=24; median 10.708; max 19.523|n=24; median 2.901; max 7.848|n=24; median 17.785; max 27.625|
|10|n=24; median 11.193; max 23.928|n=24; median 3.037; max 8.320|n=24; median 19.409; max 35.112|

Each cell pools three warm observations from each of eight different receipt branches. It is a descriptive median/max over 24 observations, not a repeated single-workload p95/p99 or a cache-controlled comparison. Every one of the 32 scale/branch combinations completed under the 5,000 ms worker statement budget. This is local query behavior, not Production throughput.

|Scale|Relation|Counterfactual|Nodes/indexes|Rows filtered (per node)|Hit blocks (per node)|
|---|---|---|---|---|---|
|1|calcutta_v1_recalculation_jobs|readinessWith|calcutta_v1_recalculation_jobs_delivery_terminal; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job|0; 0; 1; 1; 0; 0|2; 2; 3; 2; 2; 2|
|1|calcutta_v1_recalculation_jobs|readinessWithout|Seq Scan; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job|746; 0; 1; 1; 0; 0|89; 2; 2; 2; 2; 2|
|1|net_skins_v1_recalculation_jobs|readinessWith|net_skins_v1_recalculation_jobs_delivery_terminal; production_net_skins_v1_claim_queue|0; 0|2; 1|
|1|net_skins_v1_recalculation_jobs|readinessWithout|Seq Scan; production_net_skins_v1_claim_queue|569; 0|24; 1|
|10|calcutta_v1_recalculation_jobs|readinessWith|calcutta_v1_recalculation_jobs_delivery_terminal; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job|0; 0; 1; 1; 0; 0|2; 2; 3; 2; 2; 2|
|10|calcutta_v1_recalculation_jobs|readinessWithout|Seq Scan; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job; production_calcutta_v1_one_active_job|7451; 0; 1; 1; 0; 0|514; 2; 2; 2; 2; 2|
|10|net_skins_v1_recalculation_jobs|readinessWith|net_skins_v1_recalculation_jobs_delivery_terminal; production_net_skins_v1_claim_queue|0; 0|2; 1|
|10|net_skins_v1_recalculation_jobs|readinessWithout|Seq Scan; production_net_skins_v1_claim_queue|5690; 0|0; 1|

Index counterfactual and FinalRecap-ready plans are intentionally captured only on the none-receipt branch at 1× and 10×. Both current FinalRecap-ready captures contain 22 logged executions / 21 shapes and assert an eligible current result. All 32 scale/receipt combinations execute actual timed tick, Competition and nonempty claim operations. Nested plans are intentionally retained for the 16 combinations at 1× and 10×; 2× and 5× retain timings and runtime assertions with plans null. FinalRecap eligibility is separate from the Calcutta receipt matrix.

These are individual relation-node observations, not summed nested work. Counterfactual drops only the exact named candidate nonunique indexes recorded in its indexNames manifest and restores them through rollback. Historical eight-index observations remain bound to their original candidate. Each timed claim must produce an actual usable job/token/input. Financial result/history scale is distinct from protected annual terminal-intent/audit history.

## Protected annual retained history

[annual-admission-run.json](evidence/annual-admission-run.json): retained original result PASS (2/2), completed `2026-09-29T20:17:26.463Z`, receipt SHA256 `f4a1de5924ec26faf3d39fb2cacaca930afc20d529ebc9d9489ed832d1549d8d`. Its 129 capture-time dependency inputs, five directly recorded inputs and raw TAP remain unchanged and match current bytes. The broad global snapshot separately records the two server-module import orders before correction; those modules are absent from this suite’s actual dependency closure. [The independent import-only addendum](evidence/import-order-review-addendum.json) proves their function bodies unchanged. This is explicit dependency-scoped reuse of the original SQL evidence, not a rerun or a claim that annual admission exercised the changed module-loading order.

These retained plans use the unchanged 129-input annual SQL dependency closure described above. The original annual execution and its raw hashes remain historical; unrelated global import-order changes do not become newly executed proof.

|Scale|Operation|Samples|Median ms|Max ms|Tail proof|
|---|---|---|---|---|---|
|1|CURRENT_TICK|20|29.736|40.273|INSUFFICIENT_SAMPLE|
|1|NONEMPTY_COMPETITION_CLAIM|20|28.664|29.647|INSUFFICIENT_SAMPLE|
|1|OWNED_RECOVERY|20|31.770|32.623|INSUFFICIENT_SAMPLE|
|1|OWNER_REQUEUE|20|32.845|33.764|INSUFFICIENT_SAMPLE|
|2|CURRENT_TICK|20|30.160|35.737|INSUFFICIENT_SAMPLE|
|2|NONEMPTY_COMPETITION_CLAIM|20|28.906|29.727|INSUFFICIENT_SAMPLE|
|2|OWNED_RECOVERY|20|31.689|32.100|INSUFFICIENT_SAMPLE|
|2|OWNER_REQUEUE|20|32.637|34.084|INSUFFICIENT_SAMPLE|
|5|CURRENT_TICK|20|30.183|34.978|INSUFFICIENT_SAMPLE|
|5|NONEMPTY_COMPETITION_CLAIM|20|29.409|30.324|INSUFFICIENT_SAMPLE|
|5|OWNED_RECOVERY|20|32.713|35.052|INSUFFICIENT_SAMPLE|
|5|OWNER_REQUEUE|20|34.063|50.987|INSUFFICIENT_SAMPLE|
|10|CURRENT_TICK|20|30.096|33.406|INSUFFICIENT_SAMPLE|
|10|NONEMPTY_COMPETITION_CLAIM|20|29.083|31.419|INSUFFICIENT_SAMPLE|
|10|OWNED_RECOVERY|20|31.686|32.941|INSUFFICIENT_SAMPLE|
|10|OWNER_REQUEUE|20|32.802|33.424|INSUFFICIENT_SAMPLE|

Client process+connection+SQL wall time,20 repeated rollback-only operations per cell; query plans are separate exact current selectors, not full nested PL/pgSQL plans

These operations use the actual protected 2099 admission guard against 4/8/20/40 prior synthetic years and 5,184/10,368/25,920/51,840 terminal intents plus matching attempts. They do not represent every financial result, score revision, identity, or mutation-receipt distribution. Twenty observations per cell do not prove p95/p99.

## Existing FinalRecap publication selector

These retained plans use the unchanged 129-input annual SQL dependency closure described above. The original annual execution and its raw hashes remain historical; unrelated global import-order changes do not become newly executed proof.

|Scale|Noncurrent publications|Eligible|Actual|Default selected node|Rows|Filtered|Hit blocks|Rollback|
|---|---|---|---|---|---|---|---|---|
|1|1000|True|t|odds_published_current_milestone_idx|1|0|2|True|
|1|1000|False|f|odds_published_current_milestone_idx|0|1|2|True|
|10|10000|True|t|odds_published_current_milestone_idx|1|0|2|True|
|10|10000|False|f|odds_published_current_milestone_idx|0|1|2|True|

The actual private predicate executes with enable_seqscan=on and both compatible/incompatible current payloads. The existing current-milestone partial index is assessed; no new publication index is proposed. Twenty-four synthetic Final matches and publication facts are constructed with trigger/FK omission inside rollback while CHECK/uniqueness remain active. This proves the private predicate/plan, not protected Odds issuance or product eligibility. Earlier 7/70-row plans legitimately used tiny sequential scans (1/5 blocks, 6/69 filtered); retain that counterevidence.

## Forensic attempt and terminal-intent counterfactuals

These retained plans use the unchanged 129-input annual SQL dependency closure described above. The original annual execution and its raw hashes remain historical; unrelated global import-order changes do not become newly executed proof.

|Scale|Query|Variant|Selected access|Output rows|Filtered|Root hit blocks|Root read blocks|Rollback|
|---|---|---|---|---|---|---|---|---|
|1|ATTEMPT_EXACT_WORK_AUDIT|withIndex|score_derived_delivery_attempts_work_v1|1|0|7|0|True|
|1|ATTEMPT_EXACT_WORK_AUDIT|withoutIndex|Limit, Sort, Seq Scan|1|5185|126|0|True|
|1|CURRENT_TERMINAL_INTENT_STATUS|withIndex|score_derived_intents_unresolved_v1|0|0|1|0|True|
|1|CURRENT_TERMINAL_INTENT_STATUS|withoutIndex|score_derived_intents_unresolved_v1|0|0|1|0|True|
|10|ATTEMPT_EXACT_WORK_AUDIT|withIndex|score_derived_delivery_attempts_work_v1|1|0|8|0|True|
|10|ATTEMPT_EXACT_WORK_AUDIT|withoutIndex|Limit, Sort, Seq Scan|1|51841|328|883|True|
|10|CURRENT_TERMINAL_INTENT_STATUS|withIndex|score_derived_intents_unresolved_v1|0|0|1|0|True|
|10|CURRENT_TERMINAL_INTENT_STATUS|withoutIndex|score_derived_intents_unresolved_v1|0|0|1|0|True|

The exact-work query fixes tournament/family/work/cycle and limits 16 events. The terminal-intent selector fixes current tournament/DEAD_LETTER and caps 101. Both remove only their named index transactionally, verify exact index restoration and unchanged rows, and retain any alternate-index counterevidence. This is one execution per variant, not a latency distribution. The 10× no-work-index counterfactual can incur physical reads where the indexed probe does not; do not convert those timings into a controlled cache-neutral speedup ratio. Empty terminal probes do not model a dense dead-letter backlog.

**COUNTEREVIDENCE — PROVEN in the recorded fixture/source:** the new terminal-intent index is not chosen at either 1× or 10×. The pre-existing unresolved-intent index answers both with-index and without-index variants at one hit block and zero output rows. This does not prove the new index is never useful at a dense current backlog, but it does not justify an incremental-benefit claim for it. Preserve the negative result; do not manufacture necessity.

**PROVEN for the recorded source — local query-plan behavior:** the exact-work audit index avoids a full retained-attempt scan and sort at both measured scales. The 10× counterfactual performs physical reads, so observed instrumented times are not a cache-controlled speedup comparison. The supported claim is bounded exact-work retrieval with the index versus history-growing examined rows without it. The query remains a proposed privileged forensic query, not shipped worker or score behavior.

## Net Skins missing-marker revision lookup and worker lock distinctions

**SOURCE:** lock_net_skins_storylines_v1 first locks the exact current (tournament, round 0, TOURNAMENT_STORYLINES) marker. The ordinary existing-marker branch does not read result history. Only the absent-marker branch validates the exact job/configuration and computes max(result_revision)+1 scoped to that tournament and round, to insert the same demand the unchanged successful result trigger will publish in this transaction. The unchanged completion already performs this scoped revision check. Any later rejection rolls back the prefix-created row; receipt replay occurs before it.

The inherited production_net_skins_v1_result_history index orders (tournament_id, round_number, result_revision DESC), alongside the unique key on those fields. These provide a semantic bounded-key/max opportunity. Source inspection alone does not prove the optimizer selected the index for the new helper; only an actual captured plan may support that claim. No new result-history index is proposed, and this rare financial owner path is not a canonical score query.

**Concurrency evidence is separate from plan evidence.** Ordered R1/R2/R3 Net materialization locks prevent reverse-round batch inversion. One materialization family per RPC avoids carrying financial-family locks across incompatible control orders. Intelligence helpers use the inherited engine order. Calcutta claims flush intents before current-pointer/job locking; complete/fail lock current before job. Net owner completion locks exact Storylines before configuration/job/result. These are distinct cycles and must retain distinct regressions.

[net-owner-lock-order.json](evidence/net-owner-lock-order.json): recorded result PASS; counts {'tests': 20, 'pass': 20, 'fail': 0, 'skipped': 0, 'cancelled': 0}; Measured SQL/runtime/fixture dependency hashes match (or have exact reviewed no-impact exceptions).

[calcutta-lock-order.json](evidence/calcutta-lock-order.json): recorded result PASS; counts {'tests': 10, 'pass': 10, 'fail': 0, 'skipped': 0, 'cancelled': 0}; Measured SQL/runtime/fixture dependency hashes match (or have exact reviewed no-impact exceptions).

[worker-lock-order.json](evidence/worker-lock-order.json): recorded result PASS; counts {'tests': 5, 'pass': 5, 'fail': 0, 'skipped': 0, 'cancelled': 0}; Measured SQL/runtime/fixture dependency hashes match (or have exact reviewed no-impact exceptions).

[worker-failure-lock-order.json](evidence/worker-failure-lock-order.json): recorded result PASS; counts {'tests': 16, 'pass': 16, 'fail': 0, 'skipped': 0, 'cancelled': 0}; Measured SQL/runtime/fixture dependency hashes match (or have exact reviewed no-impact exceptions).

Failure and lease-expiry paths need their own lock proof: tick expiration locks all five current round-0 marker keys before its unchanged lease predicate; bundle failure locks its three keys in the same order; the future Intelligence claim uses this order in its first pre-existing lock statement. The inherited future Competition expiry domain is broader: exact target plus current generation, ordered by round and the inherited engine order. It preserves the existing UPDATE domain, including schema-permitted extra rows. Supported writers create five round-0 markers, but the schema does not impose a universal five-row cardinality bound. No arbitrary privileged-writer deadlock immunity or unmeasured extra-row capacity is claimed. Preclaim failure uses SKIP LOCKED and has separate counterevidence rather than an unnecessary ordering patch.

Measured SQL/runtime/fixture dependency hashes match (or have exact reviewed no-impact exceptions).

|Other-round noncurrent results|Actual helper access|Rows|Filtered|Hit blocks|Rollback|
|---|---|---|---|---|---|
|1000|production_net_skins_v1_result_history|1|0|3|True|
|10000|production_net_skins_v1_result_history|1|0|3|True|

This is the actual new missing-marker helper invoked by supported owner completion. It tests irrelevant other-round result history while all CHECK/unique/FK constraints remain active. It does not test growth of revisions within the current round, global financial lifecycle, or Production capacity.

## Inherited fence guard and remaining risk

The retained Phase 2 fence experiment measured 100/1,000 restored rehearsal rows and 25/250 hit blocks before the unrestored-only partial index, versus an empty IndexOnlyScan with zero filtered rows and one hit block. That index is already in migration 121. It is not a new Phase 2C improvement. The exact RUNNING/unrestored-FAILED guard semantics remain unchanged.

**UNKNOWN / NOT MEASURED:** per-index WAL, storage growth, isolated write amplification, hosted migration lock duration, provider I/O/connection headroom and Production capacity. A pending score intent does not qualify for the terminal-intent index; score latency therefore cannot prove the write cost of derived-job/attempt indexes. Ordinary transactional index builds require a separately authorized deployment schedule and rollback/forward-fix review. No Production query or index change is performed by this evidence workflow.

All historical receipts retain their original source identity. A stale-source label is not a claim that its recorded test failed; it means current-candidate certification needs the appropriate fresh run or explicit dependency-scoped review. No plan artifact substitutes for concurrency, canonical correctness, full lifecycle or physical evidence.
