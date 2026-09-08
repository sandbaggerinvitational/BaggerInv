# Matchup Lab ancillary acceptance — local release candidate

## Read-only Production reproduction

Base release: `c0d8267b5803e20348a2de0e1ebe22e1304e0b2f`, advisory engine `prediction-engine.js:team-symmetry-v3`.

Observed at `/war-room?format=BB&course=TPGC01&tee=Gold&p1=CL01&p2=HM01&p3=JK01&p4=MM01`:

- Caleb Lewis / Holman Moores versus Jupjee Kochar / Max Markley; Best Ball; Turtle Point / Gold.
- Match Intelligence remains 50% / 11% halve / 39%; course fit unavailable.
- Recorded Scoring Intelligence displays `NaN worse` for all four unavailable course-fit cards and an incomplete round-count suffix.
- Simulation button disabled with “A complete 18-hole scorecard is required for simulation,” despite a contradictory “Ready for 10,000 outcomes” heading.
- Certified input baseline: approved handicap revision 7, Prediction Settings revision 2, Setup revision 3; no official pairings or prepared contexts; 24 UPCOMING matches.

Signed-in SQL inspection used only `BEGIN READ ONLY`, SELECT, and ROLLBACK. It compared active match holes with Setup course holes on course ID, tee and hole number, including par, stroke index and yardage:

| Current records | Active holes | Setup holes | Differing active/Setup hole rows |
| --- | ---: | ---: | ---: |
| 2026-R1-1, TPGC01 / Gold | 0 | 18 | No active rows to compare |
| Other five R1 matches, TPGC01 / Gold | 18 each | 18 | 0 |
| Six R2 matches, CPGC01 / Black | 18 each | 18 | 0 |
| Twelve R3 matches, OCGC01 / Gold | 18 each | 18 | 0 |

Metadata agrees: R1 71.9 / 136 / 72; R2 72.7 / 138 / 72; R3 74.7 / 150 / 72 (rating / slope / par). No data or release-control mutation was performed.

## Root causes and correction

`buildCourseFit` returned an early unavailable object without `versusRecordedField`. `CourseFitCard` tested only `!== null`, so undefined reached `Math.abs(...).toFixed(2)`. The model now emits explicit null fields and the presentation helper accepts only finite comparisons. Zero displays `0.00 even`; unavailable evidence is not converted to zero. Missing round counts are omitted. Rendered JSX tests cover absent, partial and invalid evidence.

Simulation classification: **D — MISSING ADVISORY DERIVATION**.

`currentCourseRows` in the shared prediction bundle keeps the first match for each course/tee. R1-1 has no active holes; later complete, agreeing contexts do not populate that selected row. `holesForTee` therefore supplies no complete current projection, and WarRoom's old `holes.length !== 18` button guard disables simulation.

`simulateMatch` is pure browser advisory calculation: it consumes probabilities, format/points, and two ordered 18-hole effective stroke maps. Per-hole ordering and stroke index are needed for front/back and match-closing distributions; aggregate handicap cannot express that distribution. Par validates the complete course definition; yardage is retained for equality checks, not simulation mathematics. No server preparation API is involved.

The Supabase War Room adapter now derives three small, ephemeral course projections from the **same existing canonical read**. There are no extra RPCs. It validates exact tournament/year/round/course/tee, metadata, ordered holes 1–18, a unique stroke-index permutation, and total par. An empty strictly UPCOMING record without score/lock/completion/result/points/finalization evidence cannot mask complete agreeing records. Started empty records, partial definitions, malformed definitions and genuine conflicts remain unavailable/fail-closed. An explicitly missing Supabase projection never falls back to historical Google-compatible holes.

Only Matchup Lab simulation consumes the additional advisory holes. The shared bundle, prediction inputs, optimizer, Match Intelligence, Team Intelligence and Odds calculations are unchanged. The simulator mathematics remain unchanged; an advisory wrapper canonicalizes physical team identity for deterministic sampling and remaps results to the selected display perspective. BB/SC/SI exact team-swap tests cover expected points, segment probabilities, labels and volatility. Singles uses its existing configured points input.

## Authority and release boundary

- Advisory Analytics only: no persisted projection, participant, pairing, scoring snapshot, score, scoring access or lifecycle mutation.
- Current approved handicap remains the existing upstream input. No handicap formula or SQL changes.
- No Championship Odds, Net Skins, Calcutta, Guide, Awards, Setup or native iOS changes.
- No migration. No Production deployment/rebind in this task. Live corrected-page acceptance requires separately authorized exact-SHA release.
- Unrelated local Guide audit and `launch-video/` files are excluded from the commit.

## Local certification

- Combined focused/application regression run: **125 passed, 0 failed, 0 skipped**.
- New presentation/derivation/simulation acceptance tests, including actual CourseFitCard JSX rendering and fail-closed context tests.
- Captured revision-7/settings-2 optimizer ordering: Pickles CB01/HM01, CL01/HM01, BA01/MB01; Lippit JK01/RM01, MS01/TL01, JK01/MM01.
- Full V3 side-swap universe: 4,356 BB, 4,356 SC, 144 SI matchups; zero mismatches.
- Existing War Room source/calculation parity, Match Intelligence, Team Intelligence and Step 14D performance tests.
- Existing format/handicap, simulator, recorded scoring, Odds, Net Skins, Calcutta V2, public/PWA and native scoring tests.
- Disposable local PostgreSQL handicap parity run serially outside the sandbox: 1 passed, no skips.
- Production build passed; existing unrelated CSS/autoprefixer warnings remain. `git diff --check` passed.

Production mutations: **0**. Stop for exact-SHA release authorization.
