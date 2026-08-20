# Native Offline Scoring Reliability Specification

- Status: Step 1D implementation specification
- API contract: Bagger Mobile API `v1`
- Scope: future native iPhone scoring queue; platform-independent behavior only

## 1. Purpose and scope

This document defines the reliability behavior that a future native Bagger Invitational scoring client must implement. It translates the proven browser queue semantics and the Step 1C mobile scoring contracts into one deterministic native queue model.

This is not an alternate scoring authority. Local storage preserves a golfer's gross-score intent until the existing server authority accepts or otherwise resolves it. Supabase Bearer authentication, canonical Player resolution, Match authorization, handicap and stroke allocation, net score, hole result, Match result, revisions, lifecycle, idempotency, finalization, audit, and publication remain server-authoritative.

The words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative. “Automatic submission” means an HTTP score mutation initiated without a new golfer reconciliation decision. “Authoritative refresh” means an uncached `GET /api/mobile/v1/scoring/current?matchId=<id>`.

This specification covers hole mutations only unless a section explicitly discusses finalization. Finalization is online-only and is never an ordinary offline queue entry.

## 2. Non-negotiable invariants

1. **No false official success.** The app MUST NOT represent an unacknowledged local mutation as an official tournament score. It MAY optimistically show the entered gross score only with a persistent local/pending state.
2. **No silent scoring-intent loss.** An unresolved mutation may end only through canonical acknowledgement, deterministic reconciliation, explicit user-confirmed abandonment, or retained quarantine. Termination, sign-out, account switching, tournament switching, app update, and network failure MUST NOT silently erase it.
3. **No silent stale overwrite.** A stale local intent MUST NOT overwrite official state. A differing `REVISION_CONFLICT` requires reconciliation. Reapplication creates a new mutation ID against current canonical revisions.
4. **No cross-identity replay.** A mutation may submit only when the current verified Auth UUID and canonical Player ID exactly match the partition that created it. Equivalent Match access held by another account does not permit replay.
5. **The server remains authoritative.** The queue stores gross-score intent and concurrency preconditions. It never supplies or treats local handicap, strokes, net score, winner, Match result, points, lifecycle, or revisions as official.
6. **Save first, send second.** The queue record MUST commit durably before any submission begins or the app says “saved on this iPhone.”
7. **Same intent, same mutation ID.** Every retry of the same unresolved intent MUST use its original mutation ID. A replacement ID MUST NOT be generated merely because a request timed out or its response was lost.
8. **Official state is refreshed.** Canonical acknowledgement or reconciliation is followed by authoritative refresh. Queue state alone never becomes tournament truth.

## 3. Existing canonical server contracts

### 3.1 Authentication and environment

Every scoring route requires a Supabase access token in `Authorization: Bearer <token>`. Step 1A validates the token and resolves the Auth UUID to the canonical Player ID. The queue MUST use the auth/session layer for tokens; tokens MUST NOT be stored in queue records.

Mobile scoring is intentionally Preview-only. `MOBILE_API_UNAVAILABLE` and `SCORING_UNAVAILABLE` fail closed. The queue MUST NOT fall back to Google, Player Passport, a browser scoring cookie, or a different identity authority.

### 3.2 Current scoring state

`GET /api/mobile/v1/scoring/current?matchId=<matchId>` returns the canonical participant-safe Match snapshot, including:

- Match, hole, snapshot, and permission revisions;
- immutable Player slot order and scoring format;
- canonical handicap/stroke context;
- current gross, strokes, net, and hole winner;
- progress and lifecycle;
- `canScore`, `readOnly`, `canFinalize`, and a bounded denial reason.

No-Match state is `data.scoring: null`. Responses are private/no-store and have no ETag.

### 3.3 Hole request

`POST /api/mobile/v1/scoring/hole` accepts one hole intent. The queue projects a record into exactly this request:

```json
{
  "matchId": "2026-R2-1",
  "holeNumber": 7,
  "teamOneGrossScores": [4, 5],
  "teamTwoGrossScores": [5, 6],
  "mutationId": "11111111-1111-4111-8111-111111111111",
  "expectedMatchRevision": 12,
  "expectedHoleRevision": 3
}
```

The mutation ID is 1–128 characters matching `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`; a lowercase UUID is recommended. Canonical uniqueness is `(matchId, mutationId)`. Scores are integer gross intent. Best Ball requires two values per side; Scramble and Singles require one per side. Unknown fields and client-computed authority fields are rejected. The decoded body limit is 16 KiB.

### 3.4 Acknowledgement

`data.accepted: true` is canonical acceptance. Both `idempotent: false` and `idempotent: true` are successful acknowledgements. The response includes the canonical hole, new hole revision, new Match revision, progress, and Match state.

A same-ID/same-intent retry returns the stored acknowledgement and creates no second score, revision, audit event, or outbox event. Same-ID/incompatible-intent returns `IDEMPOTENCY_CONFLICT`.

### 3.5 Conflict

`REVISION_CONFLICT` is HTTP 409 and may include canonical current Match, hole, or permission revisions plus `refreshRequired: true`. Only revisions actually supplied by the server may be used. A conflict never grants permission to rewrite intent or advance a revision locally without reconciliation.

### 3.6 Finalization

`POST /api/mobile/v1/scoring/finalize` is explicit participant finalization. It requires Match ID, mutation ID, and expected Match revision. The canonical transaction alone decides readiness and final result. A post-commit response loss is reconciled by refreshing the Match; a later request may return `MATCH_ALREADY_FINALIZED` rather than replaying the original accepted response.

## 4. Existing browser queue audit

The reference browser implementation is `lib/scoring-sync-queue.js`, consumed by `app/score/ScoreEntry.js` and covered by `test/scoring-sync-queue.test.mjs` and `test/scoring-revision-handoff.test.mjs`.

### 4.1 Semantics to preserve

- Persist score intent before asynchronous submission.
- Assign one durable mutation identity and reuse it on retry.
- Serialize queued work and preserve creation order.
- Carry authoritative Match revisions from an accepted mutation to later queued mutations.
- Carry the accepted hole revision to a later correction for that same hole.
- Recover an interrupted `syncing` record after restart.
- Treat network/server availability failures as retryable and permission/lifecycle failures as blocking.
- Re-read official state after conflicts.
- Automatically resolve when refreshed official gross scores exactly equal local intent.
- Permit a bounded safe revision rebase only when the target hole has not changed and the Match remains verified and writable.
- Never auto-rebase a real same-hole value mismatch.
- Present local and official values for manual conflict review.
- Review actionable records oldest-first.
- Block finalization while any unresolved queue record exists.
- Prevent an unchanged double action from creating a second logical mutation.
- Preserve a correction created while an earlier version is in flight and submit it only after the earlier version resolves.

### 4.2 Browser mechanics to replace

The native design MUST NOT treat the following as architectural requirements:

- IndexedDB database names, object stores, or key formats;
- `navigator.locks` and browser-global locking;
- `navigator.onLine`, DOM `online`/`offline` events, or document visibility;
- service workers or browser background lifecycle;
- React refs, effects, component hydration, or optimistic component state;
- browser Passport/scoring cookies;
- browser dialogs, vibration calls, or DOM event handling;
- browser diagnostic timing stores.

Native storage, process coordination, auth refresh, reachability, lifecycle, and accessibility mechanisms replace those details while preserving the semantics above.

## 5. Native durable mutation model

### 5.1 Durable envelope

The future store MUST persist the following logical record atomically. Names below are normative domain names; a storage implementation may map them to normalized columns.

```json
{
  "queueSchemaVersion": 1,
  "apiContractVersion": "v1",
  "localQueueRecordId": "9ae8de6a-8d8e-4b89-8c25-5ec47fd05c0a",
  "mutationId": "11111111-1111-4111-8111-111111111111",
  "partition": {
    "authUserId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "playerId": "P1",
    "tournamentId": "2026",
    "matchId": "2026-R2-1"
  },
  "intent": {
    "holeNumber": 7,
    "teamOneGrossScores": [4, 5],
    "teamTwoGrossScores": [5, 6]
  },
  "base": {
    "expectedMatchRevision": 12,
    "expectedHoleRevision": 3,
    "snapshotId": "2026-R2-1:S1",
    "snapshotRevision": 1,
    "scoringFormat": "BB",
    "sideSlotCount": 2
  },
  "sequence": 42,
  "state": "queued",
  "stateReasonCode": null,
  "attempt": {
    "count": 0,
    "lastAttemptAt": null,
    "nextRetryAt": null,
    "everSubmitted": false,
    "outcomeCertainty": "notSent",
    "syncLeaseId": null,
    "syncLeaseStartedAt": null,
    "lastHttpStatus": null,
    "lastErrorCode": null
  },
  "lastKnownServer": {
    "matchRevision": 12,
    "holeRevision": 3,
    "permissionRevision": 4,
    "refreshedAt": "2026-09-25T14:25:00.000Z"
  },
  "conflict": null,
  "acknowledgement": null,
  "resolution": null,
  "quarantineReason": null,
  "originatingAppBuild": "1.0.0-100",
  "createdAt": "2026-09-25T14:30:00.000Z",
  "updatedAt": "2026-09-25T14:30:00.000Z"
}
```

Required rules:

- `localQueueRecordId` is a local immutable identifier, distinct from `mutationId`.
- `mutationId` is generated once before the first durable commit and never changed for that intent.
- `sequence` is a monotonically increasing value within the Match partition.
- Timestamps are ISO-8601 UTC. Retry calculation may use a monotonic clock while the process lives, but persisted scheduling uses UTC with clock-skew clamping.
- `snapshotId`, snapshot revision, format, and slot count are context guards; they are not submitted as authority.
- `conflict` may contain the latest bounded official gross scores and revisions needed for comparison. It MUST NOT contain a full Player profile or raw server response.
- `acknowledgement` stores only `accepted`, `idempotent`, `semanticNoop`, canonical Match/hole revisions, response timestamp, and refresh-pending status. A full response is unnecessary.
- `resolution` stores a fixed reason such as `keptOfficial`, `reappliedAsNewMutation`, `supersededBeforeTransmission`, `officialEquivalent`, or `userAbandoned`, plus time and related local record ID when applicable.
- Fixed reason codes are stored instead of raw exception text wherever possible.
- The queue record MUST NOT contain Bearer or refresh tokens, OTPs, scoring cookies, service-role credentials, email, phone, display name, team name, client-computed net result, or client-computed winner.

### 5.2 Partition keys

The logical identity partition is:

`authUserId → playerId → tournamentId → matchId`

Recommended keys:

- identity partition: `(authUserId, playerId, tournamentId)`
- Match queue: `(authUserId, playerId, tournamentId, matchId)`
- server idempotency uniqueness guard: `(matchId, mutationId)`
- local uniqueness guard: `(authUserId, playerId, tournamentId, matchId, mutationId)`
- ordering index: partition plus `sequence`

Before every submission, the app MUST compare the active verified Auth UUID and Step 1A canonical Player ID with the stored partition. A mismatch stops submission before HTTP.

### 5.3 Identity behavior

- Same Auth UUID and same canonical Player signing in again: restore the partition, refresh canonical state, then resume eligible work.
- Same Player ID under a different Auth UUID: do not replay the old record. Mark it `actionRequired` with `identityChanged`; an explicit future account-migration/reconciliation flow may create new intent, but MUST NOT replay the old mutation under the new Auth UUID.
- Different Player signing in: hide and stop the prior partition completely.
- Player mapping or Match assignment changed: stop, refresh, and move unresolved records to `actionRequired` or `conflict` according to official state.
- Tournament changed: the old partition becomes inactive and never submits in the new tournament context.

## 6. State machine

### 6.1 Final state set

`draft` is an ephemeral editor state, not a durable queue state and not “saved.” The durable state enum is:

- `queued`
- `syncing`
- `retryable`
- `acknowledged`
- `conflict`
- `actionRequired`
- `quarantined`
- `resolved`

`acknowledged` and `resolved` are terminal for submission. An `acknowledged` record with `refreshPending:true` remains unresolved for finalization until the required refresh succeeds. Both states remain briefly persisted for refresh or diagnostic cleanup. `conflict`, `actionRequired`, and `quarantined` are unresolved terminal-for-automatic-submission states.

### 6.2 Complete transition table

| State | Entry condition | Allowed next states | Automatic action/network | User action | Persistence and cleanup |
| --- | --- | --- | --- | --- | --- |
| `draft` | Scores are being edited but durable save has not committed | `queued` or discarded draft | Validate locally; no HTTP | Edit/cancel/save | Volatile; MUST NOT be called saved |
| `queued` | Durable insert committed; never sent, or an eligible retry/reconciliation was released | `syncing`, `actionRequired`, `conflict`, `quarantined`, `resolved` | When due, authenticated, current, and oldest for Match, acquire Match lock and submit | May edit under same-hole rules or explicitly abandon | Durable; never auto-clean while unresolved |
| `syncing` | Atomic lease acquired immediately before HTTP submission | `acknowledged`, `retryable`, `conflict`, `actionRequired`, `quarantined` | One request using original mutation ID; no concurrent Match mutation | No duplicate Save/Retry; cancellation does not imply request cancellation outcome | Durable lease; launch recovery converts stale lease to `retryable`/unknown outcome |
| `retryable` | Known transient failure or unknown network outcome | `queued`, `syncing`, `acknowledged`, `conflict`, `actionRequired`, `quarantined`, `resolved` | Backoff; same-ID retry when eligible; refresh when policy requires | Manual Retry only for transient class | Durable; no automatic cleanup |
| `acknowledged` | `accepted:true`, including `idempotent:true`, is durably recorded | cleanup only | Mandatory authoritative refresh; no more submission; block finalization while refresh is pending | None normally | Retain until refresh succeeds, then replace with minimal 24-hour receipt |
| `conflict` | Official value/revision differs or safe rebase cannot be proven | `resolved`; a separate new record may enter `queued` | Refresh official state only; never auto-submit conflicting intent | Keep Official or Reapply | Preserve original intent and official comparison until explicit resolution |
| `actionRequired` | Auth, membership, permission, lifecycle, stale-age, missing Match, or final state blocks replay | `queued`, `conflict`, `resolved`, `quarantined` | Refresh/auth restoration only; no score submission | Reauthenticate, Check Again, resolve, or abandon | Preserve unresolved intent; no time-based deletion |
| `quarantined` | Corrupt/unsupported record, identity-integrity failure, unsafe migration, idempotency conflict, or extreme stale/queue-health condition | `resolved` after explicit review; support-approved deterministic migration may restore to `actionRequired` | No submission and no automatic mutation repair | Review/export diagnostics, abandon, or use explicit reconciliation | Preserve full original record securely; never auto-delete |
| `resolved` | User kept official, explicitly abandoned, a refreshed score was exactly equivalent, or an unsent intent was explicitly superseded | cleanup only | No score submission; refresh may already be satisfied | None, except viewing recent resolution receipt | Strip score payload when safe; retain bounded receipt, then clean |

Prohibited transitions:

- `conflict → queued` by merely editing revisions on the same record.
- `quarantined → syncing` without a deterministic, audited migration/review.
- `acknowledged → syncing` after the acknowledgement is durably stored.
- Any state to another identity/tournament/Match partition.
- Any transition that changes gross intent while retaining the same mutation ID.

### 6.3 Submission permissions by state

- Automatic submission: `queued`; `retryable` only after it is made due and transitioned to `queued`.
- Manual Retry: `retryable`; `actionRequired` only after the blocking condition has been successfully revalidated.
- Manual reconciliation: `conflict`, `actionRequired`, and `quarantined`.
- No submission: `acknowledged`, `conflict`, `quarantined`, and `resolved`.
- Cleanup eligible: refreshed `acknowledged` and `resolved` only.

## 7. Save-first behavior and duplicate actions

The Save transaction is:

1. Validate the editor values against the current immutable snapshot format.
2. Acquire the Match-local queue-write lock.
3. Detect a duplicate UI event or equivalent unresolved intent.
4. Generate `localQueueRecordId` and `mutationId` if a new record is required.
5. Atomically insert the complete `queued` record and advance the Match sequence.
6. Confirm the durable transaction committed.
7. Only then show the “saved locally” product state and allow navigation.
8. Signal the sync worker.

If storage fails, the editor remains populated and the app MUST say that the score was not saved locally. It MUST NOT attempt HTTP submission outside the queue as a fallback.

“Saved on this iPhone” means only that the durable local transaction committed. “Official” requires either an accepted server acknowledgement or an authoritative refresh proving the official score is exactly equivalent.

Rapid double taps are suppressed by a local Save-operation lock and an intent fingerprint checked inside the durable transaction. An identical event returns the existing record and mutation ID. If the first request is already in flight, the duplicate does not create another record.

## 8. Same-hole edit policy

Native V1 uses a hybrid policy that preserves identity and correctness:

1. **Exact equivalent unresolved intent:** reuse the existing local record and mutation ID. Do not create or submit a duplicate.
2. **Different intent and prior record is provably never transmitted** (`everSubmitted:false`, `outcomeCertainty:notSent`, state `queued`): atomically mark the old record `resolved/supersededBeforeTransmission` and create a new queued record with a new mutation ID and later sequence. Retain a minimal link between the records. The old mutation ID is never repurposed.
3. **Prior record was submitted, may have been submitted, is syncing/retryable after an attempt, or is conflicted:** never coalesce it away. Preserve it. A correction receives a new mutation ID and waits behind the earlier record, or the user must first resolve the conflict.
4. **Official current score already exactly equals the new entry:** no mutation is needed; authoritative state remains official.

This is safer than mutating an already durable mutation ID and avoids sending immediately superseded, definitely-unsent intent. It also preserves an auditable local resolution receipt without treating the client as the official audit system.

## 9. Ordered replay and Match-level synchronization

- Replay is oldest-first by `sequence` within a Match partition.
- Exactly one hole mutation per Match may be `syncing` at a time.
- A Match-scoped durable/transactional lease prevents two in-process workers from owning the same queue.
- On termination, the lease expires by process identity; the persisted record remains.
- Different Matches MAY sync concurrently only when the same authenticated identity legitimately owns both queues. The default global concurrency cap SHOULD be two Match workers.
- A `conflict`, `actionRequired`, or `quarantined` record pauses automatic replay for its Match. Later records remain durable and are not submitted out of order.
- Fairness across Matches is round-robin among partitions with eligible oldest records; a failing Match must not starve a different authorized Match.

## 10. Revision handoff

An accepted acknowledgement for sequence N may update only concurrency metadata for later sequence N+1. It never changes gross intent, hole, Match, participant slots, or mutation ID.

Automatic Match-revision handoff is safe only when all are true:

1. The prior record was canonically accepted.
2. The acknowledgement's Match revision is durably stored.
3. Required post-ack refresh succeeds and returns that same Match revision.
4. The later record belongs to the same identity/tournament/Match partition and immutable snapshot.
5. All intervening local sequences are acknowledged/resolved.
6. The target hole's official gross and revision still match the later record's known base, or the target is canonically blank.
7. Permission remains writable and the Match is active.
8. No external-change evidence, conflict, reassignment, or lifecycle change exists.

Then `expectedMatchRevision` may advance to the acknowledged revision. For a later correction to the same hole, `expectedHoleRevision` may advance only to the immediately preceding accepted hole revision. The update MUST be one atomic metadata transition and retain the original base revisions for diagnostics.

If refreshed Match revision exceeds the acknowledgement, the target hole changed, snapshot identity changed, permission changed, or the source of advancement is uncertain, do not rebase automatically. Move to `conflict` or `actionRequired` and reconcile.

A blank target may undergo at most three automatic safe revision rebases, matching the bounded browser behavior. A fourth revision conflict without progress becomes `actionRequired`.

## 11. Network and retry policy

### 11.1 Outcome classification

- **Known not sent:** the device knew it was offline, auth was unavailable before request creation, or the request failed before transport began. Keep `everSubmitted:false`; no server outcome is assumed.
- **Known rejected:** an HTTP response explicitly rejected the request. Classify its v1 error code.
- **Unknown outcome:** the request began but timed out, the connection disappeared, response decoding failed, or the app terminated before acknowledgement persistence. Set `everSubmitted:true`, `outcomeCertainty:unknown`, and retry the same mutation ID.
- **Known accepted:** `accepted:true` was received and durably stored. Do not submit again; refresh official state.

DNS failures, connection resets, timeouts, transport cancellation, 500, and 503 are transient/unknown unless the transport can prove no bytes left the device. A replacement mutation ID is never created for these conditions.

### 11.2 Backoff

- At most two rapid foreground retries: approximately 2 seconds and 5 seconds after failure.
- Later delay: `min(15 minutes, 10 seconds × 2^(attemptIndex-3))` with ±20% random jitter.
- Honor a valid server `Retry-After` if it is longer.
- Persist `nextRetryAt`; do not reset attempts on app restart.
- After eight consecutive transient failures in one foreground session, stop active retry scheduling. Leave the record `retryable`; resume only at its due time after a new foreground/resume, credible reachability change, or explicit Retry.
- A manual Retry may make a transient record due immediately but MUST enforce at least two seconds since the previous attempt.
- Successful authentication refresh or an authoritative refresh does not create a new mutation ID.
- Permanent auth, permission, lifecycle, validation, conflict, and quarantine states never receive timed mutation retries.

Network reachability is only an optimization signal. “Available” may wake a worker; “unavailable” prevents an unnecessary attempt but never marks intent failed or deletes it. The HTTP result is authoritative.

## 12. Step 1C error-to-queue matrix

| Error | Queue transition | Automatic retry | Token refresh | Authoritative refresh | Manual/review and severity |
| --- | --- | --- | --- | --- | --- |
| `UNAUTHORIZED` | Temporarily retain as `retryable/authRefresh`; if refresh fails, `actionRequired` | Only after one successful auth refresh | Yes, once per cycle | After session restoration | Blocking authentication state |
| `INVALID_TOKEN` | Same as `UNAUTHORIZED` | Only after token replacement | Yes, once | After restoration | Blocking authentication state |
| `PARTICIPANT_NOT_FOUND` | `actionRequired/identity` | No | Session may refresh, but token alone is insufficient | Session and scoring current after identity returns | Blocking; explicit identity resolution |
| `MOBILE_API_UNAVAILABLE` | `retryable/environment` | Backoff and stale-age limits | No | On recovery before replay if aged | Persistent scoring-unavailable warning |
| `SCORING_UNAVAILABLE` | `retryable/environment` | Backoff and stale-age limits | No | On recovery | Persistent scoring-unavailable warning |
| `MATCH_NOT_FOUND` | `actionRequired/matchMissing` | No | No | Required | Blocking review; never rewrite Match ID |
| `SCORING_NOT_AUTHORIZED` | `actionRequired/authorization` | No | Only if session itself is invalid | Required | Blocking; preserve intent |
| `SCORING_READ_ONLY` | `actionRequired/readOnly` | No | No | Required | Blocking lifecycle state |
| `INVALID_SCORE_INPUT` | `quarantined/invalidRecordOrContract` | No | No | Optional for comparison, not submission | Serious local/contract defect; no silent repair |
| `REVISION_CONFLICT` | `conflict/revision` unless strict deterministic rebase/equivalence applies | No blind retry | No | Required immediately | Needs review when official differs |
| `IDEMPOTENCY_CONFLICT` | `quarantined/idempotencyConflict` | Never | No | Required for context | Serious consistency condition; explicit review/support |
| `FINALIZATION_NOT_READY` | Hole queue unchanged; finalization probe becomes unresolved UI state | No automatic finalize retry | No | Required | Resolve queue/completeness first |
| `MATCH_ALREADY_FINALIZED` | Hole record `actionRequired/finalized`; finalization probe resolves from refresh | No hole retry | No | Required | Show final canonical state; review differing intent |
| `INTERNAL_ERROR` | `retryable/unknownOutcome` | Same-ID backoff | No unless separately expired | After repeated failure or before stale replay | Persistent retry warning; never show raw error |

An unrecognized 4xx response becomes `quarantined/unknownPermanentResponse`. An unrecognized 5xx or transport failure becomes `retryable/unknownOutcome`. Raw server exception text is not persisted in telemetry or shown to the golfer.

## 13. Idempotent acknowledgement and crash windows

Both of these are official acceptance:

```text
accepted:true, idempotent:false
accepted:true, idempotent:true
```

Handling is identical except for diagnostics:

1. Atomically store `acknowledged` plus the bounded acknowledgement metadata.
2. Exclude the record from further mutation submission, but keep it refresh-pending and finalization-blocking.
3. Fetch authoritative scoring state.
4. Reconcile the returned canonical hole/Match revisions and later queued preconditions.
5. Mark refresh complete, remove it from unresolved/finalization-blocking counts, and replace the full queue payload with a short-lived minimal receipt.

Crash cases:

- Server accepted, app crashed before receiving response: launch converts interrupted `syncing` to `retryable/unknownOutcome`; same-ID retry returns an idempotent acknowledgement.
- Response arrived, app crashed before durable acknowledgement: same behavior and same safe retry.
- Acknowledgement was durable, app crashed before refresh: launch sees `acknowledged`; it refreshes only and MUST NOT resubmit.
- Refresh fails after acknowledgement: keep `acknowledged` and retry refresh with backoff. Do not revert to `retryable` mutation submission.

## 14. Conflict reconciliation

### 14.1 Revision conflict decision tree

On `REVISION_CONFLICT`:

1. Stop automatic replay for that Match.
2. Preserve the original mutation unchanged.
3. Mark it `conflict` with `refreshRequired:true`.
4. Fetch authoritative scoring current state.
5. Compare the local gross intent with the official gross score and revisions.

Outcomes:

- Official gross exactly equals local intent: transition the original record to `resolved/officialEquivalent`; no new write. The refreshed server state is official.
- Official hole is blank/unchanged and all strict revision-handoff rules are satisfied: update only concurrency metadata on the same intent/mutation ID and requeue, with at most three safe rebases.
- Official gross differs: remain `conflict`; show both values and require manual reconciliation.
- Match is final, read-only, reassigned, or permission revoked: transition to `actionRequired` while retaining both local intent and refreshed official state.
- Refresh fails: remain `conflict`; retry refresh only.

### 14.2 Keep Official

“Keep Official Score” performs no score mutation. It records explicit resolution on the conflicting local record, transitions it to `resolved/keptOfficial`, retains a bounded resolution receipt, refreshes Match state, and releases later queue records only if their preconditions can then be safely reconciled.

### 14.3 Reapply My Score

“Reapply My Score” MUST:

1. Refresh canonical scoring state.
2. Confirm the same identity partition, active Match, immutable slot context, and writable permission.
3. Preserve the original conflicting record and mark it `resolved/reappliedAsNewMutation` only inside the same transaction that creates the replacement.
4. Create a new local record and a **new mutation ID**.
5. Copy the golfer's gross intent, not any local calculated result.
6. Use current canonical Match and hole revisions.
7. Submit through normal authorization and canonical scoring authority.

The conflicting mutation ID is never recycled or edited into new intent.

### 14.4 Idempotency conflict

`IDEMPOTENCY_CONFLICT` is quarantined, not merely retryable. It signals mutation-ID reuse or local association corruption. The app MUST preserve the record and relevant bounded official state, stop the Match queue, and require explicit review. It MUST NOT silently allocate a new ID. After investigation, a user may keep official, explicitly abandon, or create genuinely new intent through the normal reconciliation workflow.

## 15. Termination, restart, and backgrounding

### 15.1 Termination recovery

- `draft`: may be lost because it was never represented as saved. No saved confirmation is allowed.
- `queued`: remains queued with original ID and sequence.
- `syncing`: on launch, an expired process lease becomes `retryable/unknownOutcome`; retry uses the same ID.
- acknowledgement received but not persisted: indistinguishable from unknown outcome; same-ID retry is required.
- `acknowledged` with refresh pending: refresh only.
- `conflict` while refresh was running: remain conflict and restart the refresh, never the mutation.
- `actionRequired`/`quarantined`: remain unchanged until explicit resolution.

Launch recovery MUST NOT depend on graceful shutdown.

### 15.2 Background behavior

Correctness MUST assume that no background execution occurs. When entering background:

- finish an already atomic local transaction;
- do not start a new request unless the platform grants sufficient time;
- never delete or mark failure because time expires;
- if a request's completion cannot be durably recorded, leave the record as `syncing`, which launch recovery treats as unknown outcome.

Opportunistic background sync MAY process eligible work with the same locks, auth, backoff, and state transitions. It is an optimization only. Foreground launch/resume is always sufficient for recovery, including when the user force-quits, Low Power Mode is active, or background refresh is disabled.

## 16. Authentication expiration, sign-out, and account switching

### 16.1 Token expiration

An expired access token does not alter the mutation. The auth layer attempts normal Supabase session refresh once. A valid restored session must resolve to the exact stored Auth UUID and Player ID before replay. Failure moves the record to `actionRequired/authentication`; the intent remains durable. Tokens are never copied into the queue.

### 16.2 Sign-out

If unresolved records exist for the active identity:

1. Stop automatic workers and finish/expire Match leases.
2. Warn that scores remain unresolved; do not claim they are official.
3. Require explicit confirmation to continue sign-out.
4. Retain unresolved records under the original partition.
5. Clear auth secrets and removable participant display/cache data, but retain the minimal protected queue data required to preserve intent.
6. Hide the old partition after sign-out.

Acknowledged/refreshed records may undergo normal cleanup before or after sign-out. Sign-out itself never abandons unresolved intent. If the same Auth UUID and Player later return, refresh authoritative state and restore eligible records.

### 16.3 Account switching

When Player B signs in after Player A:

- B cannot see A's hole numbers, gross scores, Match details, queue counts, or diagnostics.
- A's workers remain stopped.
- A's token is gone and B's token is rejected by the local partition guard before network use.
- B receives a clean canonical scoring context and separate queue.
- A's queue becomes visible only after A's exact Auth UUID and Player mapping return.

An Auth UUID change, even to the same canonical Player, is not an automatic migration. The old partition becomes `actionRequired/identityChanged` and cannot replay under the new UUID.

## 17. Tournament and Match lifecycle

### 17.1 Tournament switch

Tournament ID is part of every partition. When application context advances:

- stop workers for old tournament partitions;
- retain unresolved records and flag them `actionRequired/staleTournament`;
- never substitute the new tournament ID or replay against the new tournament;
- if old canonical authority is no longer queryable, retain the record for explicit review/support or user-confirmed abandonment;
- apply stale-age rules without deleting intent.

### 17.2 Match reassignment and permission change

`SCORING_NOT_AUTHORIZED`, `SCORING_READ_ONLY`, changed snapshot/slots, or a Player/Match reassignment stops replay. Refresh canonical state, preserve intent, and transition to `actionRequired`. Automatic submission resumes only if the same identity and Match context become writable again and official state still permits safe same-intent replay.

### 17.3 Match finalized while offline

For an offline Hole 18 mutation after another device finalizes:

1. Retain the local intent.
2. Accept canonical denial/conflict; do not rewrite the request or reopen the Match.
3. Refresh final Match state.
4. If official gross equals local intent, resolve as `officialEquivalent`.
5. If it differs, retain `actionRequired/finalized` with local-versus-official comparison for review.
6. Only Director workflows outside native V1 may reopen the Match.

## 18. Finalization policy

Finalization is **online-only** and is not an offline hole-queue entry.

Prerequisites:

- no `queued`, `syncing`, `retryable`, `conflict`, `actionRequired`, or `quarantined` hole records for the Match;
- no `acknowledged` hole record with `refreshPending:true`;
- no unresolved earlier sequence;
- current authenticated session matches the partition;
- fresh uncached scoring-current response;
- canonical active/writable state and `canFinalize:true`;
- current Match revision from that refresh;
- explicit golfer confirmation.

Immediately before sending, the app SHOULD durably store a small finalization-attempt probe containing identity partition, Match ID, finalization mutation ID, expected Match revision, and state `prepared`. This probe is not an automatic queue and contains no score payload. Once transport begins, it becomes `outcomeUnknown` until a response or refresh resolves it.

Known failure before transmission returns to an eligible-but-not-finalized state; the golfer may retry after connectivity returns. Unknown outcome follows:

```text
finalization may have reached server
→ do not assume failure
→ refresh /scoring/current?matchId=...
→ final Match: resolve probe from canonical truth
→ active + canFinalize: require a new explicit golfer confirmation before retry
→ active + not ready/writable: show canonical blocking state
```

There is no blind or timed finalization replay loop. If the active Match revision remains unchanged, an explicit retry may reuse the original finalization ID. If canonical revision changed, a newly confirmed finalization attempt uses current revision and a new ID. `MATCH_ALREADY_FINALIZED` triggers refresh and resolves as success only when the refreshed Match is canonically final.

## 19. Stale mutation policy

The server publishes **no guaranteed idempotency-record retention duration**. This specification does not invent one. The following is solely a conservative local client policy measured from `createdAt`:

| Age | Client behavior |
| --- | --- |
| Under 6 hours | Normal retry policy, subject to auth, ordering, revision, and lifecycle checks |
| 6–24 hours | Show an aged-pending warning; mandatory authoritative refresh before another submission; automatic same-ID replay only if identity/context are unchanged and deterministic safe-rebase/equivalence checks pass |
| 24 hours–7 days | Stop automatic mutation replay; transition to `actionRequired/stale`; refresh and require explicit review. If reapplication is chosen, create new intent/ID against current revisions |
| 7 days or more | Transition to `quarantined/staleIdempotencyUncertain`; never submit automatically. Retain for explicit official comparison, support, reapplication as new intent, or user-confirmed abandonment |

No unresolved record is automatically deleted because of age. It remains until canonical acknowledgement, explicit reconciliation, explicit abandonment, or retained quarantine. At 30 and 90 days the app should surface maintenance/support guidance, not delete the record.

Even a definitely-unsent old mutation must refresh because permission, lifecycle, tournament, and Match context may have changed. A stale record's original ID is retained for diagnosis; a manual reapplication is a new intent with a new mutation ID.

## 20. Cleanup and retention

### 20.1 Safe automatic cleanup

- After `accepted:true` is durably stored and authoritative refresh succeeds, remove the full score payload and retain a minimal acknowledgement receipt for 24 hours.
- `idempotent:true` follows the same rule.
- Automatically retain at most 50 acknowledgement receipts per identity partition; delete oldest receipts above that bound.
- Minimal receipt fields: local record ID, mutation ID, Match ID, hole number, accepted/idempotent flags, canonical revisions, attempts, created/acknowledged/refreshed timestamps, resolution code, and app build. No gross scores or Player/Auth identifiers need remain in the receipt's telemetry projection.

### 20.2 User-resolved cleanup

- `keptOfficial`, `reappliedAsNewMutation`, `supersededBeforeTransmission`, and `userAbandoned` retain a minimal resolution receipt for seven days, capped with the same 50-record identity history.
- User-confirmed cleanup may remove the full unresolved payload only after the resolution/abandonment decision is atomically recorded.

### 20.3 Never automatic without resolution

Do not auto-delete:

- differing revision conflicts;
- idempotency conflicts;
- identity mismatches;
- malformed or unsupported records;
- permission-revoked intent differing from official state;
- stale tournament intent;
- any `actionRequired` or `quarantined` record.

The server is the official score archive. The local receipt window exists only for reliability diagnosis and is not a permanent score history.

## 21. Bounds, integrity, and local schema evolution

### 21.1 Defensive bounds

- Maximum unresolved records per Match: 36. This permits a full 18-hole card plus one correction generation per hole while making abnormal growth obvious.
- Maximum unresolved records per tournament/identity partition: 144, enough for multiple full scorecards while treating hundreds as defective behavior.
- Maximum retained acknowledged/resolved receipts: 50 per identity partition.
- Maximum serialized queue record: 32 KiB; the projected Step 1C request must remain under its 16 KiB limit.
- More than 36 conflict/action-required/quarantine records in one Match is a queue-health fault.

Bounds never justify eviction of unresolved intent. At a bound, atomically stop accepting additional Save operations for the affected scope, preserve existing records, mark queue health `actionRequired`, and present a blocking storage/review condition. A failed admission is explicitly “not saved,” never false success.

### 21.2 Load validation

Every launch validates:

- supported `queueSchemaVersion` and `apiContractVersion`;
- required fields and known state enum;
- unique local record and mutation identifiers;
- exact non-empty identity/tournament/Match partition;
- mutation ID format and length;
- hole number 1–18;
- format `BB`, `SC`, or `SI` and corresponding array count;
- integer gross scores from 1 through 20, matching the Step 1C accepted range;
- non-negative safe Match/hole revisions;
- parseable timestamps and coherent ordering;
- bounded record size;
- acknowledgement/conflict structures valid for their states.

Malformed records transition to `quarantined` with a fixed non-sensitive reason such as `unsupportedSchema`, `missingPartition`, `invalidIntent`, `duplicateMutationId`, `invalidRevision`, `invalidState`, or `recordTooLarge`. The app MUST NOT infer or repair gross-score intent.

### 21.3 Schema versioning and app updates

Initial values:

```text
queueSchemaVersion = 1
apiContractVersion = "v1"
```

On app build N+1:

- load and validate existing records before enabling submission;
- run only deterministic, transactional, lossless migrations;
- preserve mutation IDs, partition, gross intent, timestamps, sequence, attempts, and original revisions;
- update concurrency metadata only through the defined authoritative reconciliation rules, not merely because the app version changed;
- quarantine the original record if migration cannot preserve meaning exactly;
- treat a record from a newer unsupported schema as read-only quarantine, not as an older shape.

An app update never deletes or silently reinterprets unresolved scores.

## 22. Authoritative refresh policy

An uncached `GET /api/mobile/v1/scoring/current?matchId=...` is mandatory:

- after `accepted:true`;
- after `idempotent:true`;
- after `REVISION_CONFLICT` or `IDEMPOTENCY_CONFLICT`;
- after permission, read-only, Match-not-found, or lifecycle errors;
- after finalization with an unknown outcome;
- on app launch/restart with unresolved or acknowledgement-refresh-pending records;
- after restoring a session with an unresolved partition;
- after at least 15 minutes offline before replay;
- after at least five minutes in background before returning to scoring;
- before any explicit finalization;
- before stale records are reviewed or re-applied;
- after account or tournament context restoration;
- after “Keep Official” or “Reapply” reconciliation.

If refresh fails:

- an unacknowledged mutation retains its current unresolved state;
- an acknowledged mutation remains `acknowledged/refreshPending` and is not resubmitted;
- a conflict remains conflict and does not submit;
- finalization remains outcome-unknown and is not blindly retried.

## 23. Observability, security, and privacy

Permitted local diagnostic fields:

- mutation ID and local record ID;
- Match ID and hole number;
- queue state and fixed reason/error code;
- attempt count and timing timestamps;
- app build and queue schema version;
- accepted/idempotent flag and canonical revision numbers;
- transition source such as foreground, background opportunity, manual Retry, or launch recovery.

Gross scores MUST remain out of analytics and remote telemetry by default. They exist only in the protected queue and bounded on-device conflict comparison. Auth UUID and Player ID may be used for local partition enforcement but MUST NOT be emitted to general analytics. Email, phone, names, team names, tokens, cookies, OTPs, service-role credentials, raw server errors, and full scoring snapshots are forbidden in diagnostics.

The future store must use native file/data protection suitable for authenticated participant data. Auth and refresh tokens remain in the auth/session layer's secure storage, never in queue rows. Queue diagnostics are bounded and cannot become a shadow scoring database or device fingerprint.

## 24. Future UI reliability states

Step 1E must visually and accessibly represent these product states:

| Product state | Queue/server mapping | Treatment requirement |
| --- | --- | --- |
| Official | Canonical refresh or accepted acknowledgement confirms score | Subtle durable status; official Match/leaderboard effects only here |
| Saved locally | `queued`, no active request | Persistent non-blocking status; distinguish from official |
| Syncing | `syncing` | Persistent activity status; disable duplicate Save for same intent |
| Offline | queued/retryable plus reachability hint | Persistent local-save status; no destructive warning |
| Retrying | transient `retryable` | Persistent warning with next/manual retry context |
| Needs review | `conflict`, `actionRequired`, or `quarantined` | Persistent and blocking for affected Match/finalization; manual path |
| Scoring unavailable | environment 503 retryable condition | Persistent warning; preserve queue |
| Read-only | canonical read-only/final/locked state | Blocking score submission; official state remains viewable |
| Match finalized | refreshed canonical completed state | Blocking scoring; show official result and unresolved local review if any |
| Authentication required | auth `actionRequired` | Blocking sync; preserve hidden partition |

Status MUST NOT rely only on color, tiny icons, haptics, or transient toasts. Local, syncing, review, unavailable, read-only, and final states need text exposed to assistive technology. A Match with unresolved intent must not show canonical finalization readiness based on optimistic values.

## 25. Threat and failure matrix

| Scenario | Deterministic required behavior |
| --- | --- |
| A — normal online Save | Validate → durable `queued` insert → submit → accepted → durable acknowledgement → refresh → receipt cleanup |
| B — completely offline | Durable queue without attempt → close/reopen safely → authenticate/refresh → same-ID replay → acknowledge → cleanup |
| C — server commits, response lost | `syncing` becomes unknown/retryable → same-ID replay → `idempotent:true` → refresh → acknowledge |
| D — another device changes same hole | `REVISION_CONFLICT` → stop Match queue → preserve local → refresh official → differing values remain `conflict` |
| E — user keeps official | Record `resolved/keptOfficial`; no score mutation; refresh and release later work only if safe |
| F — user reapplies local | Refresh/authorize → resolve original → create new record/new ID/current revisions → normal canonical submission |
| G — app killed during sync | Stale process lease → `retryable/unknownOutcome` → same-ID retry |
| H — sign-out with pending score | Warn → stop worker → retain original partition → B cannot see/replay → A restores after reauth/refresh |
| I — Match finalized elsewhere | Denial/conflict → refresh final state → preserve differing local intent for review → never reopen |
| J — finalization response lost | Durable finalization probe → refresh canonical Match → final resolves; active requires explicit retry; no loop |
| K — app update | Validate/migrate losslessly → preserve IDs/intent/revisions → resume; unsafe migration quarantines |
| L — corrupt local record | Load validation fails → quarantine → never submit or silently repair |
| No signal before Save | Durable insert succeeds and remains queued; reachability does not change correctness |
| Signal lost during request | Unknown outcome; same-ID retry only |
| DNS/server unavailable or API 503 | Retryable with bounded backoff and stale policy |
| Token expires | Preserve queue; refresh token once; exact partition required before replay |
| Token cannot refresh | `actionRequired/authentication`; no submission or deletion |
| Permission revoked/reassigned | Stop replay; refresh; retain `actionRequired` intent |
| Same mutation ID reused incompatibly | `IDEMPOTENCY_CONFLICT` → quarantine Match queue; no new ID allocated silently |
| Golfer double taps Save | Save lock/fingerprint returns one durable record and mutation ID |
| Later local hole depends on prior revision | Match serialization and accepted-revision handoff; no concurrent send |
| Official state equals local after conflict | Resolve `officialEquivalent` without another write |
| Official target blank after only known local revision advance | Bounded strict metadata-only rebase, same intent/ID |
| Queue grows abnormally | Stop admissions/submission as appropriate; preserve records; queue-health review, never eviction |
| Background time never granted | Foreground launch/resume fully recovers and processes queue |
| Finalization attempted with unresolved queue | Client blocks before request; server remains final authority |
| Old tournament becomes inaccessible | Stop replay, retain stale partition, explicit review/support/abandonment only |

Scenarios A–L and the additional threats are deterministic with the Step 1C contracts. No server amendment is required.

## 26. Platform-independent pseudocode

### 26.1 Save Score

```text
function saveScore(editor, identity, currentSnapshot):
    assert identity.authUserId and identity.playerId are verified
    validate hole, gross arrays, format, revisions, and snapshot

    transaction(matchPartitionLock):
        if equivalent unresolved intent exists:
            return existing record

        if different same-hole record exists and is provably never transmitted:
            mark old record resolved(supersededBeforeTransmission)

        if queue bounds would be exceeded:
            fail transaction as NOT SAVED

        record = new queued mutation
        record.localQueueRecordId = new local UUID
        record.mutationId = new server-compatible UUID
        record.sequence = next sequence for Match
        insert and commit record

    publish SAVED LOCALLY
    signal sync worker
```

### 26.2 Sync Worker

```text
function syncMatch(partition):
    acquire one Match worker lease or return
    restore valid Supabase session
    resolve canonical Player
    if identity != partition identity:
        mark actionRequired(identityMismatch); stop

    while foreground/background time permits:
        entry = oldest unresolved record by sequence
        if none: stop
        if entry blocks automatic replay: stop
        if stale or refreshRequired: refresh and reconcile; continue or stop
        if entry.nextRetryAt is future: schedule bounded wake; stop

        atomically transition queued -> syncing with process lease
        send Step 1C request using original mutationId and current stored preconditions

        if accepted true:
            atomically persist acknowledged and bounded acknowledgement
            refresh canonical scoring
            if refresh succeeds:
                safely hand off revisions to later entries
                replace payload with diagnostic receipt
                continue
            stop and retry refresh later; do not resubmit

        classify error:
            transient/unknown -> retryable with backoff and same ID
            revision conflict -> conflict, refresh, deterministic reconciliation
            permission/lifecycle -> actionRequired, refresh
            invalid/idempotency/local integrity -> quarantined
        stop this Match queue when result is unresolved/blocking
```

### 26.3 App Launch Recovery

```text
function recoverOnLaunch():
    open protected durable store
    migrate transactionally if lossless
    validate every record and quarantine invalid records
    convert stale syncing leases to retryable(unknownOutcome)
    rebuild partition and Match ordering indexes

    restore authenticated session if possible
    expose only the exact active identity partition
    for each active partition with unresolved or refresh-pending records:
        refresh canonical Match state
        reconcile equivalent/conflicting/lifecycle state
        start eligible Match workers within global concurrency cap
```

### 26.4 Conflict Reconciliation

```text
function reconcileConflict(record):
    official = refresh scoring current for record.matchId
    if official gross == record intent:
        resolve original as officialEquivalent; no mutation
    else:
        show saved intent versus official gross

    if golfer chooses Keep Official:
        atomically resolve original as keptOfficial
        refresh and reconsider later queue entries

    if golfer chooses Reapply:
        require same verified identity, writable Match, current snapshot
        transaction:
            resolve original as reappliedAsNewMutation
            create NEW queued record with NEW mutationId
            copy gross intent and current canonical revisions
        signal worker
```

### 26.5 Finalization

```text
function finalizeMatch(matchPartition):
    require network opportunity and valid exact identity
    require zero unresolved hole records
    official = refresh scoring current
    require official.permission.canFinalize == true
    require explicit golfer confirmation

    persist finalization probe(prepared, mutationId, official match revision)
    submit Step 1C finalization once

    if accepted:
        persist probe resolved
        refresh canonical final Match
    else if known not sent:
        leave eligible for a later explicit attempt
    else if outcome unknown:
        mark probe outcomeUnknown
        refresh canonical Match
        if final: resolve from canonical truth
        if active and canFinalize: require explicit confirmation before retry
        otherwise show canonical blocking state
```

## 27. Future native storage recommendation

Use a small explicitly versioned SQLite-backed queue repository, either through the system SQLite API or a mature thin wrapper selected when Xcode is available. SQLite best fits this queue because it provides:

- atomic insert/state-transition transactions;
- unique constraints for local/mutation identity;
- indexed partition and Match-order queries;
- durable write-ahead logging and crash recovery;
- explicit, testable schema migrations;
- compare-and-swap style Match leases;
- bounded cleanup without loading the full queue.

SwiftData is acceptable only if implementation tests prove equivalent transaction boundaries, uniqueness, deterministic migrations, and recovery. Its convenience is not a reason to weaken explicit queue semantics. Core Data is unnecessary unless the broader native product already standardizes on it and can meet the same requirements.

The store should use appropriate iOS Data Protection and remain local to the device. Auth tokens belong in the Supabase auth/secure credential layer, not this SQLite store. No implementation choice is made in Step 1D.

## 28. Future Swift implementation test plan

### 28.1 Unit tests

- Every allowed and prohibited state transition.
- Save-first boundary and double-tap deduplication.
- Equivalent-intent reuse and same-hole supersession rules.
- Match ordering, fairness, and one-in-flight enforcement.
- Safe Match/hole revision handoff and all unsafe-rebase conditions.
- Three-rebase cap.
- Error classification for every Step 1C code and unknown 4xx/5xx.
- Backoff, jitter bounds, manual Retry throttle, and stale thresholds with a fake clock.
- Identity/tournament/Match partition isolation.
- Conflict Keep Official/Reapply behavior and new-ID requirement.
- Cleanup, receipt bounds, queue capacity, and no unresolved eviction.
- Finalization prerequisite and unknown-outcome state machine.
- Diagnostic redaction.

### 28.2 Persistence tests

- Atomic save/reload before network starts.
- Crash at every state transition boundary.
- `syncing` lease recovery after process death.
- Crash after server acknowledgement but before local persistence.
- Crash after acknowledgement persistence but before refresh.
- Lossless schema migration across app builds.
- Unsupported newer schema quarantine.
- Malformed/duplicate/oversized record quarantine.
- Sign-out retention and exact-account restoration.
- Protected-store behavior while device data is unavailable/locked.

### 28.3 API integration tests

- `accepted:true, idempotent:false`.
- Same-ID retry returns `idempotent:true` with no duplicate effect.
- Match and hole revision conflicts.
- Same-ID/incompatible intent idempotency conflict.
- Auth expiration and successful refresh.
- Failed auth restoration and participant-not-found.
- Permission revocation, read-only, reassignment, and final Match.
- Mobile/scoring authority 503.
- Current-state refresh after acknowledgement/conflict.
- Explicit finalization success, not-ready, stale, already-final, and lost-response reconciliation.

### 28.4 End-to-end device tests

- Airplane Mode before and after Save.
- Poor/variable cellular and request timeout.
- Wi-Fi-to-cellular transition during request.
- Force quit immediately after durable Save.
- Force quit during HTTP request.
- Force quit after accepted response before local acknowledgement persistence.
- Reopen and same-ID recovery.
- Second iPhone changes the same hole.
- PWA changes the same hole.
- Another device finalizes while an iPhone mutation is offline.
- Sign out with pending intent and explicit continuation.
- Player A → Player B → Player A account switching.
- Tournament context advancement with stale queue.
- App update with queued, syncing, conflicted, and quarantined records.
- Background refresh disabled, Low Power Mode, and no granted background time.
- VoiceOver/Dynamic Type access to persistent local/official/review states.

No Step 1D tests implement Swift; this plan defines future acceptance coverage.

## 29. Performance, battery, accessibility, and human factors

- Sync is event-driven by Save, due retry, credible connectivity change, foreground/resume, auth restoration, or optional background opportunity.
- Do not poll continuously or retry every second.
- Serialize within Match; use a global cap of two Match workers.
- Avoid repeated auth refresh within one sync cycle.
- Stop Match replay at the oldest blocking record.
- Use server acknowledgement and required refresh rather than polling for speculative completion.
- Correctness must not depend on keeping the process or network connection alive.
- Reliability status must be persistent, textual, and available to assistive technology—not color-only, icon-only, haptic-only, or toast-only.
- Golf-course glare, distraction, gloves, and intermittent attention make “local” versus “official” wording and large actionable controls essential inputs for Step 1E.

## 30. Step 1C compatibility review

| Reliability need | Step 1C capability | Alignment |
| --- | --- | --- |
| Stable durable identity | `mutationId` format and `(matchId, mutationId)` uniqueness | Exact |
| Ordered optimistic concurrency | Required expected Match and hole revisions | Exact |
| Official acceptance | `accepted:true` acknowledgement | Exact |
| Lost-response retry | Same ID/same intent returns `idempotent:true` | Exact |
| Incompatible reuse detection | `IDEMPOTENCY_CONFLICT` | Exact; native quarantines |
| Cross-device protection | `REVISION_CONFLICT` with bounded current revisions | Exact |
| Authoritative refresh | Match-scoped `/scoring/current?matchId=...` | Exact |
| Permission/lifecycle change | Stable authorization, read-only, missing, and finalized errors | Exact |
| Privacy/cache safety | Bearer identity plus private/no-store scoring responses | Exact |
| Offline finalization safety | Explicit finalization plus canonical refresh after unknown outcome | Sufficient; finalization stays online-only |
| Long-lived replay | No published idempotency retention duration | Addressed by conservative local stale policy; no server guarantee claimed |

Step 1D requires **no Step 1C runtime or API change**. The existing contracts are sufficient for deterministic active-tournament hole replay, conflict review, and online finalization reconciliation.

## 31. Known limitations and decisions deferred only to implementation tooling

- Server idempotency-record retention has no published duration. The 6-hour/24-hour/7-day client thresholds are local safety policy, not server guarantees.
- A prior-tournament queue may become impossible to refresh automatically after canonical participant context advances. The record remains retained/action-required or quarantined; it is never replayed into the new tournament or silently deleted.
- Finalization does not guarantee the same accepted acknowledgement after a post-commit retry. The finalization probe and canonical refresh provide deterministic resolution without blind replay.
- iOS background time is not guaranteed and is never part of correctness.
- The exact SQLite wrapper, data-protection class, and OS background scheduling API will be selected with Xcode, but they may not alter this state machine or its invariants.
- Product wording and visual hierarchy are deferred to Step 1E; the reliability states and accessibility requirements are fixed here.

None of these limitations blocks a robust native V1 scoring queue.
