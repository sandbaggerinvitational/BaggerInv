# Native Scoring Reliability Design

**Status:** PROPOSED Build 11 design. Nothing here is approved, implemented, tested, or certified.

**Baseline:** Build 10 `e7652b9b65595861f4f7cdf0b8326491581a27b8`.

## Proven Build 10 failure

`SQLiteScoringQueueRepository` encodes and decodes `Date` as seconds since 1970, returns the original in-memory record after transitions, and later requires exact whole-record equality against the decoded SQLite row. A fractional `Date` can change by one binary tick during that conversion. The following compare-and-swap then throws `concurrentModification` without a second writer.

The full exact-code reproduction reached the failure through real queue transitions:

1. Hole 1 was initially unscored.
2. Save created a durable intent and stable mutation ID.
3. The server accepted the gross values once and returned a compatible acknowledgement.
4. Local acknowledgement persistence failed exact-record comparison.
5. The durable row remained `syncing` with unknown local outcome.
6. The coordinator set `lastPersistenceFailure` and a sticky same-identity latch and stopped workers.
7. UI showed Needs Review and refused Hole 2 local Save although server authority remained valid.

A second deterministic clock position produced an `acknowledged` row with canonical refresh pending, followed by the same sticky block. This is a local representation/comparison defect. Evidence does not support a server timestamp, mutation ID, gross score, permission, activation, or acknowledgement-envelope mismatch as the cause.

## Exact Build 10 score-state conditions

The durable queue states are `queued`, `syncing`, `retryable`, `acknowledged`, `conflict`, `actionRequired`, `quarantined`, and `resolved` (`ScoringQueueModels.swift:95-104`). Their visible and admission behavior is not one-to-one:

| Condition | Build 10 visible reliability | Save/replay behavior | Safe interpretation |
|---|---|---|---|
| No record; fresh canonical writable | Official | New local Save permitted if all admission guards pass | No unresolved local intent |
| `queued` | Saved on iPhone; Offline if offline | Ordinary queue may replay | Durable intent; no transport certainty yet |
| `syncing` | Syncing | Worker owns/inherited lease; relaunch converts interrupted lease for same-ID replay | Outcome may be unknown; do not mint new ID |
| `retryable` | Waiting to sync; Offline if offline | Manual retry only when admission is open, replay is authorized, and two-second guard passes | Reuse original ID |
| `acknowledged` + `refreshPending=true` | Syncing | Refresh only; never rePOST | Server acceptance known; canonical readback incomplete |
| `acknowledged` + refresh confirmed | Official | Eligible for receipt retention/compaction | Acceptance and canonical state confirmed |
| `conflict` | Needs Review | `Keep Official` only after fresh canonical proof; other reviewed policy as allowed | Canonical gross differs from local intent |
| `actionRequired` | Needs Review, except a resolved read-only case | Explicit state-specific review | Automatic action is unsafe or disallowed |
| `quarantined` or hidden quarantine | Needs Review | No automatic replay | Evidence retained; support/review needed |
| `resolved` as official-equivalent + canonical confirmed | Official | No replay | Local intent reconciled to Official |
| `lastPersistenceFailure=true` | Needs Review regardless of record label | New local intent blocked and workers stopped | Authoritative local transition failed; visible actions may be absent |
| Authentication required | Sign in again | No replay until identity re-established | Identity/credential condition, not generic feature failure |
| Canonical match Final | Match Final | No Save/finalize request | Server lifecycle authority |
| Canonical read-only | Read-only | No mutation | Server authority, separate from queue transport |

Build 10 permits a new local intent only when the coordinator is not suspended, has no persistence failure, has no hidden quarantine, and no unresolved blocking record exists for that match (`ScoringQueueCoordinator.swift:45-59`). Additional local Save gates include sign-out, finalization, finalization recovery, capability scope, and active application state (`ScoringQueueCoordinator.swift:117-135`). Transport has stricter environment/revalidation authorization. This distinction allows ordinary offline durable Save but must not permit writes during identity, finalization, or capability uncertainty.

Finalization requires no in-flight Save, no existing finalization gate, no sign-out or foreground revalidation, valid mutation transport, an unsuspended coordinator, no persistence failure or hidden quarantine, and matching zero visible/durable unresolved counts (`ScoringQueueCoordinator.swift:400-440`).

## Recovery: what is and is not proven

Build 10 force-close/relaunch is a bounded exact-code recovery path:

- A stranded `syncing` row becomes retryable on startup, refreshes context, replays the same mutation ID, and confirms against canonical state.
- A stored `acknowledged` row performs canonical reads only and does not rePOST.
- Separate simulator processes recovered one durable store, preserved one canonical Hole 1 commit, restored admission, and then committed synthetic Hole 2.
- The actual HTTP-contract fixture preserved Production's `progress.currentHole = 1`, which means last played hole. Recovery does not prove automatic Hole 2 selection.

It is not guaranteed recovery. In the 50-position deterministic relaunch matrix, 47 syncing cases recovered and three hit the same timestamp fault during recovery. All 25 acknowledged cases recovered. These are injected positions, not physical-phone probabilities. No physical-native recovery was claimed.

Ordinary refresh, pull-to-refresh, tab return, background/foreground, network restoration, canonical readback alone, same-identity sign-out/in, manual retry, queue maintenance, and Keep Official do not clear the stranded persistence latch. A successful relaunch supports safe remediation for one exact state; it does not certify continued native scoring.

## Proposed Build 11 scoring requirements

### B11-SCORE-001 — canonical durable comparison (P0)

Acceptance: fractional dates across every record transition and mutable `Date` field survive persist/reload and CAS. Real concurrent writers still conflict. Every supported Build 10 row migrates without loss or resubmission. Physical verification uses real app-container SQLite and device clock with kills at transition boundaries.

Dependency: local schema/migration policy only; this work is explicitly independent of broad backend redesign. Confidence: PROVEN. Risks: unresolved Build 10 row migration and hiding real concurrency if equality is weakened too broadly.

### B11-SCORE-002 — exact Official reconciliation (P0)

Acceptance: after fresh proof of the same identity, match, hole, immutable snapshot, nonregressed revisions, and exact gross arrays, a matching Official intent becomes resolved/receipt-backed and next-entry admission returns. A stored acknowledgement uses reads only; an unknown outcome reuses the original mutation ID. Differing Official values never auto-resolve. Physical verification kills after server commit/before ACK and after ACK/before readback.

Dependencies: `B11-SCORE-001` and existing idempotent mutation behavior. Confidence: need PROVEN. Risks: gross equality without full context is insufficient; replay must retain identity.

### B11-SCORE-003 — truthful recovery UI (P0)

Acceptance: each state presents a distinct title, body, actions, enabled controls, mutation count, and canonical consequence. Matching Official never offers Reapply; differing Official never clears silently; persistence failure offers bounded reconciliation or safe fallback guidance. Physical review includes VoiceOver and accessibility sizes.

Dependency: `B11-SCORE-002` and stable diagnostic reason codes. Confidence: UX/state gap PROVEN. Risk: ambiguous copy can cause duplicate attempts or evidence loss.

### B11-SCORE-004 — deterministic process death (P0)

Acceptance: terminate before durable intent, after intent, after lease, during POST, after commit, before/after acknowledgement persistence, before/after readback, and before compaction. Relaunch converges to one commit or a specific unresolved state and never loses evidence. A physical automation matrix must control network hold/drop and verify receipts.

Dependencies: `B11-SCORE-001` and `002`. Confidence: gap PROVEN. Risks: OS timing requires release-excluded test hooks; testing must remain isolated from Production.

### B11-SCORE-005 — restore admission and guide the next hole (P0)

Acceptance: recover with zero, one, and multiple later holes already Official from another device. The app identifies the first canonical unscored hole, leaves Official inputs read-only, and blocks when match/round authority changed. Product must choose and test either explicit auto-selection or a guided selector; `progress.currentHole` must not be treated as “next hole.”

Dependencies: `B11-SCORE-002` and fresh canonical scorecard. Confidence: STRONGLY SUPPORTED. Risk: auto-advance can surprise a scorer when another device progressed.

### B11-SCORE-006 — multi-device lifecycle certification (P1)

Acceptance: Best Ball, Scramble, and Singles complete 18 holes using two devices through response loss, timeout, 503, airplane mode, background, termination, and newer canonical revisions. Assert one canonical score per hole, no hidden residue, clear same-hole conflict, safe adjacent-hole progress, and correct finalization. Requires Wi-Fi and cellular physical devices in isolated production-shaped data.

Confidence: coverage gap PROVEN. Risk: a broad matrix still misleads if it skips real SQLite, process death, or canonical readback.

### B11-SCORE-007 — pre-entry strokes (P1)

Acceptance: before entry, every player row shows server-owned hole-specific received/given strokes for all 18 holes and all three formats. Pre-entry badges match post-save applied strokes. Positive, zero, multiple, and negative/given policy cases use approved copy and accessibility semantics. Gross mutation payloads do not change.

This is an operational-awareness and presentation priority. The evidence proves that Build 10 omits the indicator before first Save. It does not show incorrect canonical scoring or competitive result corruption. The requirement must not turn displayed handicap into client-side authoritative allocation.

Dependency: existing complete allocation projection or a bounded contract addition. Confidence: presentation gap PROVEN. Risks: users may subtract a displayed stroke; new fields must remain privacy-bounded.

### B11-SCORE-008 — lifecycle versus progress copy (P1)

Acceptance: Upcoming, Live with zero holes, Live partial, locked, Final, and reopened fixtures use separate lifecycle, progress, and local-save labels. A Live match never reads “Scheduled” merely because no score is Official. VoiceOver announces lifecycle and reliability independently.

Dependency: existing canonical status and progress fields. Confidence: copy issue PROVEN; no competitive effect. Risk: unmodeled combinations create new ambiguity.

## Required validation

`NA-2026-006` owns the timestamp, state, recovery, process-death, same-ID, next-hole, multi-device, and finalization matrix. `NA-2026-005` owns pre-entry stroke and lifecycle/progress presentation. Source and deterministic exact-code tests can prove mechanisms. Physical devices and an isolated full lifecycle are required for any holistic scoring PASS.

