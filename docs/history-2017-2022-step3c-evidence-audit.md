# Step 3C — 2017–2022 canonical evidence audit

Audit date: 2026-08-18. This is a read-only migration record, not a runtime data source.

## Source boundary

- The configured Preview workbook does not expose the ten legacy History tabs. The pre-Step-3C route therefore fell back as one unit to `lib/historical-data.json`.
- The repository's already-established production historical workbook exposes all ten History tabs and remains the authority used by the production Round Scorecards and Course Holes loaders.
- Step 3C reads 2017–2022 tournament facts, results, points, identities, teams, courses, rosters, standings inputs, and Honors from that existing production workbook. Supabase is not part of this boundary.
- The production `Round Scorecards` sheet contains 180 rows in total and zero rows for every year from 2017 through 2022. No scorecard, Net, Hole Winner, progression, Round Statistic, or scoring-derived Tournament Record is therefore supported for these years.
- Because no 2017–2022 scoring identity has a hole row, Course ID / tee / par / stroke-index resolution is not activated. Course Holes cannot create a scorecard identity that the source does not contain.

## Evidence matrix

| Year | Matches | Results | Complete point allocations | Scorecard matches | Recorded identities | Hole data | Net possible | Progression possible | Stats | Records | Honors |
|---|---:|---:|---:|---:|---:|---|---|---|---|---|---:|
| 2017 | 16 | 16 | 0 | 0 | 0 | No | No | No | None | None | 0 |
| 2018 | 20 | 20 | 0 | 0 | 0 | No | No | No | None | None | 1 |
| 2019 | 20 | 20 | 20 | 0 | 0 | No | No | No | None | None | 1 |
| 2020 | 24 | 24 | 24 | 0 | 0 | No | No | No | None | None | 1 |
| 2021 | 24 | 24 | 24 | 0 | 0 | No | No | No | None | None | 1 |
| 2022 | 24 | 24 | 24 | 0 | 0 | No | No | No | None | None | 1 |

All six years are `RESULT-ONLY`. The label describes evidence depth, not presentation quality. 2017 and 2018 have authoritative winners for every match but no canonical match-point allocations or numeric Tournament Final.

## Tournament reconciliation

| Year | Production stored Final | Match-derived Final | Point coverage | Reconciles |
|---|---|---|---:|---|
| 2017 | Not recorded | Unsupported | 0/16 | Not applicable |
| 2018 | Not recorded | Unsupported | 0/20 | Not applicable |
| 2019 | 37–28 | 37–28 | 20/20 | Yes |
| 2020 | 47–31 | 47–31 | 24/24 | Yes |
| 2021 | 46–32 | 46–32 | 24/24 | Yes |
| 2022 | 44.5–33.5 | 44.5–33.5 | 24/24 | Yes |

The bundled fallback is materially stale for two years:

- 2019: fallback stored Final `228.5–170.5`; fallback match rows sum `237–183`. Production canonical rows store and sum exactly `37–28`, and correct the winning team identity from `Vijay's Singh Squad` / `VJSINGH` to `Jupjay Singh Squad` / `JJSINGH`.
- 2020: fallback stored Final and match sum `583–377`. Production canonical rows store and sum exactly `47–31`.

This is classified as `C — stale fallback`. Step 3C fails closed if the production historical workbook is unavailable; it does not revive those stale totals. Exact half points are retained for 2020–2022.

## Year facts

| Year | Edition | Destination | Dates | Champion | Runner-up | Teams / roster | Rounds | Honors |
|---|---|---|---|---|---|---|---:|---|
| 2017 | 1st | Scottsdale | Aug 11–12 | Team Hornitos | Thongchai's Army | 8 / 8 | 3 | None recorded |
| 2018 | 2nd | Horseshoe Bay | Jul 27–28 | Hosung Choi's Sauce | Phil's Mafia | 10 / 10 | 3 | Chris Seekely — Sandbagger of the Year |
| 2019 | 3rd | Beaver Creek | Aug 2–3 | Jupjay Singh Squad | Phil's Calvity Bombs | 10 / 10 | 3 | Tim Gregg — Sandbagger of the Year |
| 2020 | 4th | Traverse City | Aug 21–22 | Makin' It Wayne | Bryson's Beefcakes | 12 / 12 | 3 | Brian Atkinson — Sandbagger of the Year |
| 2021 | 5th | Big Cedar Lodge | Aug 20–21 | Dirty Mike and The Boys | Nasty Perros | 12 / 12 | 3 | Cameron O'Reilly — Sandbagger of the Year |
| 2022 | 6th | Pinehurst | Aug 19–20 | The Holymen | Numba 1 Stunnas | 12 / 12 | 3 | Michael Hunnicutt — Sandbagger of the Year |

Every year has three canonical rounds and the year-specific format order is preserved. 2018 is the exception to the later BB → SC → SI order: Singles is Round 1, Scramble Round 2, and Best Ball Round 3.

## Migration decision

- No critical champion, winner, point, Round-result, Tournament-Final, or standings-authority conflict requires user input.
- Final match lifecycle is supported by official result evidence for 128/128 matches.
- Match cards show participant-aware results and team points only where points exist.
- Scorecards, Match Intelligence, Round Statistics, and Tournament Records are omitted for all six years because their canonical populations are empty.
- 2017 Honors is omitted because no canonical award exists. The five recorded Honors from 2018–2022 remain source-backed.
- No discrepancy was found between `docs/history-2017-2022-migration-contract.md` and the frozen 2023–2025 runtime contract that affects this evidence depth.
