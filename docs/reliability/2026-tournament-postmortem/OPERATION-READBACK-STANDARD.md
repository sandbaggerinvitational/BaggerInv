# Operation readback standard

## Purpose

Every tournament mutation must answer five questions without a whole-database scan:

1. What exact state authorized the operation?
2. What exact scope could the operation mutate synchronously?
3. What committed outcome and immutable receipt exist?
4. What bounded canonical state proves the outcome?
5. Is retry safe, stale, already committed, or still unknown?

This standard records current Release 139 behavior where supported and identifies proposed 2027 contracts explicitly.

## Outcome model

Every client and operator surface uses these outcome classes:

| Outcome | Meaning | Allowed next action |
|---|---|---|
| `COMMITTED_VERIFIED` | Receipt and bounded canonical readback agree. | Render the committed result; no retry. |
| `NOT_COMMITTED_VERIFIED` | Receipt is absent under a defined receipt contract and the target predecessor is unchanged. | Replay the same operation ID and same payload, if the domain permits. |
| `STALE` | No usable commit exists and the target predecessor or semantic fingerprint advanced. | Refresh and create a newly reviewed operation; never replay old intent. |
| `DENIED` | Server returned a committed denial/no-write result with exact blocker. | Perform the supported blocker action or stop. |
| `OUTCOME_UNKNOWN` | Receipt/readback is unavailable or contradictory. | Hold the scope; do not mint a replacement ID or issue a blind retry. |

HTTP status alone never determines outcome.

## Required receipt/readback envelope

```json
{
  "operationId": "uuid",
  "operationType": "OPEN",
  "scope": { "tournamentId": "2026", "round": 3 },
  "actor": { "playerId": "...", "role": "DIRECTOR" },
  "contractVersion": "...",
  "requestHash": "sha256",
  "before": {
    "pointerRevisions": {},
    "semanticComponents": {},
    "fingerprint": "sha256"
  },
  "mutation": {
    "status": "COMMITTED",
    "changedIds": [],
    "createdRevisionIds": [],
    "eventIds": []
  },
  "after": {
    "pointerRevisions": {},
    "semanticComponents": {},
    "fingerprint": "sha256"
  },
  "readback": {
    "verifiedAt": "timestamp",
    "checks": [],
    "outcome": "COMMITTED_VERIFIED"
  },
  "retry": {
    "safe": false,
    "sameOperationIdRequired": true,
    "reason": "ALREADY_COMMITTED"
  }
}
```

The payload contains IDs, revisions, component digests and safe errors. It does not copy credentials, full financial payloads, or unrestricted history.

## Bounded diff rules

1. Scope every read by tournament plus round, match, job, publication, result or operation ID.
2. Compare current pointers and the immutable rows they reference. Do not aggregate every historical revision to establish currentness.
3. For a round operation, compare the expected match ID set and per-match semantic projections. Do not hash all score history, mutation history and finalized history into the live retry fingerprint.
4. For a score, compare one match, one hole, the mutation receipt and the resulting match revision.
5. For a side game, compare its configuration/publication/current-result pointers, the exact selected job and versioned semantic components. Retained old jobs/results remain queryable outside the critical decision.
6. Return changed component names and before/after digests. Never require the operator to infer meaning from one opaque whole-domain hash.
7. Historical reconstruction runs off the tournament critical path with its own budget and cancellation policy.

The current atomic round reader includes per-match score history, mutations and finalized snapshots in its fingerprint (`supabase/production_migrations/202609220108_atomic_round_scoring_v1.sql:59-66`). That supports exact 2026 incident forensics, but the 2027 live operation fingerprint should use bounded semantic components instead.

## Synchronous dependency boundary

### Exact pinned-candidate reachability

The Release 139 candidate synchronously reaches more state than the target standard:

- **Pairing and Prepare:** ordinary setup holds setup/match authority and calls the side-game dependency-code function. The late-R3 compatibility wrapper additionally takes `NOWAIT` exclusive locks across target golf/setup tables and Calcutta, Net Skins and Odds current/history/job tables; it computes Calcutta source, financial and consumed fingerprints before the mutation and rechecks them afterward (`supabase/production_migrations/202609090097_production_late_r3_initialization_v1.sql:254-431`). This was a bounded 2026 compatibility mechanism, not the desired steady-state dependency model.
- **Open, Lock and Resume:** the round fingerprint synchronously loads round/setup/handicap/roster/course authority plus each target match's permissions, leases, details, snapshot, participants, hole definitions, scores, score history, mutation history and finalized snapshots (`supabase/production_migrations/202609220108_atomic_round_scoring_v1.sql:28-94`). The mutation then calls match control once or twice per target in one transaction.
- **Score:** the core RPC locks one match and reads one hole/snapshot/participant scope, then writes canonical score/match, mutation/history/audit and Google outbox (`supabase/production_migrations/202608240021_production_scoring_operations.sql:968-1144`). The resulting hole/match updates synchronously fire Net Skins and Calcutta change triggers (`supabase/production_migrations/202608290055_production_net_skins_v1.sql:1138-1213`; `supabase/production_migrations/202608290056_production_calcutta_v1.sql:1529-1615`). Incident 019 proves the Calcutta reachability included an expensive historical compatibility path.
- **Finalize:** the match transaction validates all eighteen holes/progress and unresolved state, writes Final/locked/access revocation, captures the finalized snapshot, and writes mutation/history/audit/Google outbox. Its match update also reaches the same side-game trigger class.
- **Net Skins and Calcutta:** each worker synchronously validates runtime activation, exact configuration/source identity, claim lease/token and current-result authority inside its job transition. Calculation runs outside the score transaction, but enqueue invalidation is presently trigger-coupled to score/match writes.
- **Odds:** calculation claim/complete/supersede and publication/withdrawal are separate guarded operations. Setup guards synchronously inspect the relevant publication and retained calculation lifecycle, which is why the current publication and an old READY job could block independently.
- **Close:** no supported current tournament-close mutation was established in the pinned candidate. The Close contract below is proposed.

The standard keeps the correctness facts that must be locked together and removes historical payload construction from live scoring, retry and ordinary readback decisions.

| Operation | Dependencies that must be synchronous | Work that must not be synchronous |
|---|---|---|
| Pairing | Runtime/actor, setup revision, approved handicap pointer, active roster/team membership, exact round match set/formats, match mutability, targeted side-game semantic blockers, operation receipt. | Recalculate/publish side games, scan retained job/result history, external mirrors. |
| Prepare | Target match/round, pairings, 18-hole course/tee, approved handicap coverage, current snapshot/detail revision, exact semantic blockers. | Side-game calculation/publication, unrelated rounds, broad historical compatibility. |
| Open | Exact round match set, every target `READY`, Upcoming/unlocked, no active access or ingress lease, current revisions/permissions, operation receipt. | Side-game calculation, external writes, archive work. |
| Lock | Exact Live target set, current match/permission revisions and access state. | Optional-feature health, side-game work, historical diagnostics. |
| Resume | Exact Live/locked target set, resume readiness, current match/permission revisions and safe access transition. | Side-game work and unrelated match health. |
| Score | Admission/actor, match+hole revisions, permission, gross validation, canonical snapshot/strokes/net/winner, canonical writes, mutation/history/audit and minimal transactional event. | Calcutta/Net Skins/Odds snapshot construction, whole-history fingerprints, external mirror delivery. |
| Finalize | One match, 18 canonical holes, complete progress/result, zero unresolved mutations, current permission, final snapshot, receipt/audit and minimal event. | Derived side-game calculation/publication and external delivery. |
| Net Skins | For a domain mutation: exact round configuration/current result/job authority, source manifest and claim token. | Other rounds and unrelated Calcutta/Odds histories. |
| Calcutta | Exact configuration, auction, publication, selected job/current result, financial/source components and activation authority. | Unrelated Net Skins history/control metadata and live score-path execution. |
| Odds | Exact milestone input bundle, selected job, current publication pointer, review state and claim/receipt authority. | Unrelated old calculations, full golf history scans after a bounded source manifest exists. |
| Close | Proposed: all round closeouts, zero active scoring access/leases, explicit side-game completion/waiver decisions, champion source, archive manifest and owner confirmation. | New calculations, silent corrections, history deletion, external archival before manifest commit. |

The pinned score/match tables currently fire synchronous Calcutta and Net Skins enqueue triggers. Incident 019 proves that the reachable Calcutta path could execute expensive historical fingerprints and roll back scoring. The minimal side-game event seam is proposed; only the existing Google outbox is already implemented.

## Operation scopes

### Pairing — supported whole-round mutation

- **Before:** one tournament/round, setup revision, approved handicap revision, active roster count/IDs, expected match IDs/formats/details, current participant assignments, and named dependency blockers. The 2026 R3 contract expects twelve matches and 24 unique active players; R1/R2 expect six matches, but future standards derive counts from tournament configuration.
- **Mutation:** lock setup authority and affected match rows; replace participants only for changed matches; advance setup revision; write audit and operation receipt. Current response explicitly returns `snapshotPrepared:false` (`202609090095_production_round_pairings_v1.sql:169-185`).
- **After/readback:** same target round only; exact participant coverage, changed match IDs, setup revision, unchanged non-target matches, and explicit `PAIRED_UNPREPARED` state.
- **Retry:** query the pairing receipt by the same operation request ID. Same hash returns the original response. Different hash conflicts. A stale setup/handicap revision requires refresh and new owner review.

### Prepare — per-match supported; whole-round self-certification proposed

- **Before:** target match, pairings, round format/allowance, match details, course/tee and exactly 18 holes, current approved handicap revision/entries, current scoring snapshot and side-game dependency codes.
- **Mutation:** create the next immutable scoring snapshot, advance match revision/pointer, inject participant handicap/strokes, replace that match's 18 canonical hole definitions, and mark the prepared setup fingerprint. No scoring permission or score mutation is created (`202609040084_production_starting_hole_retirement_v1.sql:411-539`).
- **After/readback:** target match snapshot pointer/hash/revision, all participant handicap revision IDs, 18 hole definitions, prepared setup revision/fingerprint, `READY` assertion. Whole-round UI must count the configured target set and name every non-ready match.
- **Retry:** same operation ID/payload may return no-change. If setup, pairing, course or handicap advanced, mark old intent stale. Release 138's atomic twelve-context repair was an incident-specific recovery, not proof of a general whole-round Prepare operation.

### Open — supported atomic round operation

- **Before:** bounded round state, expected match set, all targets Upcoming, prepared/ready and unlocked, no active access or leases, complete round coverage, expected fingerprint and immutable operation ID.
- **Mutation:** lock governance/setup, lease admission and all target matches; execute `MARK_LIVE` then `ACCESS_ACTIVATE` per target in one subtransaction; write one round receipt. Any target denial rolls back all child histories/outbox writes (`202609220108_atomic_round_scoring_v1.sql:107-158`).
- **After/readback:** round receipt, exact affected matches, each Live/unlocked with active permissions, before/after match and permission revisions, no unexpected match changed.
- **Retry:** look up the same round receipt and child mutation keys. If receipt after-fingerprint equals current state, return original success. If absent and predecessor unchanged, same-ID replay is allowed. If other operations changed the round, return `STALE`; do not create a replacement Open blindly.

### Lock — supported atomic round operation

- **Before:** exact Live target set, current match/permission revisions, lock/access state and active ingress leases. A safety decision may consider leases, but Lock must not wait on side games or optional-feature health.
- **Mutation:** `SCORING_LOCK` each target atomically; set locked, revoke scoring permissions and advance match/permission revisions; write child mutations/history/audit/outbox and the round receipt.
- **After/readback:** target matches remain Live, all are locked, access is inactive, current permission revisions agree, and the receipt lists exact targets.
- **Retry:** same round operation ID. If already committed and state matches, return the receipt. If another action advanced state, require a new plan. Never Lock merely to repair one optional feature.

### Resume — supported atomic round operation

- **Before:** exact Live+locked targets, resume-readiness reasons, current match/permission revisions, prepared authority and ingress state.
- **Mutation:** `SCORING_UNLOCK` each target atomically; clear lock, activate permissions and advance revisions; write receipt/history/audit/outbox.
- **After/readback:** targets Live/unlocked, access active only for expected participants, revisions coherent, no non-target changed.
- **Retry:** same-ID receipt reconciliation. A new score, permission change, Finalize or setup change makes the old request stale.

### Score — supported; synchronous side-game reachability must be removed

- **Before:** one match, one hole, one mutation ID, match+hole+permission revisions, canonical prepared snapshot and gross arrays only.
- **Mutation:** lock match; resolve idempotency; authorize; validate gross/cardinality; derive server strokes/net/winner; write hole/match, mutation, revision history, audit and existing Google outbox. Calcutta/Net Skins triggers are currently synchronous and are the redesign target.
- **After/readback:** exact mutation row, target hole gross/strokes/net/winner/revision, target match progress/revision, and minimal event identity. Do not diff another hole, round, side game or historical result.
- **Retry:** after timeout, query mutation ID and canonical hole. Matching receipt/result means committed. Absent receipt plus unchanged revisions permits same-ID replay. Different payload conflicts. Advanced hole/match requires user-visible reconciliation.

### Finalize — supported match operation

- **Before:** one match, expected match/permission revisions, 18 scored holes, complete canonical progress/result, zero unresolved mutations, unlocked state and authorized actor.
- **Mutation:** set Final+locked, advance match/permission revisions, revoke access, capture immutable finalized snapshot, and write mutation/history/audit/outbox (`202608240021_production_scoring_operations.sql:549-679`).
- **After/readback:** target match Final/locked, 18 Official holes, current finalized snapshot matching match/snapshot revisions, no active permission, canonical points/result and receipt.
- **Retry:** if acknowledgement is lost, refresh the match. Final plus matching receipt/readback is success; `MATCH_FINAL`/already-finalized after the original commit is reconciled as success only when canonical result matches. Never finalize while queued/unresolved local intents remain.

### Net Skins — supported domain lifecycle

- **Before:** one tournament+round, configuration revision/membership, current result pointer, exact jobs for that round, canonical round source components and activation/contract version.
- **Mutation:** configuration changes, enqueue, claim/lease, calculate and guarded complete/fail each have their own receipt/authority. OFFICIAL completion publishes under the 2026 domain policy; PROVISIONAL work remains private.
- **After/readback:** same round only: configuration pointer/membership digest, selected job status/attempt/lease, result revision/state/currentness, published flag and participant presentation availability.
- **Retry:** configuration by operation receipt; worker by same job/claim token and completion idempotency. Do not fabricate an empty published result to satisfy a client. Do not scan or mutate other rounds.

### Calcutta — supported domain lifecycle; routine correction certification proposed

- **Before:** one tournament, configuration/auction/publication/current-result pointers, exact immutable rows they reference, purchase/ownership manifest totals and rows, selected active jobs, activation/contract version and scoped golf-source components.
- **Mutation:** configuration, auction replacement, publish/unpublish, enqueue, claim, complete/fail and exact correction steps remain separate guarded operations. Golf is read-only input.
- **After/readback:** pointers plus their referenced revisions, exact purchase/ownership comparison, active job/result lifecycle, participant visibility and payout projection. The September 27 result 424 record is a historical `2026-09-27T12:26:41.188212Z` snapshot, not later live state.
- **Retry:** reconcile each operation receipt. Worker retry requires same job/token/source. Financial correction requires unpublish → immutable full auction replacement → supersede/reset → republish → new calculation; never edit history or use a total-only comparison.

### Odds — supported calculation/publication lifecycle

- **Before:** one tournament+milestone, configuration/source/settings/effective/bundle/ratings/pairing component digests, exact selected calculation job, current publication/public pointer and review state.
- **Mutation:** enqueue/claim/complete, review, publish, withdraw and supersede are distinct operations. A retained READY calculation and a current publication are separate blockers.
- **After/readback:** selected job execution/freshness/review status, exact current publication/pointer, changed component names and participant projection usability. Do not infer semantic usability from transport 200.
- **Retry:** claim/complete by job token and source; publish/withdraw/supersede by immutable operation receipt. Unknown outcome holds the scope. Published/referenced work is never automatically superseded.

### Close — proposed tournament operation

- **Before:** every expected match Final with complete Official scorecard; zero unresolved score intents, active permissions and leases; round closeouts; explicit Net Skins/Calcutta/Odds completion or owner waiver; champion derivation source; release and operation receipt inventory.
- **Mutation:** one owner-confirmed close receipt and immutable archive manifest referencing setup, handicap, pairings, scorecards, results, leaderboards, side games, releases and operation receipts. No source row is rewritten.
- **After/readback:** closed pointer/receipt, archive manifest hash and referenced IDs, zero writable tournament admission, explicit unresolved/waived items and participant archive availability.
- **Retry:** same close operation ID only. If any referenced pointer changed, the close request is stale and needs renewed review. Post-close correction creates new audited revisions and a new manifest; it never overwrites the closed archive.

## Readback timing and failure policy

- Immediate readback is part of the operation response transaction where practical; otherwise the response carries the receipt ID needed for a bounded follow-up.
- A worker result is verified only after compare-and-swap completion and current-pointer readback.
- External mirror success requires external readback before its delivery checkpoint, independently from canonical success.
- Readback unavailable means `OUTCOME_UNKNOWN`, not failure and not permission to retry.
- Retain safe errors and component names. Keep secrets, tokens and unrestricted payloads out of receipts.

## Certification

For every operation, exercise committed response, lost response, same-ID replay, changed-payload conflict, predecessor advance, denial before write, failure after the first internal step, two-actor race and bounded readback outage. Database tests must prove rollback or a coherent complete state. Physical tests cover the participant operations; Director-only operations require an operator dress rehearsal with exact receipt lookup.
