# Odds review + 2026 tagline certification

## Scope and release boundary

Application/presentation only, based on Production commit `92e53df72d7493b742eb3a180c7061107fa22ddb`. No migration, simulator change, deployment-SHA guard change, publication, recalculation, or Production mutation.

**Release caveat:** the audited artifact is bound to the current Production SHA. Deploying this new commit changes that SHA. The unchanged same-release contract will then reject this artifact as a publication candidate. This change does not grant cross-release compatibility or authorize another calculation.

## Read-only Production audit

- New calculation: `fcd2bdcd94a36ebf371567d035c74fecf2fa3d839f5ec1f937ec7f4aab913655`.
- Completed: `2026-09-10T23:54:17.938218+00:00`.
- Pre-Tournament; 25,000 / 25,000; SUCCEEDED; publication READY, not published.
- Retained deployment SHA equals the inspected current Production SHA above.
- Input fingerprint: `3d4eb99ad6afef6558e830d5d5a733599b2a4d01cf98d810700b330b1220b9c5`.
- Result fingerprint: `e1d2f77300673bb7bd688309e5e8a63f9dd40d17a908f7e8786013a8559ec441`.
- The retained logical result was independently hashed and matched its fingerprint.
- Current Setup revision 25; approved Handicap revision 7; Prediction Settings revision 2.
- Current versus retained source revision, pairing evidence, ratings, settings bindings and all 24 approved handicaps agree.
- Six complete R1 pairings and six complete R2 pairings agree; twelve R3 matches remain unpaired. All 24 matches are UPCOMING; scored holes are zero.
- Separate Setup/Handicap revision numbers are not retained artifact fields. The review labels current revisions as context, not historical bindings.
- Prior release-75 calculation remains untouched and is not the candidate.

## Retained results

| Team | Raw championship probability | Public rounded probability | Expected points | American odds |
| --- | ---: | ---: | ---: | ---: |
| The Pickles | 54.052% | 54.1% | 36.58 | -118 |
| Lipp it and Rip it | 45.948% | 45.9% | 35.42 | +118 |

Top five by retained rank: Holman Moores, Chase Patterson, Michael Hunnicutt, Max Markley, Miles Berger. Player fields retained and exposed in the private review are identity/name, rank, team side, rounded probability, full-precision probability, American odds, average finish, expected points and expected record. The complete unpublished payload is not checked into Git; automated fixtures are synthetic.

The existing certified Pre-Tournament engine independently shuffles each team's roster into Singles matchups every iteration. It does not require an official R3 draw. Tied championships split title credit equally; a separate tie probability is not retained. No simulator behavior changed.

## Review implementation

Successful eligible jobs expose Review Snapshot instead of a direct publish button. The authenticated, private/no-store GET verifies the exact retained result using the existing publication gate. It suppresses only the gate's stale-job supersession side effect for the read path; stale, corrupt, incomplete and cross-release results still fail closed.

Team probabilities and expected points lead the review, followed by all 24 player projections, pairing/model basis, and expandable certification details. Full raw player probabilities remain inspectable. Publication remains a separate existing confirmation and independently repeats the existing guards. No new publication or withdrawal path was added.

## Public presentation audit

Two existing public presentations serve different purposes:

- `/odds-center`: team probabilities, expected points, American odds, full ranked player table and projection timeline.
- Standings Insights: Championship Odds hero, favorite portrait/probability/odds, ten top-contender cards, fourteen Remaining Field entries, First Projection/trends, Publication Information and Storylines.

Compared the Insights component with archived August 5 commit `8e46ecaf`. Its familiar structure remains present. This task changes neither public renderer. The isolated archive comparison uses archived component code with current shared styling/helpers, so it demonstrates structural continuity rather than pixel-exact reconstruction of the old deployment.

The new retained result was rendered locally through both real public components without publication. The local server rejects non-GET requests and makes no Production connections. Publication labels in those local previews demonstrate the hypothetical public presentation, not an actual publication. Optional independently generated editorial data was not fabricated; the existing deterministic Storylines fallback was shown.

## Tagline

One shared constant now supplies the Homepage 2026 hero, public menu footer, and shared event/PWA footer:

24 Players. 3 Rounds. 2 Teams. 1 Trophy.

Historical tournament content is unchanged; the homepage retains its prior dynamic fallback for non-2026 tournaments.

## Certification

- 104 application/regression tests passed in the first group, including the four new focused tests.
- 124 tests passed across the second group after running the 15 Today tests with their required `--conditions=react-server`. The initial ordinary-Node invocation produced four authority-import failures, reproduced on the untouched base; no assertions or implementation were changed to obtain the server-condition pass.
- Two serial disposable PostgreSQL integrations passed: official handicap rounding parity and Odds withdrawal/history/Setup dependency/revision sequencing.
- Production build passed. Existing unrelated CSS build warnings remain.
- `git diff --check` passed.
- Current public Insights and Odds Center checked at 390, 430, 820, 1280 and 1440px: no document overflow; 24 player entries; favorite/top-contender images loaded. Director review was captured at all five widths with contained table scrolling and 44px actions.
- Local screenshots: `/tmp/bagger-odds-review-captures/`. Use `insights-viewport-*.png` for clean public viewport evidence; the browser's long-page stitching produced duplicate visual strips in some full-page captures, not duplicate DOM rows.
- A subsequent native browser confirmation test stalled the local browser dialog, preventing additional close/focus interaction checks. It invoked only a local callback, not a Production endpoint. Existing publication confirmation is unchanged and covered by application regression checks; do not interpret this browser limitation as a live publication test.

Existing meaningful-decimal Best Ball display, Scramble projection, friendly tee times, restored team assets, pairing workspace, handicap/scoring parity, Guide boundaries, public/PWA/native isolation, and Today behavior are covered by the relevant regression groups. No Production deployment or live acceptance of this new code has occurred.
