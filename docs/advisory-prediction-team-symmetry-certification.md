# Advisory prediction team-symmetry correction — local certification

## ADVISORY PREDICTION ENGINE FIX STATUS

Implemented locally on `codex/advisory-prediction-team-symmetry`. Application/build and exhaustive symmetry certification pass. **PostgreSQL integration rerun is environment-blocked** (details below). No deployment, migration, Production query or mutation was performed in this implementation turn. Exact-SHA release authorization is required after commit/push. Do not treat this report as a completed Production release.

## ROOT CAUSE

In `lib/prediction-engine.js:predict`, the category-weighted scalar used Team A's absolute partnership score while Team B's partnership score was display-only. The decisive-probability calculation began at 50 rather than half the non-tie pool; Team B received the residual after subtracting ties. The reviewed old neutral result was 50/14/36, and all 4,356 captured BB matchups failed team-swap invariance.

Optimizer counter enumeration, classification and ranking were correct and are not modified.

## PARTNERSHIP SYMMETRY CORRECTION

Let VA/VB be the existing absolute partnership scores (same-format 65% plus overall 35% when both exist; unchanged unknown baseline 50).

- Relative A = 50 + (VA − VB) / 2.
- Relative B = 100 − Relative A.

This bounded centered difference retains the existing 0–100 component scale, keeps equal strengths neutral, and negates exactly on a side swap. It avoids amplifying small differences near zero through a ratio. The approved category weight remains 28, and no Prediction Settings values change. Absolute evidence remains available in `teamVibes`; weighted components/contributions now describe the actual relative signal used.

## TIE-PROBABILITY CORRECTION

Existing tie curve is retained: T = clamp(14 − abs(rawA − 50) × 0.35, 6, 18).

Set C = (100 − T) / 2 and E = (rawA − 50) × (100 − T) / 100 + existing underlying-skill adjustment. A = C + E; B = C − E. Both teams' min/max caps are enforced symmetrically by limiting abs(E) to min(C − minimum, maximum − C, C), with a nonnegative radius. Existing admissible settings are unchanged.

For final whole-percentage display, each decisive probability is stabilized to 10 decimal places before rounding. The displayed tie remains 100 − roundedA − roundedB, preserving the existing integer output contract and total 100. Thus displayed tie may differ by one point from the unrounded curve; it never depends on which team is A.

Neutral BB, SC and SI now return **43 / 14 / 43**. The identified Caleb Lewis + Holman Moores versus Jupjee Kochar + Max Markley fixture returns **50 / 11 / 39**, expected points **1.665**; reversed inputs return **39 / 11 / 50**, EP **1.335**.

## TEAM-SWAP INVARIANTS

Whole-percentage W/H/L outputs: exact equality, tolerance **0**. Unrounded raw scores, category impacts, capped decisive pool and expected-point complement: tolerance **1e-9 percentage points** (or points for the EP assertion). EP(A) + EP(B) = 3 under the existing optimizer convention.

Tests cover all formats, neutral and unequal inputs, asymmetric partnership histories, opponent-only history changes, strong A/B, plus handicaps, probability caps, half-percentage boundaries, within-team ordering and deterministic repeated evaluation.

## FULL 4,356-MATCHUP CERTIFICATION

Fixture: read-only Production capture **2026-09-08T14:10:12.831Z**, release source `bffd4a621c2d8bca88153c7bb6c6f2206ce8e62d`, approved handicap revision **7**, UUID `a19f4f10-28f7-46a9-8434-159cd07cc4b6`, Prediction Settings **2**. BB context: Turtle Point / Gold, 71.9 / 136 / 72.

The committed fixture retains only prediction-relevant roster/statistical inputs. No GHIN identity, observation or credential is included. Its trimmed inputs reproduced the complete captured read model's new outputs exactly in **8,856** comparisons.

- BB: 66 pairs per team, 66 counters each, 4,356 fixtures plus reversed evaluation; **0 mismatches**.
- SC: same captured golfers/course for format-isolation coverage, 4,356 fixtures plus reversed evaluation; **0 mismatches**. Not claimed as a live Round 2 course projection.
- SI: same captured course, 144 fixtures plus reversed evaluation; **0 mismatches**.
- Independently computed all candidate aggregates and compared against optimizer outputs in both team-input orders.
- W/H/L, favorable/dangerous counts, EP, worst case, upside, volatility and full counter coverage agree.

Tests: `test/advisory-prediction-symmetry.test.mjs`; reusable enumeration: `test/helpers/advisory-symmetry-certification.mjs`; captured fixture: `test/fixtures/advisory-symmetry-2026.json`.

## CORRECTED PICKLES OPTIMIZER RESULTS

Default Best Overall ordering: rounded average EP, then average win probability; original roster order breaks genuine remaining ties. Each row uses all 66 counters. Favorable remains W > L. Dangerous remains W < 40 OR L − W >= 10. Worst W and worst EP are independent minima, as in the installed optimizer. Upside is maximum win probability; volatility is population standard deviation of win percentages.

| Rank | Pair | Favorable / 66 | Dangerous | Avg EP | Avg W/H/L % | Worst W / EP | Upside W | Volatility |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: |
| 1 | Clay Beltran + Holman Moores | 66 | 0 | 1.85 | 56.8 / 9.7 / 33.5 | 47% / 1.59 | 72% | 4.6 |
| 2 | Caleb Lewis + Holman Moores | 66 | 0 | 1.84 | 56.5 / 9.9 / 33.6 | 46% / 1.56 | 72% | 4.3 |
| 3 | Brian Atkinson + Miles Berger | 66 | 0 | 1.81 | 55.0 / 10.9 / 34.2 | 45% / 1.56 | 74% | 5.0 |
| 4 | Clay Beltran + Miles Berger | 66 | 0 | 1.80 | 54.7 / 10.8 / 34.5 | 44% / 1.53 | 71% | 4.7 |
| 5 | Clay Beltran + Michael Hunnicutt | 66 | 0 | 1.78 | 54.6 / 9.7 / 35.7 | 46% / 1.56 | 71% | 4.6 |
| 6 | Caleb Lewis + Michael Hunnicutt | 66 | 0 | 1.75 | 53.0 / 10.3 / 36.6 | 44% / 1.51 | 70% | 4.6 |
| 7 | Brian Atkinson + Matthew Smith | 64 | 0 | 1.69 | 50.6 / 11.8 / 37.6 | 42% / 1.47 | 67% | 4.6 |
| 8 | Holman Moores + Miles Berger | 62 | 0 | 1.65 | 48.4 / 13.0 / 38.6 | 40% / 1.38 | 63% | 4.0 |
| 9 | Caleb Lewis + Miles Berger | 61 | 0 | 1.64 | 48.4 / 12.7 / 38.8 | 40% / 1.38 | 65% | 4.3 |
| 10 | Holman Moores + Michael Hunnicutt | 61 | 0 | 1.64 | 48.3 / 12.6 / 39.1 | 41% / 1.43 | 63% | 4.0 |

Five worst counters for **Clay Beltran + Holman Moores**, ordered by ascending EP, then W, then stable opponent IDs:

| Counter | W/H/L % (Pickles perspective) | EP |
| --- | --- | ---: |
| Jupjee Kochar + Robert Murphy | 47 / 12 / 41 | 1.590 |
| Memo Saldana + Taylor Lippincott | 48 / 12 / 40 | 1.620 |
| Jupjee Kochar + Max Markley | 49 / 12 / 39 | 1.650 |
| Jupjee Kochar + Taylor Lippincott | 49 / 14 / 37 | 1.680 |
| Max Markley + Taylor Lippincott | 51 / 11 / 38 | 1.695 |

The top six still legitimately classify 66/66 favorable and zero dangerous under the corrected model. This is independently verified, not a hardcoded count. Symmetry certification establishes perspective correctness, **not empirical probability calibration or guaranteed competitive outcomes**.

## CORRECTED LIPP IT AND RIP IT RESULTS

| Rank | Pair | Favorable / 66 | Dangerous | Avg EP | Avg W/H/L % | Worst W / EP | Upside W | Volatility |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: |
| 1 | Jupjee Kochar + Robert Murphy | 60 | 1 | 1.74 | 52.2 / 11.5 / 36.4 | 39% / 1.36 | 63% | 5.7 |
| 2 | Memo Saldana + Taylor Lippincott | 60 | 1 | 1.73 | 52.0 / 11.3 / 36.7 | 39% / 1.35 | 68% | 5.9 |
| 3 | Jupjee Kochar + Max Markley | 56 | 4 | 1.64 | 48.5 / 12.2 / 39.2 | 38% / 1.32 | 59% | 4.8 |
| 4 | Max Markley + Nick Julian | 54 | 2 | 1.63 | 48.4 / 12.2 / 39.4 | 37% / 1.26 | 61% | 4.8 |
| 5 | Memo Saldana + Nick Julian | 52 | 4 | 1.62 | 47.9 / 12.2 / 39.9 | 35% / 1.19 | 63% | 5.5 |
| 6 | Jupjee Kochar + Memo Saldana | 53 | 5 | 1.62 | 47.7 / 12.4 / 39.9 | 36% / 1.25 | 60% | 5.2 |
| 7 | Chris Seekely + Jupjee Kochar | 50 | 6 | 1.61 | 48.1 / 11.0 / 40.9 | 34% / 1.20 | 61% | 6.1 |
| 8 | Max Markley + Memo Saldana | 54 | 4 | 1.61 | 47.4 / 12.7 / 39.9 | 36% / 1.23 | 60% | 4.6 |
| 9 | Jupjee Kochar + Taylor Lippincott | 48 | 7 | 1.59 | 47.3 / 11.3 / 41.4 | 35% / 1.23 | 61% | 5.8 |
| 10 | Chris Seekely + Max Markley | 51 | 5 | 1.59 | 46.8 / 12.5 / 40.7 | 36% / 1.25 | 59% | 5.0 |

## WAR ROOM DOWNSTREAM IMPACT

| Consumer | Impact |
| --- | --- |
| Lineup Optimizer (`lib/lineup-optimizer.js`) | Uses corrected shared predictions; aggregation, thresholds and sort logic unchanged. |
| Matchup Lab / Match Intelligence (`app/war-room/WarRoom.js`) | Same component directly calls predict; probability bars, contributions and briefing change naturally. |
| Match simulator (`lib/match-simulator.js`, War Room simulator route) | Uses corrected prediction as an input; simulation algorithm unchanged. Finite Monte Carlo samples are not claimed to have exact side-swap sample identity. |
| Team Intelligence Lineup Lab | Shared optimizer BB/SC matrix changes. Full captured-roster runtime regression verifies it computes once per format and matches optimizer output. |
| Team Intelligence factual/chemistry/editorial boards | Separate historical statistics/summary projection, unchanged. |
| Scorecard calibration report | Shadow-only baseline calls predict; baseline/adjusted comparison changes. No enablement or calibration-policy change. |
| Calculation parity diagnostics | New advisory engine identity and resulting output/invocation fingerprints. |
| Draft analytics and editorial generation | No direct shared predict/optimizer call found. Their historical/player/partnership inputs and utilities remain unchanged. |
| Championship Odds | Separate simulator; unchanged, see below. |

No consumer-specific numerical workaround or public navigation change was introduced. Source-boundary tests cover shared routes and zero Google fallback. No new loader, DB call, cache or N+1 path.

## ODDS IMPACT

`lib/tournament-odds.js` imports only unchanged `formatCode` and `pick` utilities from prediction-engine. It uses its own simulation, not `predict`. Championship engine/version, settings, historical ratings, persisted/publication fingerprints and withdrawn publication history are unchanged. No Odds calculation, publication, restoration or data mutation occurred. Net Skins and Calcutta formulas/contracts are unchanged.

## ENGINE VERSION / FINGERPRINT

New explicit advisory output identity: `prediction-engine.js:team-symmetry-v3`.

Updated `WAR_ROOM_CALCULATION_ENGINE_VERSIONS` for matchup, optimizer, dependent simulation and calibration. Invocation fingerprints already include engine version; regression proves unchanged inputs with old/new engines produce distinct invocation fingerprints. Championship and factual Team Intelligence projection versions remain unchanged because those specific calculations do not call predict.

No settings revision or input-bundle schema/fingerprint change is required: inputs and Settings revision 2 have not changed. Output fingerprints naturally change, including explicit engineVersion on predict results.

Optimizer and Team Intelligence client `useMemo` values are mounted-session computations, not persistent output authority. New release assets plus a fresh navigation/remount recompute them; an already-open old client may retain old code until refreshed. Existing request memoization and completed-history input caches remain valid. No persistent prediction-output cache requiring a database invalidation was found on this path.

Retained historical artifacts are not overwritten or relabeled. Old diagnostic artifacts retain their old engine IDs; legacy outputs lacking an engineVersion must be interpreted using their retained source release/context, not retroactively asserted to be v3. The displayed configured model label remains SBI v1.0; implementation engine identity is deliberately separate from configuration.

## TESTS

- Focused symmetry tests: **13 passed**.
- Final broad regression suite: **237 passed**, including the half-percentage-boundary test. Coverage: shared engine, optimizer, Team Intelligence, War Room input/calculation parity, calibration, handicap/GHIN revision workflow, scoring, Setup, Odds withdrawal/calculation, Net Skins, Calcutta, Director, public/PWA boundary and native scoring contracts.
- Step 14D performance regression passes. Full BB+SC+SI symmetry and aggregate certification remains approximately one second locally; no production latency claim is made.
- Fixture minimization parity: **8,856 exact comparisons** against full captured input.
- `git diff --check`: passed.
- `npm run build`: passed, with existing CSS/autoprefixer and webpack cache-serialization warnings.
- Initial native-contract test invocation omitted the required server condition; rerunning the suite with `node --conditions=react-server --test ...` passed.
- **PostgreSQL parity integration: BLOCKED by local shared-memory exhaustion.** Initial sandbox run could not allocate shared memory; approved unsandboxed retry failed `shmget: No space left on device` (kernel shared-memory limit, not a SQL assertion failure). No existing local PostgreSQL server was available for an equivalent read-only check. No system resources/processes were altered to work around it. Rerun `node --test test/handicap-js-postgres-parity-postgres.integration.test.mjs` in a healthy isolated environment before full release certification.

Reproduce exhaustive report without writes:

```sh
node --input-type=module -e 'import {certifyUniverse} from "./test/helpers/advisory-symmetry-certification.mjs"; console.log(JSON.stringify(certifyUniverse("BB"), null, 2));'
```

## MIGRATION

None. No SQL file, schema, canonical handicap calculation, scoring snapshot or allocation contract changed.

## DEPLOYMENT

Local implementation/build completed; commit/push only is authorized. Exact-SHA authorization is required before deployment. PostgreSQL integration remains the explicit outstanding local certification gate. Production still requires the later authorized release and read-only acceptance; no live fix is claimed here.

## PRODUCTION DATA IMPACT

**0 Production mutations.** No Production requests during implementation. Approved handicap revision 7 and Prediction Settings revision 2 are the authoritative values from the prior read-only capture, not new reads. Pairings, rosters, scoring, Setup, Guide, Odds, Awards, Net Skins, Calcutta and native iOS remain untouched. Existing unrelated local files are excluded from the commit.

TEAM-PERSPECTIVE SYMMETRY: PASS

NEUTRAL FIXTURE WIN == LOSS: YES

PICKLES OPTIMIZER RESULTS RECERTIFIED: YES

LIPP IT AND RIP IT RESULTS RECERTIFIED: YES

LINEUP OPTIMIZER TRUSTWORTHY FOR DRAFT: YES — corrected local advisory calculation; Production not yet released, PostgreSQL rerun pending

PREDICTION SETTINGS REVISION: 2

APPROVED HANDICAP REVISION: 7

OFFICIAL SCORING FORMULA CHANGES: NONE

PRODUCTION MUTATIONS: 0
