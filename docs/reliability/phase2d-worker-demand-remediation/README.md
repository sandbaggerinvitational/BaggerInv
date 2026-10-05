# Part 2B-1 secondary-match demand remediation

Local remediation of the provisioning/test producer only. Hosted Certification was
not contacted or mutated. Stage A provider acceptance remains the retained PASS;
it was not rerun. This proof does not claim hosted autonomous processing.

## Decision and root cause

**Scoring-context preparation is unnecessary for Part 2B-1 worker demand.** One
supported `DIRECTOR.MUTATE_SETUP / upsert-match` presentation update creates the
four genuine required jobs. The producer may report `DEMAND_READY` only after
authoritative canonical replay proves that operation `COMMITTED`.

The former producer unnecessarily followed that update with
`prepare-scoring-context`. These are two independent canonical transactions.
The hosted first transaction committed setup revision 5 and cycle-29 demand.
The second transaction returned `NOT_COMMITTED /
TOURNAMENT_SETUP_DEPENDENCY_BLOCKED / CALCUTTA_AUCTION_DEPENDENCY`. Throwing one
generic producer failure obscured the already-committed demand and rerunning the
whole procedure could issue another update with a new identity.

The fresh local fixture contains Calcutta configuration at auction revision 0,
not the preserved purchase/clear history that made the hosted current auction a
valid empty revision 2. This proof uses supported synthetic purchase and clear
operations locally to reproduce that history; it does not fabricate facts in the
preserved hosted fixture or require financial mutation on resume.

## Unchanged installed contracts

The authoritative source is `supabase/canonical_bootstrap/schema.sql` plus the
already-reviewed `calcutta-empty-auction-demand-v1.sql` forward correction.
No schema, canonical function, shipping adapter, consumer or worker is changed.

| Requirement | Canonical contract and evidence |
|---|---|
| Minimum genuine demand | `apply_tournament_setup_match_v1`: tee time is a presentation change; a lawful update still updates the match and invokes its canonical trigger. Course/tee/round/format changes retain their structural checks. |
| Four worker families | `scoring_authority.enqueue_annual_derived_v1_change`: current tournament and open canonical ingress are required; match changes enqueue Competition and Intelligence demand with `CANONICAL_MATCH_CHANGED` provenance. FinalRecap demand remains ineligible. |
| Preparation | `apply_tournament_setup_scoring_context_v1` validates scoring inputs and structural dependencies before preparing a scoring snapshot. It is a separate scoring-setup contract. |
| Later participant scoring | Existing preparation, membership, participant, lifecycle, permissions, admission and current-context requirements remain intact. `DEMAND_READY` grants no scoring authority. |
| Worker eligibility | `canonical_claim_competition_derived_jobs_core_v2` and `canonical_claim_intelligence_derived_bundle_core_v2`, with `intelligence_delivery_ready_v1`, validate canonical worker context, current source/cycle, due state, attempts, claims/leases and bundle consistency. They require no scoring-context preparation. |
| Outcome recovery | Existing `replayCertificationIngress` performs full-request/hash verification. Existing canonical ingress status/resolution remains the sole authority for uncertain outcomes. |

Relevant source anchors in the base image: upsert around 4052–4200; preparation
around 4882–5120; dependency functions around 57000–57145; Competition/Intelligence
claim cores around 19026–19164; Intelligence due checks around 45605–45634; match
demand trigger around 105700–105900. These locations are evidence, not modifications.

## Calcutta dependency classification

| State | Preparation dependency | Automatic financial demand / lifecycle |
|---|---|---|
| No auction facts / auction revision 0 | No `CALCUTTA_AUCTION_DEPENDENCY` from auction history. Other setup guards still apply. | No financial demand. Fresh fixture has configuration but no auction revision. |
| Valid empty current auction, positive revision | `CALCUTTA_AUCTION_DEPENDENCY` for `SCORING_CONTEXT` with no targeted player. The guard explicitly tests positive revision, not fact count. | Clear is lawful; immutable financial history remains. No automatic financial demand; previously certified Mark Live semantics remain. |
| Valid nonempty current auction | Same structural auction dependency. | Existing nonempty financial demand contract remains. |
| Published auction, result revision, or eligible financial job | Additional `CALCUTTA_RESULT_DEPENDENCY` where applicable. | Existing publication, processing and privacy prerequisites remain. |

The narrow late-R3 transaction exemption remains exactly as installed. This task
does not invoke or expand it. The preparation guard is irrelevant to the worker
demand acceptance gate; no conclusion that it is an independent domain defect is
needed to correct this producer.

## Corrected producer and durable outcome contract

`tools/reliability/certification-worker-demand.mjs` is owner provisioning/test
tooling, never a shipping/client API. Its fixed synthetic target remains
`2026-R3-11 / C3 / Tournament / P01 Director`. Planning requires the secondary
match to be UPCOMING and unscored. Only the two fixed tee-time alternatives are
allowed. No arbitrary actor, match, queue, resource or destination is accepted.

The `certification-worker-demand-v2` checkpoint contains only:

- fixed contract/version and registered resource/project/revision/release/deployment binding;
- stable operation UUID, original expected setup revision and tee time;
- `PLANNED`, `UNKNOWN`, `DEMAND_READY` or `NOT_COMMITTED` state.

Fresh dispatch requires a caller-supplied durable `onCheckpoint` writer. Persist
the plan and then `UNKNOWN` **before** sending the mutation. Resume supplies that
same checkpoint. The owned local test writer uses a private file, fsync, atomic
rename and directory fsync; synthetic journals are destroyed with their cluster.
The execution tool does not write provider credentials or raw authority tokens.

| Observed outcome | Truthful producer behavior |
|---|---|
| Fresh plan, no prior operation | Persist before dispatch; execute one canonical upsert; verify its full-request replay. |
| First operation COMMITTED / old second step failed | Return `DEMAND_READY` from the original first receipt. Do not prepare, rebase, re-upsert or reverse committed work. Keep the old second operation's NOT_COMMITTED evidence. |
| COMMITTED exact replay | Same UUID/content returns the original outcome, with no new demand cycle. |
| ADMITTED, UNKNOWN, unavailable acknowledgement or absent uncertain origin | Remain UNKNOWN; no replacement UUID, automatic resend or inferred non-commit. Use the existing certified status/resolution path and replay the original request. |
| Authoritative NOT_COMMITTED | Preserve terminal rejection and original identity. Creating a deliberately new operation after correction is a separate explicit decision. |
| Conflicting same UUID/content | Canonical `CERTIFICATION_INGRESS_IDEMPOTENCY_CONFLICT`; no mutation. |
| Setup revision changes after planning | Canonical revision rejection; no silent rebase or overwrite of current work. |
| Concurrent duplicate calls | Canonical request/receipt locking remains final authority. One committed mutation/receipt and one demand refresh. Tee-time-only refresh can retain the same cycle because its canonical scoring source has not changed. |
| STOP / admission disable after commit | Committed evidence and pending required work survive. Full-request replay remains available; new mutation remains denied. |

`DEMAND_READY` describes the historical operation outcome. It is not a guarantee
that its old demand cycle is still current. The result explicitly requires source
and cycle revalidation at canonical claim. There is no claimed producer-level
atomicity across the retired two-step sequence.

## Existing hosted cycle-29 jobs

`evidence/retained-hosted-checkpoint.json` is a sanitized copy of the prior hosted
manifest and terminal receipts, **not a fresh hosted readback**. It preserves:

- exact registered Certification project/resource and deployment `dpl_5HLVAee2GwE3WkHbr3YNUWthJWc6`;
- application SHA `917d6942350fa835c65b356951019d298a91a4f3`;
- supervisor OFF revision 7, admission disabled revision 41, ingress PAUSED;
- supported upsert COMMITTED, preparation NOT_COMMITTED, secondary match unprepared;
- the four cycle-29 PENDING/current required jobs, attempts 0, no claims;
- zero leases/UNKNOWN/dead letters; valid empty Calcutta revision 2; FinalRecap ineligible.

**Use these four jobs directly on resume**, subject to fresh exact tuple/source,
resource/registration/release/deployment and claim-state verification. There is no
reason to create replacement demand or prepare scoring for their processing.
The 2026 canonical demand contract uses a null job `runtime_generation_id`;
current Certification authority/generation is validated by the wrapper and
canonical claim. Do not invent a different job-row generation requirement.

If source/cycle has advanced, STOP and classify supersession through the existing
contract. Do not process stale captured tuples, recreate demand automatically or
manually relabel/delete pending jobs. While admission is disabled these jobs are
preserved required work, not permission to process them.

## Local proof and impact

The focused owned PostgreSQL proof covers configuration revision 0, supported
nonempty purchase, lawful clear to empty revision 2, unchanged preparation denial,
partial commit, durable checkpoints, duplicate/conflict/concurrent replay,
lost acknowledgement with authoritative COMMITTED recovery after PostgreSQL
restart, UNKNOWN absence, NOT_COMMITTED stale revision, newer-source preservation,
STOP and resource/role boundaries.

The unchanged `consumeCertificationQueueMessage` calls the unchanged bounded
supervisor and existing worker adapter. Actual local canonical claims process all
four jobs, write one current output per family and fully drain them while the
secondary match remains unprepared and scoring stays closed. No processor is
called directly by the test and no job is manually inserted. Queue transport and
provider identity are modeled locally; actual hosted delivery still requires the
separately authorized Stage B run.

Affected queue recovery/crash callers use the durable checkpoint callback. The
source-supersession case uses a separate supported preparation operation in its
fresh auction-revision-0 fixture to create a genuine newer scoring source; it
does not infer source revision advancement from a tee-time-only demand refresh.
Preparation remains absent from the producer and the empty-auction worker proof. Retired
v1 test callers receive only the same compatibility callback and are not rerun as
Stage A/provider acceptance. The main queue test's producer case description no
longer asserts preparation. Shipping source, SQL, schema, worker and SDK files are
unchanged. Broad regression/build and 864 holes are not required by this impact.
The accepted broad baseline remains retained evidence, not a new test result.

Catalog hashes/ACLs/owners/security modes/RLS are identical before and after local
operations. Direct private-core probes under anon/authenticated/service_role
remain denied. Calcutta financial state is identical across producer and worker
execution; no automatic financial job/intent, score, Odds, Google or FinalRecap
output is created. Final local controls are OFF / DISABLED / PAUSED with no active
claim, lease or dead letter.

## Exact separately authorized hosted resumption

1. Keep the current hosted deployment/SHA. No deploy, rebind, SQL/configuration
   installation or Stage A replay is needed for this tooling-only correction.
2. Re-read the exact four cycle-29 tuples/current source revisions, attempts 0,
   claims absent, safe checkpoint, resource/registration/deployment/release and
   FinalRecap/Odds/empty-Calcutta boundaries. Material drift: STOP and classify.
3. Activate only through the existing certified owner operation, then owner START
   the finite supervisor with the minimum reviewed budget. No demand producer call.
4. Publish through the existing exact Preview-native handoff. Let native consumer
   delivery autonomously discover/claim/process the **existing** four required jobs.
   No manual worker or direct processor invocation.
5. Continue only the remaining approved duplicate/concurrency/lost-ack/lease/retry/
   halt/dead-letter/stale-source cases. A later demand-refresh case can use the
   corrected one-step producer with its durable journal. A true source-supersession
   case needs a separately lawful source-revision change; tee time alone does not
   supply that proof. Validate its actual domain prerequisites before execution.
6. STOP, reconcile/drain all required work, and return OFF / DISABLED / PAUSED with
   zero active claims/leases/unresolved outcomes/unexpected dead letters. Preserve
   the primary Final match and second unscored match. Do not begin Part 2B-2.

This task does not authorize those hosted steps. It leaves the four jobs untouched.
