# Authority, change and evidence governance


## Competitive authority ownership

| Domain | Source of truth | Mutation authority / timing | Validation, receipt and invalidation |
|---|---|---|---|
| Handicaps | Approved versioned server snapshot | Owner/Director before protected play; later correction explicit | Recompute affected contexts/allocations; approve before/after |
| Pairings/course/tee | Canonical setup revisions | Owner before play through setup guards | Unique roster, exact scope, semantic dependencies; stale prepared pointers |
| Scoring context | Prepared immutable server snapshot | Supported preparation operation after approved setup | Complete holes/HI/course/tee/participants; immutable receipt |
| Gross scores | Canonical Official revision | Authorized participant/Director through scoring RPC | Input bounds/role/revision/idempotency; audited correction only |
| Strokes/net/hole/match results | Server calculations on canonical snapshots | Server transaction; owner can request supported recalculation/correction | Formula/property/point invariants; versioned outputs |
| Team points/champion | Canonical match result aggregation | Server; owner approves close/correction | Totals equal allocations; side games cannot mutate champion |
| Net Skins | Versioned config/result/publication | Owner configuration/review; certified worker calculation | Exact membership/scoring input; publication and historical separation |
| Calcutta | Immutable auction/ownership/result/publication | Owner financial review; certified calculation | Prices/fractions/total; reason and before/after; portfolio stale on ownership change |
| Odds | Versioned inputs/milestone/result/publication | Worker calculate; owner public publication | Exact semantic fingerprint; stale unpublished supersession safely audited |

Canonical competitive data and correctness-critical derived scoring remain transactional. Presentation/cache/analytics cannot mutate or invalidate canonical authority. Historical archives reproduce past authority, not the current pointer. Every pointer has a single meaning, integrity constraint, supported update, audit trail and explicit current/historical distinction.

## Change review schema

Every critical PR/release declares ID/domain, competitive/contract/database/native/PWA/Director/dependency impacts, tests/physical tests, rollback and evidence invalidation. A new dependency guard must state the exact protected fact, why block, compatibility rule, supported clearance, auto-remediation class and owner message. A new hash must list semantic fields and canonical serialization. No unexplained broad revision hash.

Every critical SQL function declares owner/purpose/callers/input-output/side effects/locks/indexes/query cost/timeout/idempotency/errors/tests. Score/readback/Open/Prepare/Finalize/auth/activation changes require before/after path, plan/latency/failure/idempotency/physical review. SQL migrations must install clean, upgrade prior schema, actually invoke functions, prove grants/RLS/search_path and rollback compatibility. Application build success is insufficient.

Side-game review includes configured→published→golf→round final→recalc→next config→historical→final transitions. Native review includes session/navigation/persistence/network/offline/contract/migration/physical impact. Shared shell changes always invalidate navigation proof; queue changes always invalidate recovery proof.

## Approvals and automation

Owner approves competitive inputs, Open/Lock/Resume/Finalize, financial correction/publication, conflicting physical golf, Close and emergency Production release. Automation may validate/prepare a concrete proposal before approval, then execute exact scope under original authorization. No universal ignore-guards override. No override for identity/RLS, scoring math, idempotency payload conflict, unknown Official conflict or partial canonical integrity.

Break glass is a named incident-scoped, expiring operation with reason, bounded authority, receipt/readback and postmortem. Physical recovery is a supported routine emergency workflow, not privileged direct table editing. Release signing may remain local administrator action; routine tournament operations must not require it.

AI during Tournament Mode: read-only by default, allowlisted indexed current reads, separate short-timeout role/pool, one in-flight diagnostic, row/payload/time budget, query tags and no history/load/large aggregate. Mutation requires named supported operation and explicit scope; no direct score write/guard weakening/RLS bypass/secret exposure. Enforce in credentials/proxy/database grants, not just prompts.

## Governance register

Runbooks need ID/owner/version/last verification/prerequisites/safe-dangerous actions/expected state/stop/fallback/escalation/recovery/postcondition/evidence. Status progresses DOCUMENTED→AUTOMATED TESTED→OWNER REHEARSED→PHYSICAL REHEARSAL→TOURNAMENT PROVEN; contract changes expire affected status.

Jobs declare eligibility/input fingerprint/current authority/lease-heartbeat/attempt-retry/dead letter/supersession/publication compatibility/operator visibility/archive. Operations declare ID/fingerprint/status/receipt/replay/readback. Errors declare domain/meaning/retryability/mutation guarantee/user+Director messages/telemetry/runbook. Critical tests declare requirement/incident/owner/environment/proof layer/blocking; P0 flake cannot be ignored.

Normal release: complete applicable evidence and protected promotion. Freeze release: incident/risk/affected proof/rollback plus owner authority. P0 emergency: minimum exact reproduction/patch/focused full relevant security+integrity regression/staging/rollback/canonical smoke; no waiver of safety. Rollback checks schema/data/jobs/contracts/activation and old clients, not simply old SHA.

Native freezes early for rollout/review/physical testing; schema redesign prohibited near event; T-14 no broad migrations, T-7 and tournament only proven P0 migrations. Compatible operational capacity changes still require recorded before/after, recovery verification and rollback/downscale plan. All operational health flags carry TTL/reason/operator; optional feature disable cannot hide untested scoring.

Monthly reliability review, then T-90/60/30/14/7/3/1 gates and post-event review. Every gate records evidence, accepted gaps, responsible owner and decision. Archive incident/release evidence durably; no secrets in repo. See evidence blueprint for retention and privacy.
