# Live scoring schema mapping

Audited against the published Google Sheet on July 21, 2026.

## Current flow

`Live Matches` is read by `app/live/sheetData.js` and rendered by the public Match Center. The sheet currently has 24 rows. `Matches` is the permanent historical source consumed by `lib/stats.js`; it currently has 224 rows.

Both sheets use `Match ID`, so future writes and finalization can be idempotent.

## Live Matches

Current columns:

- Match ID, Year, Round, Format, Match, Course ID, Tee Time
- Team 1/2 player IDs, player playing handicaps, and player strokes
- Team 1/2 playing handicaps and strokes
- Matchup Winner, Front 9 Winner, Back 9 Winner, 18-Hole Winner
- Team 1 Points, Team 2 Points, Match Status, Notes

The sheet does not currently contain current-hole state, holes won, holes remaining, update timestamps, or updater identity. Those fields must be added before a true hole-by-hole admin controller is built.

Recommended additive columns:

- Current Hole
- Team 1 Holes Won
- Team 2 Holes Won
- Holes Remaining
- Match Status Text
- Updated At
- Updated By
- Finalized At
- Finalized By

## Matches

The permanent sheet mirrors most finalized Live Matches fields, but currently omits `Course ID` and `Tee Time`. It also lacks completion and audit metadata.

Recommended additive columns:

- Course ID
- Tee Time
- Completed At
- Finalized At
- Finalized By

Existing result columns should remain the source of truth: Matchup Winner, Front 9 Winner, Back 9 Winner, 18-Hole Winner, Team 1 Points, Team 2 Points, Match Status, and Notes.

## Safe write plan

1. Build Phase 1 against `Live Matches` only after the additive live-state columns exist.
2. Reuse the existing admin authorization used by Tournament Guide writes.
3. Resolve rows by exact `Match ID`; reject missing or duplicate IDs.
4. Validate formats, winner values, point ranges, holes, status, and player IDs server-side.
5. Update only an allowlist of Live Matches fields and write `Updated At`/`Updated By`.
6. Revalidate the Match Center route after each successful update.
7. Add finalization only after result-allocation tests cover Best Ball, Scramble, and three-point Singles.
8. Upsert `Matches` by `Match ID`, never append blindly.
9. Add a separate Match Update Log before supporting reopen/correction workflows.

No live or permanent sheet write logic was added during this schema-audit change.
