# Director canonical routing — scoped proof and remaining blocker

**PARTIAL.** The isolated Director now reaches a real canonical overview and the already-supported Finalize/Reopen operations. Complete isolated authoring parity remains unproved and unavailable. Existing Production-bound canonical capabilities are not made Preview-accessible by changing a resource identity or weakening admission.

Base: `4f5be5928a362f77edca375919df55be23695177`. Candidate source and final SHA are bound by the closure evidence manifest. This addendum does not rewrite the preserved [replacement design](../phase2c1/evidence/director-isolated-replacement-design.md).

## Reproduction and root cause

**PROVEN — SOURCE/API.** The non-Production page rendered `DirectorDashboard`, whose actual client selected GET `/api/director`. The retirement handler returned HTTP410 `GOOGLE_DIRECTOR_RUNTIME_RETIRED` and pointed to `/api/director/production-overview`, a correctly protected Production-only endpoint. An isolated account could not simply follow that recommendation. The original eleven provider-bound assertions failed at the base; [raw before evidence](evidence/director-capabilities-before.tap.gz) preserves the identities. Their failure count alone did not prove eleven distinct missing database capabilities.

## Implemented path

```mermaid
flowchart LR
  UI[Isolated Director console] --> Client[Canonical Director client]
  Client --> API[/api/director/canonical-overview]
  API --> Auth[Active canonical Director entitlement]
  Auth --> Scope[Exact isolated database and tournament scope]
  Scope --> Read[read_tournament_live_view]
  Scope --> Marker[Installed retirement capability contract]
  Marker --> Receipt[Exact match + operation receipt]
  Receipt --> Op[Existing Finalize / Reopen RPC]
  Op --> DB[Canonical score authority + snapshot + audit]
  DB --> Back[Canonical match readback]
  Back --> Client
```

The server takes actor and tournament from verified account entitlement, never from request-controlled authority. It denies bootstrap/impersonation/participant roles, a Production database URL in the isolated lane, scope mismatch, missing origin and cross-origin mutation. Supabase service credentials stay in server modules. The browser receives canonical display facts, explicit supported actions, and no private financial fields. Worker health is `NOT_OBSERVED`; a successful tournament read is not fabricated worker health.

GET and POST authorization outages return feature-local503. Known inactive/forbidden page authorization still redirects; transient unavailability preserves the existing shell/retry contract. Invalid JSON, missing canonical metadata, or a forged fallback response produces a typed client failure, never Google fallback or participant-session reset.

Finalize/Reopen hold existing canonical SQL transaction semantics. The new receipt lookup uses the existing `(match_id, mutation_key)` primary key and requires the same actor/action. A receipt can be recovered after Final revokes participant permissions. Success requires canonical readback; if receipt commits but readback transport fails, the API reports `committed:true`, the operation ID and `CHECK_STATUS_RETRY_SAME_OPERATION`. Lost transport preserves UNKNOWN and the same operation ID in the client. The console retains that identity across retry rather than issuing a new mutation. Only an explicit allowlisted pre-write/canonical rejection code with its expected status classifies NOT_COMMITTED; then the console clears the rejected predecessor and refreshes authority before a new user action. HTTP status alone never clears an unknown operation.

## Preview retirement prerequisite discovered here

**PROVEN — POSTGRESQL.** Production migration125 did not patch the independently installed Preview functions. Before new Preview migration `202609290002`, a real Preview canonical score call still created a Google outbox row. This is an additional scope-specific retirement defect, not a contradiction of the previous Production-shaped432-hole fixture.

The migration removes only Google outbox/archive job/checkpoint creation from three score/lifecycle inner functions and two snapshot functions. Canonical score, result, immutable snapshot, invalidation, audit and receipt work remain. Old job rows are preserved byte-for-byte; retired worker claim/configuration grants are revoked. The installed capability marker exists only after the same atomic migration commits. No real database or historical artifact was touched.

## Runtime evidence

- `test/reliability-phase2c1-closure-director.test.mjs`: actual shipping client/handler plus injected canonical dependencies; authorization, origin, isolation, response validation and lost-response behavior. UNIT/API/SECURITY/FAILURE_INJECTION; not hosted auth proof.
- `test/reliability-phase2c1-closure-preview.integration.test.mjs`: actual shipping client → actual API handler → actual server helper → actual installed canonical PostgreSQL RPC → canonical readback. Only account-provider authorization and HTTP transport are adapted to a synthetic entitlement and an owned Unix-socket database. No resource identity is changed to enter a Production route. Includes actual no-new-Google-job score, Finalize/Reopen, duplicate operation after revocation, conflicting identity, required-audit rollback and retained historical jobs.
- `test/reliability-phase2c1-closure-odds-inputs.test.mjs`: optional retired Odds import is terminal410 before provider work; the current Verify control invokes only canonical verification. No calculation/publication rules changed.
- Scoped results: Director client/API21/21, Odds input handler4/4, Preview SQL9/9, canonical Odds API/PostgreSQL13/13. Combined retained canonical SQL invocation30/30,0fail/0skip (including imported utility tests). Final reruns and source hashes are recorded separately by the closure runner.
- Raw PostgreSQL capability evidence: [director-canonical-postgres.tap](evidence/director-canonical-postgres.tap.gz). Retained Production-named suites use synthetic platform fixtures; they do not establish hosted access or the final full Production schema.

## Exact unresolved required capability boundary

**NOT PROVEN / PARTIAL — full isolated authoring.** Preview's canonical scoring adapter explicitly does not support Mark Live, Lock, Resume or access administration. Existing setup, Net Skins entry and Calcutta financial editing routes are Production-bound. Those required product capabilities exist canonically in the candidate, but the new isolated console cannot invoke them through the protected APIs. They must not be marked closed because a Production panel imports them or a database function passes in isolation.

Outstanding isolated capability groups: tournament/course/tee/handicap preparation; atomic round pairings; Net Skins entry editing; Calcutta ownership/purchase editing; complete scoring access/lifecycle controls. The old QA/impersonation selector is optional maintenance and is not recreated. No claim is made that all historical dashboard controls have been restored.

## Minimum safe follow-up

Define an explicit isolated Director operation context for the required canonical capabilities, using a verified isolated resource identity, account entitlement, tournament scope, existing operation receipts and existing domain RPCs. Keep Production resource/activation checks unchanged. For each capability, either a supported isolated database contract must exist or the UI must continue to report unavailable. Do not map a Preview environment to Production resource constants, expose a service-role client, or reuse the read-only shadow lane for writes.

Before staging review, prove each required client adapter → real API → canonical server command → disposable PostgreSQL → readback, with denial, stale revision, duplicate identity, post-commit recovery and no Google. This is targeted adapter/contract work; it does not authorize a new Director design or Round Control engine. The three separate current-read routing gaps remain governed by their own report.

## Migration and rollback

The new migration has a transaction, exact installed-source hash checks and exact replacement anchors; a different installed function fails closed. It does not drop a table, erase job history, change a score formula, increase timeout, add an index or alter Production migration ordering. It is an ordered one-time migration, not intended for repeated application.

Existing Preview code can still read the schema, but an old release expecting Google delivery would find the worker grants removed and new events absent. Therefore application-only rollback does not restore the old reporting architecture. A future hosted plan must retain a separately reviewed function/grant restoration plan or roll forward. This task installs nothing hosted. Full hosted migration and rollback proof remain NOT PROVEN.

## Canonical owner Odds capability closure

**PROVEN locally:** `CanonicalDirectorOdds` → `canonical-director-odds-client` → `/api/director/canonical-odds` → canonical job/calculation/publication functions → canonical readback. The API requires active account entitlement, Director role, non-impersonation, exact isolated resource admission and same origin for mutation. The shipping handler supplies `process.env`; the explicit environment argument is a test/dependency seam, not request-controlled authority. Service credentials, input snapshots, checkpoint state and claim tokens stay server-side.

A durable calculation is separate from publication. The panel shows actual completed result team names/probabilities before an explicit **Publish reviewed result** action. Calculation/retry never auto-publishes. Publication preserves existing opening and Round3 pairing validation, current source/settings/ratings fingerprints, final-result completeness and deterministic result validation. Readback verifies the retained canonical payload, not a fabricated client result. Publication followed by mark/readback failure retains the same completed job for idempotent recovery.

The previous Preview function still inserted `odds_google_mirror_jobs`; its before-state is reproduced in the new integration test. `202609290003_preview_odds_runtime_retirement_v1.sql` removes only that delivery/rehearsal consumer, marks new mirror metadata RETIRED, removes the mirror-supersession trigger and revokes worker replay. Historical jobs and snapshots remain unchanged. The new route checks the installed retirement contract before any mutation, so application code cannot create old Google jobs if migration has not been applied.

Current-job reads are bounded to four rows per fixed milestone (20 maximum) using the existing `(tournament_id, phase, requested_at DESC)` index; exact job reads use its primary key. The recorded local actual plan returns4rows by `odds_calculation_jobs_scope_idx`; no new index. Existing worker maxDuration800 is reused, with no database/score timeout increase. Migration003 checks exact predecessor/candidate function hashes, permits identical repeated application, preserves grants and requires a future rollback to explicitly review function/grant restoration. No hosted install occurred.

Evidence: [13/13 actual-chain cases and query plan](evidence/director-odds-canonical-postgres.tap.gz). This closes BROAD-NEW-073 at local scope; it does not close the separate protected read-admission routing gaps or the remaining seven required capability identities.
