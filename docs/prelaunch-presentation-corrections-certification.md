# Pre-launch presentation corrections — release 93 candidate

## Baseline / safety

Read-only Production inspection on 2026-09-11 found release 93 at
`458db66f9f849edf9aba983b81885f35aa0bf79d`, Setup 25, approved Handicap 7.
Owner-published Guide 11 (`0a6ae382-de39-429e-b3d7-3390f0a6f536`) is the new
baseline. Its public fingerprint is
`97e44d987b8d5c5bef9632a9d2283d7e38ede56a2bf18ed831cbae2f678191b5`.
Both shuttle entries are 843-768-2900; Mulligans/ADMINISTRATION are corrected;
four Golf Genius references remain. No Guide code/content is edited here.
The retained Odds snapshot database hash remains
`68c40e08cc4b7f5a2babd18e0f0367c6` (MD5 of ordered snapshot JSON, audit-only).
Published Odds projection remains 54.052% / 45.948%, displayed 54.1% / 45.9%,
American odds -118 / +118, expected points 36.58 / 35.42, 24 players.

No Production mutation, migration, scoring preparation, capability change,
environment change, deployment, calculation or publication was performed.

## Scramble root cause

The immutable Setup audit records:

| UTC time, 2026-09-09 | Operation | Setup revision |
|---|---|---|
| 06:02:27 | R2 Save All, six matches | 13 → 14 |
| 19:06:27 | Clear R2-1 | 21 → 22 |
| 19:06:49 | Clear R2-4 | 22 → 23 |
| 19:07:49 | Save All replacing R2-1/R2-4, snapshotPrepared=false | 23 → 24 |

The released empty-pairing operation deletes per-match holes when clearing
pairings (migration 083). Repopulating participants computes their handicap
facts but does not prepare scoring holes. These two empty hole sets are a valid
pre-start state, not a reason to create scoring state during this task.

The presentation adapter unnecessarily required both a complete shared course
projection and 18 local match holes. It now validates the existing shared
round/course/tee projection's 18 holes. That projection still rejects partial,
invalid, conflicting and incomplete definitions. All existing unstarted,
snapshot identity, roster/team, approved handicap and Course Handicap agreement
checks remain. Prepared contexts retain their existing authority path. No
scoring consumer or formula changes.

Current authority differs from the older expected table: the R2-1 and R2-4
pairings were exchanged. The following values are independently derived from
the current approved inputs, not forced from the old table:

| Match | Pickles players | Lippit players | Team HCP | Strokes |
|---|---|---|---|---|
| R2-1 | Jason Powell / David Tatum | Memo Saldana / Nick Julian | 3.0 / 2.0 | 1 / 0 |
| R2-2 | Matthew Smith / Michael Hunnicutt | Patrick Noonan / Jack Samis | 2.0 / 4.0 | 0 / 2 |
| R2-3 | Holman Moores / Clay Beltran | Robert Murphy / Chris Seekely | 3.0 / 3.0 | 0 / 0 |
| R2-4 | Caleb Lewis / Alex Monteleone | Will Oliver / Chris Micheal | 6.0 / 3.0 | 3 / 0 |
| R2-5 | Miles Berger / Brian Atkinson | Max Markley / Jupjee Kochar | 1.0 / 3.0 | 0 / 2 |
| R2-6 | Brenan Cavanaugh / Jack Keffler | Chase Patterson / Taylor Lippincott | 6.0 / 6.0 | 0 / 0 |

Positive stroke badges render; zero badges remain absent. Input objects are
asserted unchanged. Empty target holes remain empty after projection.

## Complete portrait audit

All requested paths below have prefix `https://baggerinv.com/images/players/`.
Source: retained Player `Photo Filename` presentation mapping, matching the
public failed request. Current primary `players.source_payload` has no
`Photo Filename` value for these IDs. Repository-wide asset inspection found
no alternative canonical image for any of the 14. All classify **C — no
canonical portrait**, and now render the existing initials fallback directly.
No replacement/placeholder images or player-data edits were made.

| Player ID | Player | Requested filename | Retained mapping |
|---|---|---|---|
| CM01 | Chris Micheal | chris-micheal-pic.webp | chris-micheal-pic |
| JK02 | Jack Keffler | jack-keffler-pic.webp | jack-keffler-pic |
| PN01 | Patrick Noonan | patrick-noonan-pic.webp | patrick-noonan-pic |
| BJ01 | Blake Jumonville | blake-jumonville-pic.webp | blake-jumonville-pic |
| CO02 | Cameron O'Reilly | cameron-oreilly-pic.webp | cameron-o'reilly-pic |
| CF01 | Conor Freeman | conor-freeman-pic.webp | conor-freeman-pic |
| JS02 | Jack Stickney | jack-stickney-pic.webp | jack-stickney-pic |
| JG01 | John Geibel | john-geibel-pic.webp | john-geibel-pic |
| KW01 | Kelly Whaley | kelly-whaley-pic.webp | kelly-whaley-pic |
| MO01 | Michael O'Brien | michael-obrien-pic.webp | michael-o'brien-pic |
| PC01 | Phillip Curry | phillip-curry-pic.webp | phillip-curry-pic |
| SL01 | Stephen Levy | stephen-levy-pic.webp | stephen-levy-pic |
| TG01 | Tim Gregg | tim-gregg-pic.webp | tim-gregg-pic |
| WD01 | William Dace | william-dace-pic.webp | william-dace-pic |

The browser-safe bundled inventory is checked exactly against all 27 committed
portraits. Future optional filenames return null until their canonical asset
is registered; adding/removing an asset without updating the inventory fails
the test. Explicit canonical HTTPS assets remain supported. PlayerAvatar also
normalizes explicit bundled `src` paths so Draft cards cannot bypass the check.
No Draft authority/fingerprint logic changes.

Before: 14 doomed URLs. Candidate: zero doomed portrait requests in the local
render/sweep, all 14 fallbacks and valid portrait loading certified. This is
not a claim that unchanged Production has already been fixed.
Re-resolving all 153 previously requested asset URLs (including optimized-image
source URLs) against the candidate yields 14 direct fallbacks, 139 existing
bundled targets, and zero missing targets.

## Odds hydration

The public timeline used host-default `toLocaleDateString()`. For the immutable
timestamp `2026-09-11T01:53:28.308+00:00`, UTC server text and Chicago browser
text differ. All three public publication-date labels now use explicit en-US,
America/New_York (current tournament authority). The visible date remains
9/10/2026. Timestamp, publication identity, snapshots, math and history remain
unchanged. UTC SSR → Chicago browser hydration passes without page errors;
UTC/Chicago/New York/Tokyo formatter parity also passes.

## Performance: P3 retained

Read-only compressed transfer samples (not a benchmark): Home 9,817 B / 1.24 s;
Tournament 12,659 B / 0.71 s; Match Center shell 6,113 B / 0.31 s; Odds
10,046 B / 0.63 s; Guide 16,332 B / 0.67 s; War Room 108,418 B / 1.74 s.
The larger analytics HTML includes extensive serialized analytics presentation
data. No evidence here warrants a broad performance change. Shell timings do
not measure complete interactive readiness or every follow-up data request.

## Certification

- 116 application/contract regressions pass: Match Center, BB decimals,
  portraits/assets, Odds, mobile Guide isolation, History, navigation,
  Leaderboards and public/Director boundaries.
- 12 serial PostgreSQL/native/scoring checks pass, including disposable
  PostgreSQL numeric parity and default-off native boundary tests.
- New isolated SSR/browser test passes all 390/430/820/1280/1440 widths:
  six Scrambles, 14 absent portraits plus valid Holman portrait, actual Odds
  and current published Guide components. No overflow, asset 404s, mutation
  transports or hydration/runtime errors. Real profile fallback CSS used.
- Two existing responsive browser suites pass: Match Center and original
  team-logo/time polish (including no image-load layout shift).
- Actual 390px and 430px screenshots inspected. Browser evidence is under
  `/tmp/bagger-prelaunch-browser-27Q6jQ`; tests can regenerate it.
- Production build and git diff --check pass.

Local harness corrections: existing Chromium cache selected after default
cache was unavailable; established browser process shim supplied; real profile
fallback CSS used instead of an unstyled fixture wrapper. No application
assertion was skipped. Initial test-harness failures were not Production faults.

## Release boundary

One focused application/test/documentation candidate. No migration. All
scoring SQL, official handicap/prediction engines, native code, Guide code,
release/auth/cache infrastructure and tournament-data authority remain untouched.
Do not deploy this candidate without separate exact-SHA authorization.
