# Stale-context retry and Calcutta lifecycle binding remediation

Local candidate based on `45c2d4be7d0b21759827900da9fd6dafd964c24b`. No hosted requests, provider configuration, deployment, release rebind, admission changes, worker processing, Production, legacy Preview, Google or messaging occurred. The owner-reported preserved checkpoint remains the authority for hosted state.

## Stale-context contract

Four active private Certification functions raise `CANONICAL_RESOURCE_CONTEXT_STALE`: `assert_certification_context_v1(jsonb,text,boolean)`, `current_certification_context_v1()`, `assert_certification_annual_abort_drain_v1(uuid,jsonb)` and `install_certification_annual_reopened_generation_v1(uuid,uuid,jsonb)`. Their original SQLSTATE is `40001`. Historical producers are migrations 131, 137 and 138; the frozen bootstrap repeats their final definitions. Every occurrence is inventoried in `source-inventory.json`. Historical migrations and the bootstrap remain byte-identical.

This is an intentional authority conflict, not a retryable MVCC serialization race. [Supabase's October 2 troubleshooting notice](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b) documents PostgREST 14's retry loop for custom `40001` and recommends `PT409` for HTTP409. [PostgREST's error contract](https://docs.postgrest.org/en/stable/references/errors.html) defines the PT status prefix.

The reviewed incremental artifact changes only these four exact raises to `PT409`, retaining `CANONICAL_RESOURCE_CONTEXT_STALE`. It checks all old-or-corrected SHA256 bodies and exact private ACL/owner/security/search_path before editing; unknown predecessors abort. It applies atomically and same-artifact replay performs no changes. `manifest.json` records predecessor/successor body hashes. No predicate, argument, resource/deployment/generation/revision comparison, other exception, function privilege, policy, data or receipt changes.

The existing JavaScript mapper recognizes the typed message, preserves `databaseSqlstate: PT409`, and returns sanitized HTTP409. It needs no change. PostgREST is no longer told to retry a serialization failure. Existing genuinely retryable `40001` handling in the worker classifier and transaction/recovery logic stays byte-identical. Other named business conflicts with existing SQLSTATE40001 are outside this bounded correction and remain inventoried, not silently normalized.

Affected paths include canonical reads/score/current/hole/finalize/reopen, Passport match authorization, Director lifecycle and derived worker gateways sharing these assertions. The two annual functions get the same literal correction so this exact error cannot recur through them; no annual chronology is rerun.

## Canonical Calcutta tournament binding

Both shipping Director lifecycle routes called the Calcutta hook with `""` after a truthful Finalize/Reopen commit. The hook requires an explicit tournament matching its server-branded Certification worker context. It correctly rejected the empty input, and three observed errors did not roll back committed lifecycle state.

`persistDirectorMatchLifecycle` already reads the canonical match, uses its `tournament_id` in the transaction authorization, and dispatches the unchanged canonical Finalize/Reopen/control operation. It now returns that same cleaned ID as internal `tournamentId` alongside the unchanged receipt. `/api/director` and `/api/live-matches` pass this ID to the unchanged Calcutta hook. Client tournament/resource fields are not selected. The SQL dispatcher independently rejects contradictory tournament/match authorization and binds the operation to the current resource/release/deployment. The new internal ID is not added to either public response.

Score/current and score/matches hooks already use their verified participant context target; the mobile post-commit helper already receives the authoritative target. They need no change. Production/legacy transport selectors, Calcutta target validation and all financial calculation/visibility code remain unchanged. For valid Production/Preview lifecycle operations, the newly explicit target equals the canonical match target already resolved by the existing hook.

## Post-commit and recovery contract

Canonical lifecycle commit and receipt precede Next.js `after()` work. Both routes catch/log hook failure as pending derived follow-up without altering the committed receipt, returning failure for the completed lifecycle, or resubmitting the lifecycle operation. The durable demand/intent is created by the unchanged canonical transaction; this notification is a bounded opportunity to process existing eligible work, not a second commit or the creation of financial facts.

A target mismatch before claim leaves existing demand untouched. Claimed Calcutta failures use the existing fail RPC/attempt/backoff/lease accounting; unresolved failure acknowledgement retains the claim for certified recovery rather than inventing completion. The delivery contract still caps attempts at five and applies its existing retryable/terminal/dead-letter classification. `PT409` is a deterministic conflict, not a transient serialization error. No new scheduler or requeue authority is added.

An empty valid current auction still creates no automatic CALCUTTA demand; explicit empty publication/calculation still fails. Nonempty demand, calculator, claim/complete, result revisions, receipts/audit and publication privacy are unchanged. The existing affected PostgreSQL suites prove these distinctions.

Durable ingress catches only its internal P1360 domain rollback sentinel; it does not reinterpret40001 orPT409 as a committed result. The existing Odds source-advance40001 catches and the source-conflict raises they handle remain unchanged. Mutation transport uncertainty remains UNKNOWN with the original operation ID after durable admission. Only the unchanged status/resolve path can establish COMMITTED or NOT_COMMITTED. A new typed conflict is not used to invent a terminal receipt at the HTTP layer.

## Local verification

Result: **PASS**. Focused **228 pass /0 fail /0 skip**; broad **4077 pass /20 exact established failures /0 skip**, **0 new unexplained failures**; build **PASS**. Results are in `evidence/` (`application.tap.gz` and `build.tap.gz` retain the raw logs with their original SHA256). The preliminary shared-memory, catalog harness and evidence-provenance setup failures are accounted in `verification.json`; none is an application/authority defect. The runner removes inherited provider credentials, disables telemetry and denies remote sockets. Owned socket-only PostgreSQL proves only four catalog function definitions differ; all remaining functions, ACLs, owners, security modes, search_paths, RLS/policies, relations, dependencies and row counts remain unchanged. The previously reviewed empty-auction forward correction is installed first to model the owner's database baseline.

Focused coverage includes prompt actual SQL PT409 rejection, current context success, resource/release/deployment/generation/revision negatives, private-core role denials, atomic failed predecessor preflight and artifact replay, real concurrent serializable PostgreSQL40001, shipping Passport sanitized409/single projection attempt, score/finalize/reopen error/recovery mapping, both Director routes' canonical target on Finalize/Reopen/re-finalize, client-selector exclusion, authorization denial, committed response preservation on post-commit failure, and strict wrong/empty Calcutta target denial. Existing Calcutta demand/worker suites cover empty/nonempty financial behavior.

The local SQL-to-HTTP transport is substituted at the HTTP boundary; no hosted PostgREST retry or new hosted scoring result is claimed. PT409's non-retrying provider behavior is documented and must be rechecked in the separately authorized hosted repro. The preexisting 18 hosted writes, lifecycle and recovery proof remains retained.

The broad regression uses the unchanged established493-file selection and accounts against the accepted4077-pass/20-failure baseline. New decisive cases run separately in focused proof. No864-hole or full tournament rerun: no scoring mathematics, domain mutation transaction, financial model or authority predicate changes.

## Hosted checkpoint retained, not queried

Project `trmcwrljjxwhgtikfdgu`; resource `CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51`; deployment `dpl_4tcmeVRmLX4gxz2qsDpYp1rYVmm8`; SHA `45c2d4be7d0b21759827900da9fd6dafd964c24b`; admission29 DISABLED; Director DISABLED; ingress PAUSED. Match2026-R3-12 FINAL revision26; second match UPCOMING/unscored. Required work, claims, leases, UNKNOWN outcomes and dead letters0. Production/legacyPreview/Google/real messaging0. Fixture repair required: NONE.

## Reviewed next hosted sequence — not executed

1. Independently reconfirm exact Certification checkpoint/configuration/current binding and zero leases/claims/UNKNOWN/required work. Inspect only Certification for lingering confirmed stale-context retry backends: changing a definition does not terminate an already-running PostgREST retry loop. If any exist, stop for a specifically bounded owner-approved cancellation/termination; no blanket restart or other-project access.
2. While DISABLED/PAUSED, install only `supabase/production_incremental/certification-stale-context-error-v1.sql` through the reviewed owner/TLS managed path on this exact project. Compare all four body hashes, full metadata/ACL/RLS/dependencies and retained base receipt/registration plus the separate forward-artifact identity. Existing empty-auction forward correction remains installed. No data repair and no receipt rewrite.
3. Deploy the exact new candidate once to the existing isolated Certification Preview branch/project with unchanged audited effective configuration. Verify READY real project/team/branch/SHA/origin. Perform the certified release-rebind and same-request replay while disabled/paused and drained; no direct row edits.
4. Activate through the owner control. Reproduce one safe stale-context request; require prompt409/CANONICAL_RESOURCE_CONTEXT_STALE/PT409, bounded latency, no repeated backend transactions, no committed mutation, and truthful recovery if a lease was admitted.
5. Use the preserved complete scorecard for shipping Reopen then re-Finalize of the same match, binding the canonical tournament into both post-commit hooks. No need to repeat18 score commits or touch the second match. Verify unchanged truthful receipts, snapshot/revisions and zero empty-auction financial demand/target errors.
6. Classify and drain only legitimate required work through the already-approved bounded processors; no autonomous scheduler, Odds publication or FinalRecap. Finish only remaining Part2A gates, resolve all leases/UNKNOWN outcomes, then certified DISABLED Director/scoring admission and PAUSED ingress with zero required work/claims/leases/dead letters. Preserve the fixture. Do not begin Part2B.

## Source and push boundary

Only three application files and one reviewed forward incremental artifact implement the fix; tests, runner and sanitized evidence are separate proof. Frozen bootstrap/historical migrations/registration descriptor/Vercel configuration/native shipping source remain unchanged. `vercel.json` already disables Git auto-deploy for `codex/reliability-phase2d-staging-admission`; committing/pushing this candidate does not authorize a deployment. No local credential files are read or removed.
