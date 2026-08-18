# Step 4A — History Player / Career authority audit

Audit date: 2026-08-18. Source data was read only. No Google, Supabase, or bundled row was mutated.

## Authority boundary

| Surface | Authority | Population |
|---|---|---|
| Completed match results and points | Production Google History workbook | 2017–2025 frozen matches |
| Completed teams, finishes, rosters, captains, and Honors | Production Google History workbook | 2017–2025 frozen archive |
| Career scorecards | Production Round Scorecards and Course Holes | 2023–2025 recorded identities only |
| 2023/2024 Net and hole context | Frozen deterministic History projections | Existing canonical rows; no source mutation |
| Player identity | Existing Player ID / slug directory | Current directory first; archive only fills absent IDs |
| Current tournament | Existing bundled/current contract | 2026 only |

The prior Career Profile loader attempted the Preview workbook and then fell back as a unit to `historical-data.json`. That fallback contains stale 2019/2020 point totals and the pre-correction 2023 match boundary. Step 4A replaces only completed-year Career projection rows with the already-established production History archive and preserves current 2026 rows.

Supabase is not a Career Profile authority in this route. No new source, endpoint, dependency, or foreground request was added.

## Historical identity audit

| Evidence | Count |
|---|---:|
| Unique Player IDs in 2017–2025 rosters/standings | 38 |
| Exact Player ID resolutions | 38 |
| Unresolved | 0 |
| Fuzzy matches | 0 |

Roster populations are 16 (2017), 20 (2018), 20 (2019), and 24 in each year from 2020 through 2025. Frozen History can exclude a legitimate Ghost identity from a rendered leaderboard without changing the canonical Player ID resolution result.

## Point-era audit

| Year | Allocation available | Career treatment |
|---|---|---|
| 2017 | No | Not recorded (`—`) |
| 2018 | No | Not recorded (`—`) |
| 2019 | Yes | Canonical value, including recorded zero |
| 2020 | Yes | Canonical value, including recorded zero |
| 2021 | Yes | Canonical value, including recorded zero |
| 2022 | Yes | Canonical value, including recorded zero |
| 2023 | Yes | Corrected frozen value |
| 2024 | Yes | Canonical value, including recorded zero |
| 2025 | Yes | Canonical value, including recorded zero |

Recorded-zero proofs remain numeric: Brenan Cavanaugh (2023), Jupjee Kochar (2022), Miles Berger (2024), and Raymond Hill (2022). The UI audit confirmed Miles Berger's 2024 row remains `0.00`.

## Representative authority matrix — Holman Moores (HM01)

| Metric | Source / population | 2017–18 included? | Scorecard required? | Before | Canonical |
|---|---|---|---|---:|---:|
| Overall Record | Completed canonical match outcomes | Yes | No | 17-7-3 | 17-7-3 |
| Win Percentage | Existing ties-as-half contract | Yes | No | 68.5% | 68.5% |
| Career Points | Recorded allocations only | No point observations | No | 93.25 | 27.50 |
| Appearances | Participant-year roster | Yes | No | 10 | 10 |
| Championships | Canonical team finishes | Yes | No | 5 | 5 |
| Runner-Up Finishes | Canonical team finishes | Yes | No | 4 | 4 |
| Hole Differential | Reconciled hole evidence | No | Yes | +11 | +21 |
| Birdies | Individual gross-hole/par evidence | No | Yes | 8 | 16 |
| Eagles | Individual gross-hole/par evidence | No | Yes | 0 | 1 |
| Average Gross | Complete individual identities | No | Yes | 74.0 | 74.0 |
| Average Net | Complete canonical Net identities | No | Yes | 75.0 | 73.7 |
| Scoring sample | Complete/verified individual cards | No | Yes | 6 cards / 54 holes | 6 cards / 108 holes |

The scorecard count was already six; the stale 54-hole label counted only the subset whose legacy context exposed par. The frozen 2023/2024 course/tee projections prove all 108 holes without creating a score.

## Representative Tournament History parity

| Year | Team | Finish | W-L-T | Points | Avg Score | Included in Career Points |
|---|---|---|---|---:|---:|---|
| 2017 | Thongchai's Army | Runner-Up | 2-0-1 | — | — | No — unrecorded |
| 2018 | Hosung Choi's Sauce | Champion | 2-1-0 | — | — | No — unrecorded |
| 2019 | Jupjay Singh Squad | Champion | 2-1-0 | 4.50 | — | Yes |
| 2020 | Makin' It Wayne | Champion | 2-1-0 | 3.50 | — | Yes |
| 2021 | Dirty Mike and The Boys | Champion | 1-1-1 | 2.00 | — | Yes |
| 2022 | The Holymen | Champion | 1-1-1 | 4.25 | — | Yes |
| 2023 | DT Floppers | Runner-Up | 2-1-0 | 5.25 | 71.3 | Yes |
| 2024 | Queen's Mafia | Runner-Up | 3-0-0 | 5.50 | 70.3 | Yes |
| 2025 | The Crispy Boys | Runner-Up | 2-1-0 | 2.50 | 71.0 | Yes |
| 2026 | The Pickles | Upcoming | — | — | — | No |

Recorded point total: `27.50`. The unavailable 2017/2018 observations do not enter the sum and do not become synthetic zeroes.

## Scoring and match-play coverage

The production score archive contains zero Round Scorecard rows for 2017–2022 and 60 source rows in each of 2023, 2024, and 2025. For Holman Moores, six individual Best Ball/Singles identities supply 108 gross/par holes; three canonical scoring cards exist per format for Format Performance.

Canonical Scoring Profile: Average Gross 74.0, Average Net 73.7, 16 birdies, 1 eagle, Par 3 3.6, Par 4 4.1, Par 5 4.8, Front 36.8, Back 37.2.

Canonical Match Play Profile: 56 holes won, 35 lost, 71 halved, differential +21, largest lead 7, largest comeback 2, four consecutive holes won, Front 30-19-32, Back 26-16-39, Closing 8-5-14. Result-only 2017–2022 matches contribute to W/L/T but never to these hole metrics.

Format Performance retains the existing definitions:

| Format | W-L-T | Win % | Scoring metric | Match population | Scoring population |
|---|---|---:|---|---:|---:|
| Best Ball | 6-2-1 | 72.2% | Average Net 73.7 | 9 | 3 |
| Scramble | 5-2-2 | 66.7% | Team Average 64.7 | 9 | 3 |
| Singles | 6-3-0 | 66.7% | Average Gross 74.0 | 9 | 3 |

## Other Career features

- Captain Legacy reconciles unchanged: 1-1-0, one championship, two tournaments (2017 Thongchai's Army; 2022 The Holymen).
- Biggest Rival remains Miles Berger at 4-1-1. The prior `Points Won` field incorrectly rendered six matches; the recorded-era point value is 5.75.
- Top Partner W/L/T remains result-driven. Partner points now sum only recorded allocations and show `—` when no allocation exists.
- Career Honors and finish counts reconcile without change.
- Ranking definitions are unchanged. Holman's Career Points rank changes from #3 to #1 because the stale 2019/2020 fallback totals were removed from the entire canonical population, not because of a new formula.
- Records Held uses the same canonical Career scorecard evidence. The global Records product was not redesigned or rewritten.

## Corrected 2023 boundary

Production Match `2023-R3-7` is Sonny Stepp (SS01) vs Jason Powell (JP01), Team 1 winner, Front Team 1, Back Team 2, Overall Team 1, with exact 2–1 team points. Sonny's canonical 2023 Career row is 1-2-0 and 2.25 points. No stale halve enters Career Profile aggregates.

## Discrepancy classification

- A — presentation only: explicit History return context and completed-year row links.
- B — unavailable shown as zero: all 36 participant-year rows from 2017/2018; the same protection now covers Rival and Top Partner point surfaces.
- C/D — stale aggregate / incomplete population: bundled 2019/2020 points and incomplete canonical scoring context.
- F — legitimate evidence depth: 2017–2022 W/L/T without point or scorecard observations.
- G — substantive authority conflict: none.
