# Release A — late R3 lifecycle baseline (not deployed)

Read-only Production checks on 2026-09-09 confirmed release 71,
`41775822baa0131cf8d74be775c69b06169b2746`, deployment
`dpl_G63PxvjwT3S6cWuMgz3N4vbfJTfK`. Migrations `202609090095` and
`202609090096` each exist once; 097 is the next currently unused identity.
Neither installed migration may be edited.

Setup changed during the read-only audit. The latest observation is R1: six
Matches/24 participants; R2: six Matches/24 participants; R3: twelve Matches/zero
participants. All are UPCOMING. Scores and active scoring access are zero.
Two Round Save-All receipts now exist. R3 Match revisions are all zero, with the
original `2026-R3-N:S1` snapshot pointers. Approved handicap revision remains 7.
These observations are not permission to modify live setup.

The final financial/dependency observation was auction revision 0, result
revision 0, no pending/running Calcutta job, no blocking Odds dependency, and
Net Skins NOT_CONFIGURED. Refresh before any eventual release authorization;
concurrent Director operations are real and prior setup counts are not durable.
All twelve R3 managed Match Details exist with OCGC01 / Gold, and no prepared
context. Consequently the existing Director Match Details prerequisite does not
require a new late-auction course/tee mutation. Course/tee changes are not exempt.

## Integration boundaries

* Keep 095/096 source and Director API/client behavior unchanged.
* The 095 RPC validates the complete desired Round, then deletes all changed
  participant manifests before rebuilding through the individual helper.
  Initialization classification must therefore happen before that deletion.
* The existing immutable operation receipts establish exact-request retry
  identity; they are not a client-supplied lifecycle exception.
* Pairing save and scoring-context preparation both increment Match revision,
  which currently invokes the Calcutta trigger. An auction-guard exception alone
  is unsafe.
* Calcutta result freshness currently requires exact global source-fingerprint
  equality. A successor needs explicit compatibility evidence and must retain
  the historical result fingerprint, financial facts, and publication identity.
* Preparation is not the handicap freeze boundary. Preserve then-current
  approved-revision preparation and refresh of strictly unstarted Matches.
* Odds and Net Skins guards remain authoritative. An Odds publication/job that
  blocks setup remains a separate September 25 operational dependency.

No Production deployment, pairing mutation, scoring preparation, financial
mutation, Full-Net Release B, or native change was performed in this pass.

## Candidate and exact source boundary

Branch: `codex/release-a-late-r3`, based exactly on release 71.
Successor: `202609090097_production_late_r3_initialization_v1.sql`.

The only executable product change is this new migration. Other changed files
are this report, the new isolated PostgreSQL test, and four export lines in the
existing PostgreSQL fixture module. No app/lib/API/client/native source changes.
Migrations 095 and 096 remain byte-for-byte unchanged. The install transaction
checks twelve live-matched function-body fingerprints before making any change;
an unexpected baseline aborts installation. It creates no tournament setup,
auction, result, publication, handicap revision or initialization receipt.

The migration retains the finalized 095 and single-Match mutation bodies as
private functions and exposes the same public signatures through a server-only
dispatcher. Non-R3 operations delegate directly. The original service-only
grants, authentication, normalized Director payloads and response contract remain.
The 096 reader remains unchanged. No lifecycle client flag or token is added.

### Pre-mutation classification and history

The dispatcher acquires the same setup advisory lock as 095, then records the
actual R3 state before invoking 095. Only an empty canonical Singles Match with
no previous initialization receipt, pairing-change audit, participant snapshot,
scoring history or finalized result can qualify. A current or historical R3
Calcutta/Skins result prevents the exception. Ordinary canonical membership,
approved-handicap coverage, duplicate-player, access, lease and dependency checks
still run inside the unchanged pairing authority.

The transaction-only capability is private/revoked, not client input. Each
successful new Match gets an immutable receipt bound to tournament, Round,
Match, exact pair, canonical setup revision, operation ID, actor and pre-state.
An established Match is never classified using the temporary empty table left
by 095's delete/rebuild phase. A changed retry is an edit. Clearing a Match does
not delete its receipt/history. Exact retries retain canonical idempotency.

Preparation requires an exact receipt pairing and no intervening pairing-edit
audit. The original preparation helper still reads the then-current approved
revision and retains the prior snapshot. Preparation is not a new freeze rule.
Real revision-7-to-8-to-9 approval tests preserve started R1/R2 while refreshing
unstarted R3; no approval or handicap formula was changed.

### Financial compatibility and triggers

Only receipt-validated target R3 Match revision/snapshot-pointer changes inside
the same private transaction skip the existing Calcutta enqueue trigger. Other
trigger events retain the original path. An immutable compatibility record keeps
the original result ID/source fingerprint and records exact before/after global
sources, financial fingerprint, consumed-input fingerprint and policy identity.

The consumed-input proof includes all R1/R2 Match facts, participant bindings,
all retained snapshots, hole definitions, permissions, Match Details, all scores,
and canonical Round/course/tee/hole definitions,
Net Skins configuration/results, and unchanged Calcutta configuration, auction,
results and publication facts. It does not certify or change Full-Net formulas.
R3 has no consumed result under this exception. No historical fingerprint or
result payload is rewritten. The existing reader and ordinary enqueue/poll path
accept only a currently valid explicit proof; genuine consumed-input changes
still stale/invalidate and enqueue through existing authority.

An already-recorded equivalence can also recognize the exact immutable
before/after event chain of normal approved handicap refreshes for a still
unstarted, receipt-bound R3 pair. Unrelated source fields must match exactly;
unaudited handicap changes fail. No general tolerance or recomputation is used.
The reader adds `lifecycle_compatible` and the original result source fingerprint
to freshness metadata without changing the result/publication identity.

Pending/running financial jobs remain blockers. Setup uses coordinated EXCLUSIVE
table locks with NOWAIT for the short mutation transaction, covering legacy
writers that do not share the setup advisory lock. Ordinary SELECTs remain
available; a competing write/row lock causes safe rollback rather than bypass.
This is deliberately conservative: an unrelated busy writer can require a
normal retry after it completes. No jobs or leases are cancelled.

## Certification and limits

Evidence classes are deliberately separate:

* **Live Production, read-only:** release/migration/function ancestry, current
  setup shape and dependency facts above. No proposed operation was exercised
  against live Production.
* **Local PostgreSQL 17:** actual installed pairing/preparation/approval and
  Calcutta source/enqueue/read bodies, in a disposable socket-only database;
  no external connection. Environment/actor plumbing is a constrained fixture.
* **Synthetic financial scenario:** 24 purchased PLAYER assets, $16,800 market,
  unchanged ownership and a synthetic existing R1/R2 published payload prove
  preservation/compatibility. These are not live Production results or a new
  financial-engine/Full-Net certification.

| Combined matrix | Local result |
| --- | --- |
| Auction + started/frozen R1/R2 + empty R3; incremental 1–12 | Pass |
| 096 canonical read → unchanged Director review → save → prepare | Pass |
| 095 mixed unchanged/new Matches; pre-delete classification | Pass |
| Changed established pairing in Save-All cannot claim initialization | Pass |
| Late write failure rolls back all pairs, receipts, audits and revisions | Pass |
| Exact retry, conflicting retry, stale setup/handicap, security | Pass |
| Clear/repopulate and retained snapshot history | Pass |
| Duplicate golfer, wrong team, missing approved coverage | Pass |
| Receipt-bound preparation and retained prior snapshot | Pass |
| R1/R2 complete protected-input/financial fingerprints | Pass |
| Frozen edits, destructive roster/course edits, active scoring/leases | Pass |
| R3 result, Calcutta pending/running job, Odds publication/jobs | Pass |
| Net Skins configuration/result/job guards and historical R3 result | Pass |
| Result/publication identity and original fingerprint preserved | Pass |
| Neutral initialization/poll: no unnecessary Calcutta job | Pass |
| Genuine source change queues; omitted frozen input invalidates proof | Pass |
| Financial side-effect injection rolls entire operation back | Pass |
| Real approved revisions 7 → 8 → 9 and current-revision preparation | Pass |
| Auction/worker/scoring/handicap/Odds lock contention | Pass |
| Concurrent saves: one success, stale second rejection; exact retry | Pass |

Focused execution: 30 PostgreSQL tests (including three retained Director setup
integrations), 51 focused Director/application/handicap tests, one existing
SQL/JavaScript rounding-parity integration, and one real Director browser suite
at widths 390/430/820/1280/1440 passed with no skips. Two client-render suites
also passed all 16 tests when run with their correct normal Node condition.

The broad legacy suite is **not globally green**: both the exact untouched
release-71 worktree and this candidate produced 3,331 tests / 3,295 passes /
36 failures under the identical `--conditions=react-server` invocation. Failure
names match exactly; no new failures. Two are client-render condition failures
(the 16-test normal-condition rerun above passes). The remaining legacy
source/inventory assertions already fail on release 71; they were not rewritten
or hidden in this change. In particular the Google writer inventory assertion
concerns unchanged `app/api/tournament-guide/route.js`, not this SQL migration.
Do not describe this comparison as a clean whole-repository test run.

All 400 fingerprints in the pre-existing native candidate manifest verified.
No native, Director UI, applied migration, scoring/financial formula, rounding,
Full-Net consumer or deferred All Matches VS alignment was edited.

Reproduction (existing project dependencies and PostgreSQL 17 required):

```sh
node --test --test-concurrency=1 test/release-a-late-r3-postgres.integration.test.mjs test/handicap-js-postgres-parity-postgres.integration.test.mjs
node --conditions=react-server --test test/round-pairing-workspace.test.mjs test/round-pairing-read-envelope.test.mjs test/round-pairings.test.mjs test/step13e6-production-tournament-setup-application.test.mjs test/step13e6-production-tournament-setup-sql-contract.test.mjs test/step13e1-production-handicap-management.test.mjs test/step13e1-production-handicap-migration.test.mjs test/calcutta-full-course-handicap-v2.test.mjs
node --test test/guide-optional-content-render.test.mjs test/matchup-lab-ancillary.test.mjs
```

Run the PostgreSQL files serially on this host: simultaneous clusters exhausted
its shared-memory-ID limit during one attempt. The final serial run passed all
31 tests without skips. No unrelated process or shared-memory segment was
removed to make tests pass. Browser certification uses the existing local
Playwright runtime and `test/round-pairing-browser.test.mjs`; its fixture blocks
non-local requests and does not save any live Production pairings.

## September 25 operational verdict

**Safe after separate deployment and Production certification**, subject to
the preserved operational dependencies, not a claim that Release A is live.

1. Finish R1/R2 pairings and Match Details; leave R3 pairings empty.
2. Approve the applicable R1/R2 handicap revision, prepare each populated Match,
   and verify its exact revision, course/tee, participants and scoring readiness.
3. Start Matches only when play begins. Started/frozen R1/R2 remain protected;
   preparation alone must not be used to force a freeze.
4. On September 25, verify no blocking Odds publication/job, Calcutta
   pending/running recalculation, R3 Net Skins dependency, prior R3 result,
   active scoring permission/lease, or conflicting writer exists.
5. Use normal Director entry incrementally, or canonical complete Round Save-All.
   The server creates each first-initialization receipt automatically.
6. Review/approve the applicable R3 handicap revision; normal approval refreshes
   strictly unstarted Matches. Prepare R3 Matches, verify bindings/snapshots and
   readiness, then start normally.

No auction deletion, purchase/ownership removal, legitimate R1/R2 result
withdrawal, manual database edits, manual receipts/rebinding, or premature R3
pairings are required by the candidate.

**Odds risk: YES.** PUBLISHED Odds (including the public pointer), PENDING,
RUNNING or RETRYABLE jobs, and SUCCEEDED jobs awaiting publication with READY
status retain `ODDS_PUBLICATION_DEPENDENCY`. Publishing Odds before R3 is known
therefore requires a separate authority review before September 25. This
candidate neither weakens that guard nor recommends withdrawing/falsifying Odds.
Existing Round-targeted Net Skins guards also remain operational prerequisites.
Production Full-Net Release B remains separate and unimplemented.

## Deployment and recovery gate

No Production deployment is authorized. Before any later approval: reserve 097,
refresh the exact live release/function fingerprints and migration ledger,
recheck concurrent setup/dependency state, certify the exact candidate SHA and
choose a controlled write-quiet installation window. A changed baseline or
blocking financial/Odds state requires review, not an automatic workaround.

The migration is transactional: a baseline/DDL error rolls installation back.
It intentionally is not a repeatable migration; use the version ledger once.
Before any receipt exists, a separately reviewed successor could restore the
original private bodies/reader-trigger predicates. After legitimate R3 receipts
or compatibility records exist, never delete those records or rewrite published
fingerprints to roll back. Disabling the exception/compatibility would restore
old blockers and may stale an otherwise unchanged R1/R2 result; recovery then
requires a separately authorized forward migration retaining history and a
participant-visibility impact review. No automatic rollback/republication or
destructive down migration is included.
