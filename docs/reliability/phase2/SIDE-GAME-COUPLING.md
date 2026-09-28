# Side-game and projection coupling

This source analysis uses the Phase 1 installed migration chain. Candidate behavior requires the runtime gates in [certification](CERTIFICATION.md).

| Domain | Before synchronous work | Candidate score work | Post-commit work | Why golf correctness does not require calculation before commit |
|---|---|---|---|---|
| Calcutta | Source JSON all current rounds/matches/participants/holes; hash; current result/eligible historical compatibility; tournament pointer lock/advisory lock; active job supersession/insert; completed-round state | Preserve admitted score-origin trigger scope; append/coalesce CALCUTTA intent only | Existing claim materializes current-authority enqueue then existing calculator/complete | Calcutta derives allocations/presentation from committed golf and financial revisions; it never supplies gross/strokes/net/hole winner |
| Net Skins | Current configuration/round source JSON; hash; per-round advisory lock; active job supersession/insert, twice per normal score | Preserve configured-round and runtime scope; append/coalesce NET_SKINS intent | Existing claim materializes current-round enqueue and retains current source completion checks | Membership and Full Course Handicap policy remain configured server facts; result eligibility derives from committed golf |
| Odds | No direct Odds calculation/publication trigger on a normal hole save found | Unchanged | Explicit milestone/owner publication remains existing workflow | Odds is not score authority; no automatic financial/publication mutation added |
| Competition/intelligence | Five shared tournament job keys upserted from both hole and match AFTER triggers | Append/coalesce COMPETITION intent | Existing competition/intelligence claim materializes five markers then unchanged processors | Jobs are derived projections; durable demand is required but calculation and shared marker contention are not canonical golf |
| Google reporting | Bounded transactional mirror intent | Unchanged | Existing outbox delivery | External Google availability must not gate Supabase canonical commit |
| Final scorecard archive | Explicit immutable bounded 18-hole snapshot during Finalize; delivery job | Unchanged; standalone Finalize also retains its original synchronous side-game enqueue | Existing archive worker | Final audit snapshot is deliberately part of Finalize authority, delivery is not |

The candidate deliberately limits trigger deferral to `hole_scores` and a `matches` update whose exact same transaction already has the COMPETITION intent for that match. Standalone Lock/Finalize/round status operations retain original derived queue effects. Actual enqueue spies in `P2-MIG-LIFECYCLE-SCOPE` prove this boundary; complete round-control and pairing workflow compatibility remains unproven.

## Financial freshness — preserve, do not invent

**PROVEN source:** Calcutta readers independently construct current source, compare the result fingerprint and expose `stale`/`updating`. Existing behavior may show a prior published result while a matching current-source job is PENDING/RUNNING; a Reopen that invalidates OFFICIAL semantics withholds it. Without a job, stale results become UNAVAILABLE. The candidate includes pending/retryable CALCUTTA intent in the existing `updating` boolean, preserving the stale/update interval before job materialization without changing response shape or setting `fresh=true`. DEAD_LETTER does not imply updating forever. Unchanged completion checks reject obsolete source/configuration/lease authority.

Net Skins exposes Official only on current source equality, otherwise active golf is IN_PROGRESS. No result or ownership is rewritten merely to clear a blocker. Odds publication is unchanged.

## Release 139 branch inventory

`late_r3_result_compatible_v1` migration 120 first rejects absent/noncurrent/wrong-policy/wrong-original-fingerprint receipts. Eligible receipts can still evaluate `late_r3_financial_fingerprint_v1` (all financial revisions/results) and `late_r3_consumed_fingerprint_v1` (round/setup/scoring/skins/golf history and financial hash). Multiple immutable compatibility receipts may be examined for the result. A compatible source/financial/consumed tuple is required; stale or superseded authority must reject. The candidate leaves those semantics intact for readers/workers and removes their invocation from ordinary score transactions.

## Failure boundary

Derived materialization/calculation failure after a score commits cannot roll back that score. Required intent insertion failure remains score failure because delivery integrity is part of the transaction. Raw database failure, authorization failure, stale context and locked/Final match remain legitimate canonical rejection conditions. Cross-family worker resource contention can still consume database capacity; local separation does not certify provider headroom. Bound worker claim count to eight intents and measure worker/backlog behavior separately.

## Close and deployment restrictions

Annual close and its certificate must see unresolved intents as well as existing job state. Emergency scoring admission closure remains available even if a derived worker fails. Pending intents remain durable while paused and resume only under compatible open authority; final annual handoff remains blocked. Migration installation refuses an already-bound annual side-game certification rather than silently changing certified implementation fingerprints. A later staged deployment must review exact current certificates and rollback; no Production facts are assumed here.

## Ordering and remaining product work

Intent provenance can arrive out of order; processors must always read current authority and their completion guards must reject stale calculation. Intent materialization alone is not a newly calculated or published result. Scheduling/lag alerts, owner-visible failed intent recovery and archive policy require later operational integration; invisible eventual work is not accepted as complete tournament readiness.

**PROVEN (POSTGRESQL):** two mixed-round Net Skins workers can deadlock on round advisory locks. The isolated cyclic graph yielded one caught `40P01`, one RETRYABLE intent, unchanged canonical data, and successful later processing of that same intent. The exception handler records retry state automatically; execution of a later claim is not automatic merely because `available_at` arrives. A new claim request fingerprint is needed if an earlier idempotent claim returned EMPTY. The test invokes the private materializer and advances the fixture clock; it does not prove a deployed autonomous poller. Dead-letter recovery remains an explicit unsupported operational gap, not permission for direct production table edits.

**PROVEN pre-existing defect:** actual future annual Calcutta/competition/intelligence claim initializers raise `42883` both before and after migration 121. Their qualified LEAST/GREATEST misuse is outside this candidate correction. Frozen 2026 processor proof does not certify these annual paths or their platform/manifest admission. See [migration safety](evidence/migration-safety.json) and [certification](CERTIFICATION.md).
