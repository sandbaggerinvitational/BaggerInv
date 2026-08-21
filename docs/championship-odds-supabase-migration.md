# Championship Odds — Preview Supabase input and publication contract

## Unchanged engine contract

`lib/tournament-odds.js` supports Pre-Tournament, After Round 1, After Round 2,
Round 3 Pairings Announced, and Final Results. Its default simulation count is
10,000; the Director route also permits 25,000, 50,000, and 100,000. The random
stream remains FNV-derived from `year|milestone|odds-v2-nassau`.

Inputs actually consumed are the active tournament year, two team names and
rosters, match participants/formats, configured points available per round,
official team points for completed milestone rounds, official Round 3 Singles
pairings for the Pairings/Final milestones, and per-player OVERALL/format
Sandbagger ratings with their match counts. Outputs remain the existing year,
phase/order, timestamp, iterations, total points, two team probability/Odds/
expected-points rows, and ranked player probability/Odds/expected-points/
expected-record/average-finish rows. Movement remains a comparison of retained
published milestones and is not calculated by this engine.

## Google inventory and classification

The legacy loader discovers and reads Tournaments, Players, Matches, Live
Matches, Team Names, Live Tournaments, Live Round Handicaps, Tournament Rules,
Courses, Handicaps, Course Scorecards, optional Course Holes/Round Scorecards/
Ghost Match, Prediction Settings, and optional Draft Settings/Picks, then loads
the historical dataset used to derive ratings. For this engine:

- Current tournament/team/player/match/pairing/result state is canonical in
  Supabase and no longer needs Google.
- Prediction Settings are Director configuration and are retained exactly in a
  versioned projection, although the current odds engine does not read them.
- Only the exact resulting Sandbagger rating map required by the engine is
  projected; raw Player Intelligence history is not migrated.
- Draft sheets, courses, hole definitions, and scorecards are legacy fan-out
  for this calculation. They are not silently translated into assumptions.
- Odds Control/Snapshots/Team Results/Player Results remain the reporting mirror
  and rollback workflow.

This removes the complete prediction-sheet discovery fan-out and historical
Google refresh from a Supabase calculation. Configuration refresh is the only
Google-dependent input operation.

## Source boundaries and lifecycle

The versioned input bundle is tournament/workbook scoped, fingerprinted,
audited, immutable after supersession, and service-only. The canonical adapter
combines it with the current Supabase scoring-authority view and translates that
state into the existing JavaScript engine contract.

Supabase-native publication is Director-only, milestone validated, input- and
source-fingerprinted, deterministic-seed identified, transactionally current,
and logically idempotent. A changed source/configuration/rating/pairing contract
creates a new revision. Identical requests return the existing snapshot. Final
Results requires every match to be FINAL with an 18-hole-complete scorecard.

Corrections and Reopen operations change the current source fingerprint and
make an existing publication stale; they never silently republish. The Director
must explicitly publish again. Configuration refresh creates a new version and
also requires explicit publication.

After a verified Supabase publication, a Google reporting mirror is attempted
separately. A Google 429/503/readback failure leaves the Supabase publication
valid and the mirror job retryable. Mirror delivery is claimed before the
four-tab write, checkpointed only after exact readback verification, and may be
reclaimed after an interrupted worker lease. Repeated publication and mirror
requests resolve idempotently without another snapshot, reporting row set, or
revision. When a newer publication becomes official, any unfinished older
mirror job is superseded and cannot move Google back to the prior milestone.
Existing Google history is never rewritten by migration or rollback.

## Non-destructive publication certification

`POST /api/odds/publication-operations` with the Director-only `rehearse`
action runs only on an isolated Preview deployment. It loads the current
Supabase input bundle, executes the unchanged deterministic Odds engine, builds
the same native publication payload and the same four-tab Google reporting
record sets, and invokes the real publication RPC in rehearsal mode.

The database rehearsal performs the actual append/current-pointer, mirror-job,
injected failure, retry, verified completion, duplicate publication, and
duplicate delivery operations inside one PostgreSQL subtransaction. It then
raises and catches a dedicated rollback signal. The response is successful only
when the official snapshots and mirror jobs are byte/value unchanged afterward.
No Google write is issued during rehearsal. A separate Director-only
`retry-google-mirror` action is hard-gated to an isolated Preview where Supabase
is already the resolved publication authority; it cannot be used while Google
remains the selected publication authority.

Preview server flags are `ODDS_CALCULATION_INPUT_SOURCE` and
`ODDS_PUBLICATION_AUTHORITY`. Both fail closed to Google outside an isolated
Preview deployment. Rollback is a flag change and Preview redeploy; projected
inputs and Supabase/imported history remain preserved.
