# Canonical adapter design review

The missing isolated Director controls remain required. Their replacement must preserve canonical authority semantics. The simple Preview-wrapper proposals below are **REJECTED** because they do not implement the same operations as the established canonical contracts. This is a concrete semantic blocker, not a waiver based on implementation effort. Google remains retired.

## Net Skins entry authority — BROAD-NEW-010

**PROVEN at SOURCE and scoped POSTGRESQL layers:** entry registration and financial configuration are distinct authorities.

Canonical `save_production_net_skins_entries_v1` in `supabase/production_migrations/202609090098_production_net_skins_entries_v1.sql` writes only `production_control.net_skins_entry_revisions_v1`. Its response explicitly states `financialMutationCreated:false`, `scoringMutationCreated:false`, and `publicationCreated:false`. Entries bind to the exact canonical round field and pairing history. Clear/repopulate of the same pair cannot revive stale entry consent. History is immutable; retries use the original request hash and receipt. Saving rejects started matches, active scoring access/leases, existing bound financial entries/results, and active recalculation jobs.

`test/net-skins-entries-postgres.integration.test.mjs` executes BB/SC/SI, same-request replay, conflicting replay, stale revisions, changed pairing ancestry, immutable history, exact round scope, dependency guards, role denial, and database locks. Its `protectedFacts()` comparison asserts that entry registration changes **no** scoring, pairing, financial configuration, side-game jobs, Calcutta, or Odds facts. The retained local SQL rerun is indexed in `evidence/director-canonical-postgres.tap`; it does not prove an isolated HTTP authoring adapter.

The proposed shortcut was to wrap `replace_preview_net_skins_configuration` from `supabase/migrations/202608120029_preview_net_skins_derived_state.sql` with revision checks. That importer performs different work:

- It deletes configurations for omitted rounds.
- For every included round it rewrites configuration entries, including unchanged entries, and enqueues a `NET_SKINS` recalculation.
- It accepts configuration/financial facts rather than immutable explicit-entry decisions tied to canonical pairing ancestry.

Merging untouched rounds into the input prevents their omission, but still rewrites their rows and schedules their jobs. Narrowing the importer to one round does not resolve the more fundamental problem: an entry-registration action would become a financial configuration mutation, violating the existing canonical contract. Adding a revision check or receipt alone cannot make those operations equivalent.

**Decision:** do not expose the importer as the missing Director entry-registration route. No new financial SQL or alternate state machine was added in this review.

**Required next implementation:** introduce an explicit isolated authority context for the existing entry ledger, pairing-ancestry fingerprint, dependency admission and receipt contract. Reuse those domain functions/ledgers with verified environment and tournament scope; do not spoof Production identity or copy the algorithm into a competing Preview authority. Prove exact client → authorized API → same entry authority → readback, retain the protected-facts comparison, and add isolated route/security/race tests. This remains an open required capability until that implementation exists.

## Calcutta purchase/ownership authority — BROAD-NEW-011

**PROVEN at SOURCE and scoped POSTGRESQL layers:** auction facts, configured rules, result authority and publication are separate canonical revisions.

`replace_production_calcutta_v1_auction_facts` and the supported single-entry clear in `supabase/production_incremental/director-calcutta-clear-entry-v1.sql` preserve immutable auction history and validate exact configuration, auction and publication predecessors. The clear operation can legitimately remove the final purchase and its ownership rows; the tournament retains its existing configured rules. Calculation and publication then require auction facts, preventing an empty auction from appearing complete. Published state, result dependencies, concurrent saves/clears/publication and stale predecessors remain explicit guards.

`test/calcutta-clear-postgres.integration.test.mjs` proves those behaviors with actual PostgreSQL transactions, including empty final clear, preservation of unrelated purchases/ownership, immutable previous auction revision, replay, conflicting concurrency and security checks. It expressly substitutes only the hosted-resource admission function in its disposable fixture; this cannot be used to claim the actual isolated client route is implemented. The retained rerun appears in `evidence/director-canonical-postgres.tap`.

The proposed shortcut was to merge a purchase/ownership change into the current Preview configuration and call `replace_preview_calcutta_configuration` from `supabase/migrations/202608120037_preview_calcutta_operational_state.sql`. That importer is not equivalent:

- It requires at least one purchase (`CALCUTTA_PURCHASES_REQUIRED`), so the supported final-entry clear cannot succeed.
- It stores purchases, ownership, point rules, payout rules and financial summary in one `configuration_revision`, superseding the whole configuration on a change.
- It automatically enqueues `CALCUTTA` recalculation after a new configuration. The required auction-management predecessor/publication/result gates are not provided by the importer.

Preserving the rule JSON when merging does not preserve the canonical separation of configuration and auction revisions or the final-clear behavior. Allowing an empty importer payload, bypassing publication/result guards, or treating its configuration receipt as an auction receipt would change the contract rather than replace the retired provider safely.

**Decision:** do not expose this importer as canonical purchase/ownership management. No prices, ownership facts, payout rules, result rules or publication behavior were changed.

**Required next implementation:** expose the established auction-fact and clear operations through a verified isolated authority context while preserving their independent revisions, immutable history, idempotency receipts, dependency checks, exact current pointer and financial privacy. Reuse the canonical domain authority. Add actual isolated client/API tests, empty-clear/readback proof, rule/configuration invariance and concurrent save/clear/publish tests. Until then the required isolated capability remains open.

## Evidence limits and boundaries

This review uses repository source plus already executed isolated canonical SQL regressions. It does not claim that the rejected Preview wrappers were deployed or that hosted access was exercised. No new migration, privileged browser path, Google adapter, Production query, real financial mutation or external account operation was introduced. Full domain generalization requires an explicit reviewed context design; merely changing an environment string is not that design.

## Setup, course/tee, handicap and round-pairing context

**PROVEN from source:** the Preview bulk import is not an individual Director command. `supabase/migrations/202608120001_preview_scoring_authority_schema.sql` deletes and reconstructs tournament authority in its replacement path. It must not stand in for course/tee or pairings edits.

The canonical Production setup implementation (`202608300063_production_tournament_setup_v1.sql`, and its later guarded replacements) owns setup operational/team/round/course/tee/hole/match ledgers, an approved handicap revision, immutable receipts and audit. `assert_tournament_setup_match_mutable_v1` requires an unstarted match, revoked/consistent permissions and no current ingress lease. `mutate_production_round_pairings_v1` (`202609090095_production_round_pairings_v1.sql`) serializes against other setup mutations, checks replay before CAS, locks the approved handicap pointer and roster, validates the complete match/player set, and prepares the resulting context. These are correctness dependencies, not Google export details.

The existing server fixes resource identity to the protected Production contract and the SQL contains explicit2026 scopes. Pretending that a Preview request is a Production operation, overriding its runtime assertion, supplying caller-computed strokes, or replacing the entire Preview tournament would not preserve those invariants. No such shortcut was implemented.

**Required safe design:** make an explicit authenticated isolated operation context available to the existing canonical command/ledger implementation, parameterize exact tournament authority in one bounded boundary, install the same setup/handicap ledgers in the isolated profile, and prove receipt/CAS/freeze/lease/roster/round readback for every affected command. Do not create a second scoring/handicap algorithm or broaden protected resource admission implicitly. That context and its complete migration/compatibility proof are missing; source-only model tests cannot supply them.

This is a specific incomplete required capability, not a finding that the owner's requested replacement is forbidden or optional. It remains P0-F. The narrower diagnostic read-admission edit is separately pending owner confirmation after automatic approval review rejected it; that read-only decision would not authorize an isolated writer to impersonate Production.

## Lifecycle context — BROAD-NEW-012 and BROAD-NEW-174

**PROVEN from source:** `mutateCanonicalMatchControl` explicitly rejects the Preview adapter. The established `mutate_production_match_control` supports MARK_LIVE, SCORING_LOCK, SCORING_UNLOCK, ACCESS_ACTIVATE and ACCESS_REVOKE through revision-bound match locks, permission transitions, atomic receipts and audit. It fixes protected runtime and tournament scope before those operations. Mark Live does not implicitly grant participant access; collapsing these actions would revive an obsolete Google-era semantic.

The missing Mark Live primitive is more than a route alias: `assert_production_match_scoring_ready_v1` reads the prepared setup revision, exact current scoring snapshot, course/tee/hole definitions, approved handicap pointer and `handicap_v1_match_context`, comparing canonical participant/stroke context. The corresponding setup/handicap ledgers are not installed by the isolated Preview schema. A replacement that only checks whether 18 snapshot holes exist would weaken the current readiness contract. An adapter that passes a Production identity would weaken protected admission.

**Safe design:** expose a verified isolated command context to the same canonical lifecycle/readiness implementation after the shared setup/handicap ledger installation is defined. Parameterize tournament scope once; retain current lock order, CAS, permission revisions, receipt replay and atomic audit. Reuse the readiness authority, not a second calculator or a reduced predicate. Then exercise actual isolated client/API/SQL for Mark Live, Lock/Resume/access, stale revisions, denied roles, scoring races and unknown outcomes. Lock/access-only copying could make a subset operate, but would not close the required Mark Live/readiness capability and would create duplicate transition implementations. No such partial duplicate was introduced.

The user's minimum-replacement authorization remains valid. This is an exact missing canonical-context implementation and proof, not a claim that the user forbids further work. It remains a required closure blocker.

## Odds — BROAD-NEW-073 completed through an existing primitive

Unlike the missing setup/control context, Preview already has canonical durable calculation, deterministic result validation, current-input checks and publication/readback primitives. The missing piece was an explicit owner adapter and a leftover parallel Google delivery consumer. Those changes were implemented without another engine: a scoped client/API calls the existing functions, migration003 retires the consumer, and13/13 actual local API/PostgreSQL cases pass. The test reproduces the old enqueue, preserves its historical job, proves no new enqueue, requires owner confirmation, and covers exact scope, stale input, idempotency, audit rollback and post-commit recovery. This capability is PASS SCOPED; no hosted claim is made.
