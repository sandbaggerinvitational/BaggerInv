# Preview Supabase scoring-read cutover

This document records the participant contract replaced by the Preview-only
`SCORING_READ_SOURCE=supabase` cutover. It is intentionally a read adapter:
scoring transactions, calculation rules, revision checks, idempotency, Google
outbox delivery, and the finalized Round Scorecards archive are unchanged.

## Existing `readLiveScoringMatch()` contract

The legacy reader performs one Google `values:batchGet` containing seven ranges:
`Live Matches`, `Live Hole Scores`, `Course Holes`, `Players`, `Courses`,
`Rounds`, and `Team Names`. It returns:

- `match`: the selected Live Matches row with access-code/token columns removed.
- `courseHoles`: the 18 Course Holes rows for the match's Course ID and tee.
- `holeScores`: Live Hole Scores rows for the Match ID, ordered by hole.
- `canConfirm`: non-Final plus the existing 18-unique-hole completeness rule.
- `display`: player names, team names/logos, course presentation, format name,
  and match name assembled from Players, Team Names, Courses, Rounds, and the
  selected Live Matches row.

The normal Preview participant route now obtains the equivalent contract from
the service-role-only `read_game_center_view` RPC and translates it in
`lib/scoring-read-supabase.js`. There is no Google fallback in the Supabase
branch.

## Field mapping

| Participant field | Previous Google source | Canonical Supabase source | Presentation projection | Contract |
| --- | --- | --- | --- | --- |
| Tournament ID/year | Live Matches | `tournaments`, `matches` | none | required |
| Round/format | Live Matches, Rounds | `matches`, `rounds` | format label derived by unchanged JS | required |
| Match ID | Live Matches | `matches.match_id` | none | required |
| Display match number/name | Live Matches | stable Match ID | `game_center_presentations.display_match_number` | required |
| Lifecycle/status/finalized timestamp | Live Matches | `matches.status`, `finalized_at` | none | required |
| Scoring lock | Live Matches | `matches.scoring_locked` | none | required |
| Scorecard complete/unresolved mutations | derived plus Live Matches | `matches.scorecard_complete`, `unresolved_mutations` | none | required |
| Match/permission revision | Live Matches/access version | `matches.match_revision`, `permission_revision` | none | required |
| Current hole/holes remaining/holes won/running result | Live Matches | canonical fields on `matches` | none | required |
| Official result/winner | Live Matches | `matches.result_winner` | unchanged result formatter for display-only fallbacks | required when decided/final |
| Front/back/overall points | derived from Live Hole Scores | unchanged JavaScript engine over canonical `hole_scores` | none | required |
| Team IDs | implicit team side/name lookup | `teams.team_id` by `team_side` | none | required; never inferred from labels |
| Team names/logos/colors | Team Names | `teams.name` | `game_center_presentations` assets/colors | name required, assets optional |
| Player IDs and slots | Live Matches player columns | `match_participants.player_id`, `team_side`, `player_slot` | none | required by format |
| Player display names | Players | `players.display_name` joined by RPC | none | required |
| Handicap index/course HCP/playing HCP/final strokes | Live Matches | immutable imported `match_participants` values | none | required for participant slots |
| Team playing HCP/strokes | Live Matches | immutable `scoring_snapshots.team_configuration` | none | required for Scramble/team display |
| Score authorization | Live Matches access fields and Passport | `scoring_permissions` plus the existing server authorization RPC/session validation | none | required; server enforced |
| Course ID/tee/rating/slope/par | Courses, Live Matches | immutable `scoring_snapshots` | none | required |
| Hole number/par/stroke index/yardage | Course Holes | immutable `match_holes` | none | required (yardage optional only when source is absent) |
| Tee time/starting hole/course name/logo/yardage label | Live Matches, Courses | stable match/course identities | `game_center_presentations` | name/time required for current 2026 presentation; assets optional |
| Gross scores | Live Hole Scores | `hole_scores.team_1_gross_scores`, `team_2_gross_scores` | none | required for a scored hole |
| Allocated strokes | Live Hole Scores/derived | stored `hole_scores.team_1_strokes`, `team_2_strokes` | none | required for a scored hole |
| Net scores/hole winner | Live Hole Scores | stored `hole_scores` net/winner columns | none | required for a scored hole |
| Hole revision/update/actor | Live Hole Scores | `hole_scores.hole_revision`, `updated_at`, `actor_id` | none | revision required; actor display optional |
| Scorecard navigation | full Google tournament model | canonical match ordering plus `game_center_presentations.match_sort_order` | presentation match number | optional to ScoreEntry; used by Game Center |

`Course ID`, tee, rating, slope, par, hole metadata, handicap configuration,
gross, strokes, net, and hole winner therefore never use Google during a
participant scorecard read. Presentation-only values are imported projections;
they are not scoring authority.

## Finalization boundary

Final submission is still the existing authenticated Supabase transaction. The
client supplies the currently displayed match revision and a stable finalization
idempotency key. Preflight and post-confirmation use the same Supabase scoring
view. Once the transaction commits, its returned FINAL state is applied before
the best-effort fresh Supabase read. A failed follow-up read cannot reverse a
committed participant success. Google mirror/archive jobs remain asynchronous.

## PWA and navigation boundary

The installed manifest starts at `/home`; the public `/` route is unchanged.
Tournament Hub metadata reuses the existing Supabase participant-session call
and never calls legacy `/api/live`. An unauthenticated `/home` launch routes to
`/participant-auth?next=/home` without sending an OTP automatically.
