# Hole-by-hole scoring event plan

This milestone keeps Google Sheets and the current segment-result model. The UI must not infer a current hole or match-play position from Front 9, Back 9, or Overall winners. The following is the recommended transactional model for the next scoring milestone.

## Core records

### Match

Stores the pairing, format, course, tee, scorer assignments, lifecycle state, and a monotonically increasing `version`. A match points to its current official scorecard but does not duplicate derived hole or match status.

### Hole result

One record per match and hole:

- `match_id`, `hole_number`, `par`, `stroke_index`
- gross scores for each player or scramble side
- handicap strokes applied to each competitor
- calculated net scores and winning side
- `version`, `created_at`, `created_by`, `superseded_at`

Submitted gross scores are immutable facts. Corrections supersede a prior version rather than silently overwriting it.

### Score event

An append-only audit stream records `hole_saved`, `hole_corrected`, `hole_undone`, `scorecard_submitted`, `match_finalized`, and `match_reopened`. Each event includes actor, timestamp, device-generated idempotency key, expected match version, and before/after references.

## Derived match state

The server derives all match-play language from the accepted hole results:

- side with the lower net score wins the hole; equal net scores halve it
- `UP` / `DOWN` is the difference in holes won
- `THRU` is the highest contiguous confirmed hole, not the number of segment winners
- `dormie` applies when the lead equals holes remaining
- a match is final when the lead exceeds holes remaining, or after 18 when all required holes are confirmed
- final margins use standard match-play language such as `3 & 2`, `1 UP`, or `Halved`

Front 9, Back 9, Overall, team points, and individual points are derived from that same accepted scorecard.

## Undo and corrections

Undo creates a reversing event and exposes the previous accepted version. A scorer can correct an unfinished assigned match. Finalized matches require an administrator to reopen them; the audit log records the reason, prior official result, correction, and refinalization.

## Scorers and permissions

- Public viewers: read only
- Match scorer: submit and correct holes only for the assigned match code
- Tournament scorer: update assigned rounds or matches
- Administrator: update any match, reopen, correct, and finalize

Store match codes as salted hashes. Use short-lived signed sessions after code verification and log the authenticated role and scorer assignment on every write.

## Conflicts and versions

Every write supplies `expected_version`. The server accepts it only when it matches the current match version, increments the version atomically, and returns the new canonical scorecard. A stale device receives a conflict response with the latest state and must ask the scorer to review before retrying. Idempotency keys make repeated mobile submissions safe.

## Offline synchronization

The mobile client may queue signed, timestamped hole events locally. When connectivity returns it sends them in order with idempotency keys and the last known version. The server never resolves conflicting edits with last-write-wins; it returns a reviewable conflict. The device retains unsubmitted entries until the canonical response is received.

## Recommended migration

Google Sheets can remain a publishing and export surface, but reliable concurrent scoring should move to a transactional PostgreSQL service such as Supabase:

1. Create match, scorer, hole-result, event, and audit tables in a separate test project.
2. Mirror current sheet pairings into the database by stable `Match ID`.
3. Run database scoring in shadow mode and compare every derived segment and point result with the existing sheet.
4. Make the database the write source only after test-round reconciliation.
5. Publish finalized summaries back to Google Sheets for existing reports and history.
6. Move the public Match Center to database realtime subscriptions with polling as a fallback.

Row-level security should enforce scorer assignments, while all finalization and correction rules remain server-side.
