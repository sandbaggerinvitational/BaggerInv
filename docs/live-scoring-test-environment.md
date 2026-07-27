# Live scoring test environment

This prototype is intentionally prevented from writing to the production spreadsheet.

## Isolation requirements

1. Make a Google Sheets copy of the production workbook.
2. Share only that copy with the existing Google service account as an editor.
3. Configure the preview deployment with the variables in `.env.example`.
4. Set `SCORING_ENVIRONMENT=test`.
5. Set `GOOGLE_SHEETS_ID` to the copy's ID. The scoring writer rejects the known production spreadsheet ID.

Do not reuse production secrets for the preview.

## Test-sheet additions

Add these columns to `Live Matches`:

- Access Code Hash
- Current Hole
- Team 1 Holes Won
- Team 2 Holes Won
- Holes Remaining
- Match Status Text
- Updated At
- Updated By
- Finalized At
- Finalized By

Add a `Live Hole Scores` tab with these headers:

`Hole Score ID`, `Match ID`, `Hole Number`, `Stroke Index`, `Format`,
`Team 1 Gross Scores`, `Team 2 Gross Scores`, `Team 1 Net Score`,
`Team 2 Net Score`, `Hole Winner`, `Revision`, `Updated At`, `Updated By`.

The copied workbook must also retain `Course Holes`, `Match Update Log`,
`Players`, `Handicaps`, `Team Names`, `Matches`, and the existing tournament tabs.

## Match codes

Choose a different code for each match. Store only its hash:

```sh
SCORING_ACCESS_CODE_SALT="the-preview-salt" node scripts/hash-scoring-code.mjs SBI-4821
```

Paste the output into that match's `Access Code Hash` cell. Give the original
code—not the hash—to the designated golfers.

## Test checklist

- A match code opens only its assigned match.
- The admin password can open any match.
- Best Ball accepts two gross player scores per side.
- Scramble accepts one gross team score per side.
- Singles accepts one gross player score per side.
- Stroke allocation matches the `Course Holes` stroke index.
- A second stale phone receives a conflict instead of overwriting a score.
- Corrections increase the revision and remain in `Match Update Log`.
- `/live` shows match position and refreshes about every 15 seconds.
- Front, back, and overall points total three for Best Ball and Scramble.
- Singles awards three overall points.

Nothing should be merged or connected to production until this checklist passes
on multiple phones in the preview environment.
