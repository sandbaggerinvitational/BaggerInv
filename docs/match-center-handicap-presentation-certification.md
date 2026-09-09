# Match Center handicap presentation certification

## Status and scope

Application-only correction, combined on release 72 at `a51dab2de096cd6576f027afb28324559f705217`.
Branch: `codex/match-center-handicap-after-release72`.
Original certified payload: `8e2fe3597a505d05cd9f0a1e5f5890f267bc637b`, originally based on release 71.
No migration, Production deployment, or tournament mutation. Exact-SHA release authorization is required next.

## Read-only Production audit — 2026-09-09

Production `/api/tournament/live`: HTTP 200, tournament 2026, Supabase source, foreground Google requests 0.
Current Setup revision is **14**, not the older revision-12 baseline. Current approved Handicap revision is **7**, UUID `a19f4f10-28f7-46a9-8434-159cd07cc4b6`.
All 24 matches are UPCOMING, scored holes and unresolved mutations are 0, and prepared Setup contexts are 0.
All six R1 and six R2 matches have four canonical participants. Read-only checks inspected their CH, PH, strokes, retained snapshot, and preparation state.

Before/after canonical participant fingerprint (MD5 of ordered JSONB rows, not a security primitive):
`31d0ef1bbb35d36855f6a624c32f8150` — unchanged.
The final check also confirmed zero disagreements between active membership `Tournament Handicap` projection, canonical tournament handicap, and current approved revision entries.

### Root-cause classification

**BB:** no reproduced formatter defect. Website and established PWA both render `player.playingHcp` through `formatHandicap` already. Integers display with one decimal. Tests pin this existing contract rather than changing the semantic field to Tournament Handicap.

**SC: C/D — retained display zeros and missing pre-start team presentation.**
Canonical SC participants correctly contain exact CH but individual PH/strokes are 0 (SC scores as a team). The unprepared legacy `:S1` snapshots contain empty participant configurations and only zero `team_1_strokes`/`team_2_strokes`, not calculated team playing handicaps. The retained `tournamentMatchDisplay` overlay supplies team PH 0 and strokes null, masking the missing calculated team context.

`production_control.future_handicap_match_context_v2` was invoked read-only for all twelve R1/R2 matches. Its R2 team results disagree with those display zeros, not with the scoring formula.

## PWA display contract / BB / plus / Singles

Sources: `app/PublicMatchCard.js`, `app/live/TournamentDashboard.js`, `app/game-center/GameCenter.js`, `lib/game-center-supabase.js`, `lib/formatters.js`.

- The player label consumes `playingHcp`, projected from canonical `playing_handicap` (subject to the existing retained presentation overlay).
- In the certified BB/SI context, that field is rounded full Course Handicap. It is **not** the player's received-stroke count and is **not** raw Tournament Handicap.
- `7 → 7.0`, `7.8 → 7.8`, `0 → 0.0`, `-0.8 → (0.8)`, missing → unavailable.
- BB final strokes use exact CH difference from the four-player minimum, times .90, rounded once. They do not subtract the rounded display values.
- SI final strokes use exact CH difference from the two-player minimum, rounded once.
- Neither BB nor SI requires a runtime formatting change. Regression proves byte-equivalent player/stroke output with the new Match Center option enabled.
- Native DTO source files and behavior are unchanged; no derived pre-start presentation enters the native scoring contract.

### R1 canonical audit

Values in each cell are `Player ID: playing handicap / received strokes`; displayed PH uses one decimal. Negative PH renders with parentheses.

| Match | Pickles | Lipp it and Rip it |
|---|---|---|
| R1-1 | JP01: 3 / 2; MH01: 7 / 6 | MS01: 1 / 0; JS01: 9 / 7 |
| R1-2 | DT01: 7 / 0; AM01: 13 / 6 | CP01: 10 / 3; JK01: 12 / 4 |
| R1-3 | HM01: 2 / 1; BA01: 9 / 7 | MM01: 1 / 0; NJ01: 9 / 7 |
| R1-4 | CL01: 9 / 0; BC01: 10 / 0 | CM01: 14 / 4; CS01: 17 / 6 |
| R1-5 | MS02: 2 / 2; JK02: 16 / 15 | RM01: -1 / 0; TL01: 15 / 14 |
| R1-6 | MB01: -1 / 0; CB01: 15 / 14 | WO01: 0 / 1; PN01: 5 / 5 |

R1 uses TPGC01 / Gold, rating 71.9, slope 136, par 72. Exact CH is `H × 136 / 113 - .1`. SI has the same display convention; this correction does not recalculate its strokes.

## Scramble inputs and results

CPGC01 / Black: rating 72.7, slope 138, par 72. Canonical 18-hole context is complete and agreeing. Retained snapshot canonical hash:
`148124f1e7156b57ef0273e02e069bf8f57e2d2d523361bb18e3a82e3e6afe8e`.

Ordered par: `4,3,5,4,4,3,4,4,5,4,5,3,4,3,5,4,4,4`.
Ordered Stroke Index: `13,11,17,1,5,9,7,15,3,4,18,8,10,16,14,6,12,2`.
Yardage, par, and SI are retained in the certification fixture; no course fact was changed.

Exact CH = `H × 138 / 113 + .7`.
Team PH = PostgreSQL-compatible `round(.35 × lower exact CH + .15 × higher exact CH)`.
Team strokes = rounded team PH minus the lower rounded team PH in that match.
No pre-rounding of individual CH. Signed team PH is supported; relative match strokes stay nonnegative.

Each input below is `Player ID (approved Tournament Handicap → CH)`; CH is abbreviated here for readability, never rounded before calculation.

| Match | Pickles inputs | Lippit inputs | Team PH P/L | Strokes P/L |
|---|---|---|---|---|
| R2-1 | CL01 (7.9 → 10.347788), AM01 (10.8 → 13.889381) | WO01 (.4 → 1.188496), CM01 (11.6 → 14.866372) | 6.0 / 3.0 | 3 / 0 |
| R2-2 | MS02 (1.6 → 2.653982), MH01 (6.1 → 8.149558) | PN01 (4.2 → 5.829204), JS01 (7.5 → 9.859292) | 2.0 / 4.0 | 0 / 2 |
| R2-3 | HM01 (1.5 → 2.531858), CB01 (12.2 → 15.599115) | RM01 (-.7 → -.154867), CS01 (13.8 → 17.553097) | 3.0 / 3.0 | 0 / 0 |
| R2-4 | JP01 (2.8 → 4.119469), DT01 (5.7 → 7.661062) | MS01 (.7 → 1.554867), NJ01 (7.8 → 10.225664) | 3.0 / 2.0 | 1 / 0 |
| R2-5 | MB01 (-.8 → -.276991), BA01 (7.9 → 10.347788) | MM01 (1 → 1.921239), JK01 (9.8 → 12.668142) | 1.0 / 3.0 | 0 / 2 |
| R2-6 | BC01 (8 → 10.469912), JK02 (13 → 16.576106) | CP01 (8.5 → 11.080531), TL01 (12.4 → 15.843363) | 6.0 / 6.0 | 0 / 0 |

This table covers all 24 active Players and their approved handicaps. SC receives team strokes; individual player zero strokes are not summed or used as team PH.

## Correction / pre-start boundary

`lib/match-center-handicap-presentation.js` is enabled only by the website/PWA `/api/tournament/live` route. Other adapter callers and `mobileContract` remain unchanged.

1. A complete matching frozen participant/team configuration supplies frozen values, including after play starts. Current approved values never replace that snapshot.
2. Only a strictly UPCOMING, scoreless, unlocked, resultless, uncompleted match without frozen handicap context may derive pre-start display values.
3. Require exact snapshot identity, four unique participants with side/slot correctness, active roster and stable Team-ID agreement, complete approved handicap coverage, current membership/participant HI agreement, and persisted CH agreement.
4. Reuse the existing advisory course validator: complete 18-hole SI/par context, valid tee inputs, and no conflicting same-round/course/tee definitions. Empty/partial local holes are unavailable for this presentation.
5. Reuse `courseHandicap` and `playingHandicaps` from the previously certified `prediction-engine.js`. No new formula implementation.
6. Replace stale SC display fields only. Incomplete data becomes null/unavailable, never fabricated 0.0. Positive received strokes render using the existing badge; zero badges stay omitted.

The pure projection returns `PRESTART_READ_ONLY`, `SCORING_SNAPSHOT`, or `UNAVAILABLE`. It writes nothing, makes no per-player/team database calls, and does not invoke preparation, pairing, approval, or scoring RPCs. Course validation is one bounded pass and roster lookups use a map.

Scoring authorities are unchanged: migration 058 `handicap_v1_match_context`, migration 066 `future_handicap_match_context_v2`, existing hole allocator and net-scoring paths. PostgreSQL remains authoritative. This is ephemeral server-side presentation, not a scoring snapshot or authority.

## Original tests / responsive acceptance

- 137 focused/regression application tests passed: six new presentation tests, six Production-shaped SC pairings, missing/conflicting inputs, negative/zero teams, frozen context, BB/SI field preservation, formats, Game Center, History, handicap management, prediction parity, War Room/Step14D, Odds, Net Skins, Calcutta, and mobile DTO isolation.
- Six native scoring-contract tests passed with the required `--conditions=react-server` runtime condition.
- PostgreSQL handicap parity passed, including the **unmodified actual canonical function extracted from migration 058**, installed in disposable tables and called for all six SC pairings. Existing BB/SI rounding/boundary tests remain intact.
- Three existing Tournament Setup PostgreSQL integration tests passed serially, including pairing and course adoption safeguards.
- Dedicated public/PWA boundary suite: 15 passed.
- Additional navigation/scoring suite: 31 passed, one pre-existing source-pattern failure (`navigation-ia-polish.test.mjs`, “Leaderboards owns exactly Players, Teams, Net Skins, and Insights”, expects `LEADERBOARD_MODULES.map`). The failing test and all three source files it reads are unchanged by this patch. No unrelated repair was attempted.
- Real `PublicMatchCard` browser fixture with actual CSS: 390, 430, 820, 1280, 1440 passed. All twelve SC team labels, positive badges, absent zero badges, BB positive/zero/plus/decimal labels, SI, contained labels, zero document overflow, and unchanged card heights checked. 390/1280 screenshots visually inspected. Logos use existing fallback rendering in the isolated fixture; no asset/presentation styling changed.
- Production build and `git diff --check` passed.

The first local PG startup encountered exhausted shared-memory IDs, not an assertion failure. One verified unattached local test segment was removed; the complete test then passed. No Production database resource was changed. Browser certification used a disposable local Chromium installation. No required assertion was removed or weakened.

## Release boundary / data impact

No SQL migration. No changes to handicap math, hole allocation, net score, Nassau points, native DTOs, official snapshots, course facts, pairings, Guide, Awards, Odds, Net Skins or Calcutta.
Production mutations: **0**. The live SC display remains on the old implementation until separate exact-SHA release approval.
Preserve unrelated untracked `docs/2026-tournament-guide-entry-playbook-audit.md` and `launch-video/`.

## Release-72 combined-lineage certification

The release preflight found that Production had advanced to release 72,
`a51dab2de096cd6576f027afb28324559f705217`, deployment
`dpl_CjisMissh18BJbyait6KHur2asLk`. No release was attempted against the older
lineage. The owner separately authorized preparation, certification, and push
of this new combination, with deployment still requiring exact-SHA approval.

The certified Match Center payload applies cleanly on release 72. All runtime
files are byte-for-byte identical to the original Match Center commit. All
release-72 migration sources, including `202609090097_production_late_r3_initialization_v1.sql`,
and the release-72 test/fixture/report files remain byte-for-byte unchanged.
Native Auth/mobile compatibility, Today caching, Round Pairing Workspace, and
the release-71 read-envelope correction remain in the ancestry and source tree.

Only two certification files differ from the original Match Center payload:
this report and `test/pn4-production-reconciliation.test.mjs`. That test formerly
applied release 71's closed file allowlist to every future HEAD. It now retains
the complete historical release-71 assertions against the immutable release-71
SHA and adds a current full-tree blob check against release 72 plus the exact
certified nine-file Match Center payload. Only this test and report are allowed
certification differences; no runtime exception is permitted. All PN-4 behavioral
and fail-closed native checks are retained unchanged.

Final combined results:

- Application/regression suite: **210 passed**, covering Match Center, BB/SC/SI,
  handicap management/Hybrid, scoring, Setup/round workspace/read envelope,
  War Room/Step14D, History, Odds, Net Skins, Calcutta, and public/PWA boundaries.
- Native/Auth/Today suite: **93 passed**, including full-tree lineage, exact
  mobile/default projection parity, Auth, capability gates, Today cache revisions,
  Guide reconciliation, and native scoring contracts.
- Serial disposable PostgreSQL suite: **31 passed**, including release 72's
  real migration 097 lifecycle/financial compatibility and migration 095/096
  pairing/reader behavior, plus canonical handicap parity for all six Scrambles.
- Browser suite: **2 passed**, testing real Match Center and Round Pairing
  Workspace controls at 390, 430, 820, 1280, and 1440px.
- Production build: **passed**. `git diff --check`: **passed**.

These are the selected combined certification suites, not a claim that every
historical repository test passes. The unrelated Leaderboards source-pattern
failure documented in the original audit was not changed.

No Production query or mutation was required during combination/certification.
No migration was applied, no environment variable accessed or changed, and no
deployment/rebind was performed. Production mutation count for this step: **0**.
