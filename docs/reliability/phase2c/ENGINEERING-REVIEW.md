# Phase 2C engineering review

**Candidate advancement is blocked: Phase2C is PARTIAL.** Resolve [Google mirror/archive delivery and financial isolation](GOOGLE-OUTBOX-GAP.md) before owner staging review. The later-stage checklist below is a plan, not current readiness or deployment authorization.
This candidate extends the undeployed Phase2 score-path candidate. All measurements and runtime proofs are local/non-Production. The final [certification](CERTIFICATION.md), [proof matrix](PROOF-MATRIX.md) and [evidence ledger](evidence-ledger.json) govern the verdict; this architecture description alone is SOURCE evidence.

## Recovery before and after

Before, a committed score could lose its acknowledgement and then lose permission to replay when Lock/Finalize revoked access. Receipt durability protected the score but did not supply a supported participant recovery capability. After, a separate bounded read validates current Auth identity, linkage, membership, actor and exact immutable originating Auth UUID. It returns the original accepted receipt after Lock/Finalize while scoring admission stays closed. The returned receipt describes that mutation, not necessarily the latest corrected score.

Migration122 adds nullable originating_auth_user_id to score_mutations and patches only the two accepted score-receipt inserts (2026/annual). No guessed historical backfill occurs. Legacy, absent, inflight, another origin, and semantic NO_CHANGE without a receipt remain UNKNOWN. No false NOT_COMMITTED result is returned. The read joins the exact existing match/mutation key; it does not take the competitive match write lock or scan historical scores. The old receipt and all existing canonical fields are verified across an actual121→124 isolated upgrade.

The additive PWA/mobile POST routes accept two identifiers in a1KiB JSON body, preserve default-off native read admission and revalidation, authenticate before reading, return no-store responses, and use process-local per-account limits. They never accept caller-supplied identity or gross data. Shipping Build10 does not yet consume recovery. Supabase provider Auth transport, distributed abuse controls and a whole native client remain separate proof layers.

## Delivery before and after

Phase2 commits score authority, required receipt/audit and small durable derived intents atomically. Phase2C keeps that transaction boundary. A supported process-lifetime worker now independently polls committed demand, materializes bounded batches, invokes existing calculators and guarded completions, and retains current result pointers. A completed intent proves only materialization. Tests must additionally recompute canonical source fingerprints and verify completed current results.

Existing Calcutta and Competition/Intelligence job tables remain the queues. NetSkins configuration, processing and publication remain owner-approved; automatic materialization reports WAITING_OWNER. Odds publication is not automated. Final recap requires existing Final and published Final Odds eligibility. No new broker, alternate score authority, payout rule or automatic publication is introduced.

Each worker tick performs three separate service RPC transactions, explicitly scoped to CALCUTTA, NET_SKINS or COMPETITION. Each can materialize at most8intents. The three-call total budget is up to15seconds of sequential worker SQL, plus transport/processing; each call has its isolated5second bound. Scoring retains its separate1second test budget. Cancellation/incomplete status stops the cycle and cannot be reported idle.

This separation is necessary: the first combined tick retained NetSkins then Competition locks, while actual control transitions held Competition then financial locks. The full sequence exposed an actual Lock57014, and a targeted test preserved its reciprocal lock graph. Separate transactions release each family's locks before entering another. Intelligence's own bounded five-row prefix follows the existing control trigger order. A later actual interleaving then proved that inherited owner Net Skins completion itself inverted Storylines and financial locks against Lock/Finalize. That separate defect requires an exact Storylines-key lock before financial configuration/job locks, including a transactionally safe absent-key case; merely fixing the combined tick was insufficient. Calcutta claim/completion/failure also required current-before-job locking, with intent flush before current locking on claim. The final source, focused before/after graphs and complete432-hole sequence must all agree before certification.

## Failure and lease-expiry lock paths

**PROVEN — local PostgreSQL/concurrency:** a later review found four additional inversions that ordinary successful delivery did not cover. Empty materialization can acquire no marker locks, so it cannot protect a following unordered lease-expiry UPDATE. Likewise, a correctly ordered helper does not undo keys already acquired by an earlier alphabetical prefix. The exact pre-fix bodies and failing lock graphs are preserved; they are not replaced by source-only assertions.

| Effective function | Final lock acquisition | Unchanged correctness boundary |
|---|---|---|
| `public.score_derived_delivery_tick_v1(jsonb)` | For the Competition family, lock all five existing current-tournament round0 markers in inherited control order before the expiry UPDATE. | Generation, RUNNING state and expiry predicates remain in the UPDATE; one materialization family per transaction remains required. |
| `public.fail_intelligence_derived_bundle_v1(jsonb)` | Lock the three existing current-tournament round0 Intelligence bundle keys in that order before the failure UPDATE. | Original status and exact claim identity still decide which rows may transition. |
| `public.future_production_claim_competition_derived_jobs_v1(jsonb)` | Lock the exact target/current-generation expiry domain by round, inherited engine order, then engine-name fallback. | Preserve the inherited UPDATE domain, including any non-round0 row. Do not silently narrow old expiry behavior. |
| `public.future_production_claim_intelligence_derived_bundle_v1(jsonb)` | Replace the first inherited alphabetical lock prefix with inherited control order in the same location. | Existing admission, active-lease check and later readiness helper retain their positions and semantics. |

The common order is Team Momentum → Tournament Storylines → Tournament Intelligence → Projection Editorial → Tournament Final Recap. Prefix eligibility is deliberately independent of the clock: a sibling can expire while a transaction waits for another row. No new global or match lock, timeout increase, scoring-rule change, retry-budget change or authority shortcut is introduced.

The [focused wrapper](evidence/worker-failure-lock-order.json) passes 16/16 on migration124 `69821b9d98a585c0545e9b5e68968fa7c1a0cebf12e0ba9699c4590f5763bc48`, with stable source hashes. Fourteen schedules cover actual Lock/Finalize before and after, two unchanged preclaim SKIP LOCKED counterexamples, and both actual future claims against the installed control trigger. The annual schedules use an explicitly labeled outer runtime seam and synthetic match-control DML; they do not replace protected annual Director RPC evidence. The future Intelligence case starts the complete actual claim after the control's first lock; no worker lock is manually supplied. All schedules retain 18 canonical holes. Five catalog comparisons preserve owner, ACL, security-definer status, search path and volatility.

**Scope limit:** supported Competition writers produce five round0 markers. The schema also permits additional round/engine rows, and the future expiry UPDATE already includes them. Its prefix therefore preserves that wider exact tournament/generation domain. The five-row workload is supported-writer boundedness, not an unconditional schema bound. Arbitrary privileged reversed arrays, extra-row capacity, other lock graphs and hosted contention are not certified. Existing bounded retry for PostgreSQL40P01 remains necessary. `fail_score_derived_preclaim_v1` was reviewed and left unchanged because actual reversed work lists skipped the control-held sibling and both transactions committed.

The annual implementation manifest records current helper bodies, queue structure/indexes and inherited annual worker definitions; its fingerprint changes with these SQL bodies. Existing certifications remain a migration stop requiring review, not permission to delete certification evidence. Broader focused suites and the integrated sequence must be rerun on this final SQL before the package can claim final candidate coverage.

## Retry, terminal state and authority

Persisted cycle, attempt, next-available time and terminal fields govern retries. Each logical source cycle permits at most5attempts. Known transaction/connection/timeouts retry with bounded exponential backoff; deterministic missing-function/input/security errors terminate visibly. Lease expiry permits reclamation, never concurrent lease transfer. Failure acknowledgements bind exact claim or tick-captured work identity/cycle/attempt. An unavailable failure acknowledgement causes a visible halt rather than an unbounded retry loop.

The append-only private attempt ledger records safe error class, exact work/cycle, worker, source generation, originating/handling activation when known and processor contract. Exact Director requeue preserves previous attempts and binds a request UUID to actor, target and reason. A compatible release can replace eligible pending Calcutta work with linked supersession; old running claims wait for expiry. Old completion must never overwrite a newer current result. Global database-unavailable retry state cannot be durably persisted in the unavailable database; a hosted supervisor must respect the runner's bounded halt.

## Annual SQL and lock correction

Migration123 executes exact source-hash/anchor guarded edits for14actual invalid pg_catalog.LEAST/GREATEST uses; applying a migration alone is not proof. The historical functions are invoked to reproduce42883, followed by corrected execution and applicable stale/lease/retry branches. Further actual annual integration failures required a local PL/pgSQL variable rename for42702, exact recognition of the legitimate sixth Auth attribution trigger, and removal of an obsolete false-only writer CHECK only after its replacement contract is verified. Missing/extra/disabled/tampered security topology remains rejected.

NetSkins materialization acquires the fixed R1→R2→R3 advisory prefix before intent rows for one tournament/runtime generation. This intentionally serializes those short worker transactions. It leaves score writes independent. Actual repeated opposite-round schedules,40three-worker stress batches, and serial/concurrent unchanged calculator output comparisons cover the known cycle. This is not a claim that all possible PostgreSQL deadlocks are eliminated.

## Query plans, indexes and cost

Recovery reuses the exact receipt key. Migration124 retains five nonunique indexes: financial terminal lookups for Calcutta and Net Skins, Competition due work, terminal intents, and exact-work attempt history. The attempt ledger also has event identity and requeue-UUID uniqueness, for seven new indexes total. Three optional indexes were removed after applicable-state counterfactual review: both financial due indexes and the Competition terminal index. Their original definitions and measurements remain historical evidence. The [query report](QUERY-PLANS.md) separates actual plans, rollback counterfactual index removal, nested-statement observations and unmeasured write amplification. Exact bounded current-authority reads for intent eligibility remain in canonical scoring; a zero-derived-table source rule would be incorrect.

The [performance report](PERFORMANCE.md) keeps1/2/5/10history, eligible branches, rollbackRPC timing, committed sequence, lock lower bounds and transaction upper bounds separate. Finite1s/5s profiles are test settings, not Production configuration changes. Local fsync=off and synthetic authority substitutions cannot establish hosted I/O, auth transport, pool or power-loss durability.

## Migration, compatibility and rollback

The [complete migration manifest](MIGRATION-MANIFEST.md) and [machine inventory](migration-manifest.json) list every added, changed and renamed function, all schema objects and exact SQL hashes. These are SOURCE-inspected counts, not an inferred hosted catalog PASS. Across122–124, the schema adds one private20-column attempt table,18columns to existing tables, five derived-queue/provenance triggers and seven indexes; it removes one exact obsolete CHECK. Existing score-table RLS and write grants remain unchanged. The only canonical scorer body edits append validated Auth origin to newly accepted mutation receipts. There is no explicit historical identity/job/result backfill; old queue rows receive constant delivery metadata defaults and old receipts remain unbound.

Per-migration function operations are122: four new definitions and two existing body edits;123:16existing body edits;124:20new definitions and15existing body edits. The new definition counts include each replacement manifest after its predecessor is renamed; recurring names must not be summed as distinct final signatures. Migration124 adds four WORKERS/MUTATION dispatcher targets and122 adds one CURRENT_READS/READ target. API-exposed functions are service-only; private future targets remain owner-only.


Apply121→122→123→124 only in an independently verified non-Production candidate. Exact installed-source fingerprints, grants, search paths, RLS/private helpers and annual implementation manifests fail closed. Existing annual certifications deliberately stop these migrations for review; never delete evidence to bypass that stop. These versioned migrations are not blindly repeatable commands. See [deployment plan](DEPLOYMENT-PLAN.md) for eventual staged sequencing and forward/rollback constraints.

No existing score request/response, stroke/net/points rule, publication policy or shipping native source changes. The retained native model accepts UTC candidate responses but rejects the preserved non-UTC counterexample; hosted UTC must be verified later. Rolling back application routes/runner is distinct from reverting SQL: never drop provenance, receipts or queued work. Reverting124 alone requires compatible processors; reverting123 alone reintroduces known lock/SQL defects. Future deployment risk remains high until isolated hosted migration, supervision, compatibility and rollback rehearsal pass.

## Review boundaries

Production queries/mutations/deployments, staging deployment/certification, real participant communications, real competitive mutations and Build11 implementation: none. Git branch push is separately authorized; it is not a deployment command. External Git-provider Preview automation is not inspected or certified. Known native navigation/persistence defects, Production capacity, restore drills, full Director usability and2027 tournament readiness remain outside this candidate's proof.

## Performance qualification

One local eligible-history batch failed the fixed tail-regression gate; a single unchanged-code repeat passed. Both are retained; the cause remains UNKNOWN. No unconditional latency non-regression or approved replacement-baseline claim is made. See [performance evidence](PERFORMANCE.md) and P2C-NEW-PERF-VARIANCE.
