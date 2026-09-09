# Release B 098 + 099 integration — certification gate

Date: 2026-09-09. Historical gate record: **BLOCKED — Calcutta round tie metadata**, subsequently resolved by the separately authorized metadata-only correction. See [final recertification](release-b-final-certification.md) for the current PASS verdict and candidate boundary. This document retains the original finding and migration-integration evidence.

No candidate commit or Production deployment was created. All changes remain in the isolated `codex/release-b-integrated` worktree. Production and native files were not changed.

## Refreshed Production evidence

Read-only Supabase inspection during this pass returned release 75, SHA `76dfb0097f23d132c7010131f34c2df895bdb856`. Installed ancestry includes 095, 096 and 097, not 098/099. R1/R2 each have 24 participants and zero started Matches; R3 has zero participants. Net Skins is NOT_CONFIGURED revision 1, with zero entries/results/active jobs. Calcutta is NOT_CONFIGURED revision 1, auction revision 0, UNPUBLISHED publication revision 0, zero results/active jobs. Odds pointer is WITHDRAWN, pointer revision 2, no current publication revision; one SUCCEEDED job and no active jobs.

This is prospective correction evidence, not a fixture-derived Production financial impact comparison. No historical result migration is required for that observed state. Refresh again before any eventual deployment.

## Blocking regression

`test/release-b-full-net.test.mjs` now asserts that two tied Scramble pairs produce round `tieSize: 2`. The integrated calculation returns `1`.

Exact path:

1. `calculateProductionFullNetCalcutta` supplies canonical TEAM Full-Net totals.
2. `calculateCalcuttaFromCanonicalRoundResults` invokes the existing publication pipeline, then rebuilds its participant model from publication records.
3. `buildCalcuttaModel` in `lib/calcutta.js:369` uses `tieSize: 1` in its existing published-output branch.

That hard-coded value is also present in the unchanged release-75 baseline. It was not introduced by migration 099. The fixture's place is correctly 1 and its player Points are correctly 7.5: pair occupied-place awards 20 and 10 average to 15 and split equally. This does not establish correct tie metadata: the two-pair tie is still flattened to one in the returned round model.

The failing assertion is retained, not weakened. `lib/calcutta.js` was not edited. A narrowly authorized metadata-preservation correction needs to retain canonical tie-group size through the publication/model boundary without changing ranking, award averaging, financial formulas or historical records. Re-certification is required before calling the candidate PASS or creating its certified commit.

## Integrated authority boundary

- 098 is byte-identical to the certified Director explicit-entry prerequisite. PLAYER BB/SI and PAIR SC consent, revision history, pairing provenance, CAS, idempotency and security remain intact.
- 099 obtains eligibility only from saved 098 revisions; configuration supplies expected revision bindings, not client-created consent. Calculation rechecks exact revision, entry key, pair/Match identity and binding fingerprint. Non-entered entrants are excluded before score/award processing.
- Shared SQL Full Net consumes prepared Match handicap revision/context, full-precision Course Handicap, established final signed allocation and Gross. Scramble uses established 35/15 rounding without opponent reduction.
- Calcutta consumes shared Full Net independently of Net Skins consent. Its existing financial engine is preserved, including the pre-existing tie-metadata defect identified above.
- 095/096/097 bodies/files, Matchup-Net products, Odds guards and Release A authority are not rewritten.

## Former Full-Net 098 draft to final 099

Preserved former draft SHA-256: `3a2c01ca56efebdc84a5bbd22fb33ec825bffeeb8b711229a7766448d8da142d`.

The original draft remains unchanged in `/private/tmp/bagger-release-b-full-net`.

Exact functional difference boundary:

1. Rename migration file to 099, after entries 098.
2. Rename one SQL participant alias from `p` to `bound`, resolving an actual PL/pgSQL record/alias collision found by execution; no arithmetic change.
3. Replace proposed client `opt_ins` manifest input with saved registry plus exact `entry_revisions`; add entry key/revision/binding provenance to manifests and persisted source payloads.
4. Add current round entry authority to the Skins source fingerprint and private worker input; fail closed on stale consent.
5. Serialize configuration with the existing Director/098 setup advisory lock before existing row locks.
6. Bind the added Calcutta Full-Net source fingerprint to completed/consumed Rounds. The legacy source remains present; future empty/unconsumed R3 initialization no longer changes the added consumed-input projection and breaks Release A equivalence. Genuine completed-source changes remain invalidating.

No allocation, rounding, award or financial formula was altered. No Preview QA reconstruction was imported.

## Migration SHA-256

| Migration | SHA-256 |
|---|---|
| 095 preserved | `3e70203056f6a6e0f59aa7f06161cc01352057027ec4643e41e92948ebf99919` |
| 096 preserved | `0c2c5894aebe7d1cde4eb7fa9b8ead6c2f246df24f7cfaecd6e24257cba07af7` |
| 097 preserved | `ba6af5585889b956b9d336c02deeff0db8cefdc67a22e1c35175dcb130002109` |
| 098 draft integration | `a7a3ebca7d552934e3ff0531362098467ac5a7c0c5ee84e9a4bb4869b979c8e8` |
| 099 draft integration | `0f8524925e62ab21243c81511f258990fb4acee5da7e9dc80193bdf3bcf7d59d` |

## Test evidence

- Final serial PostgreSQL combined run: **40 passed, 0 failed, 0 skipped**. Files: release-a-late-r3, release-b-full-net, net-skins-entries, net-skins-entries-ancestry, handicap-js-postgres-parity integration suites. Counts include imported baseline tests.
- Actual 001–097 followed by 098/099 clean installation: PASS, inert installation; existing protected function bodies/financial facts unchanged. Reduced lifecycle fixture uses exact 099 shared projection/source wrapper; complete migration installation is separately exercised against actual ancestry.
- Release A nested matrix: 27 passed, including actual late R3 setup/preparation followed by authenticated 098 Singles consent, independent of started R1/R2. Reduced fixture adds only missing table shape; it is not Production data.
- Final focused JS/Director/server run: **28 passed, 1 failed**. Sole failure is the explicit Calcutta two-pair `tieSize` assertion above.
- Earlier broader application/engine/Director/Odds suites this pass: **100 passed**.
- Earlier Production worker/read/mobile contract suites this pass: **42 passed**.
- Production build: PASS. Existing unrelated CSS/webpack warnings remain. Subsequent edits were tests/documentation and SQL whitespace only.
- `git diff --check`: PASS before this report was added.
- Earlier financial conservation assertions passed for aggregate golfer and owner projected values, ownership-weighted investment and guaranteed allocation. Existing JavaScript floating-point semantics were retained; tests use tolerance, not new payout rounding. Overall financial/metadata certification is still BLOCKED.

These are deterministic local certifications plus separately identified read-only Production shape observations; they are not post-deployment certification.

## Recovery and release boundary

No rollback is needed now: nothing was deployed. Preserve both original draft worktrees and this failing regression.

For a future separately authorized release, apply new transactional 098 then 099 only after full certification. A failing 099 transaction rolls back 099; successfully installed 098 remains an inert explicit-entry registry. Never rewrite applied migrations or delete receipt/consent/result history. If runtime recovery becomes necessary, use a reviewed versioned successor and preserve historical engine identities; do not restore an implicit-field or Playing-HCP fallback or republish results as a workaround.

Production deployment is NOT AUTHORIZED. No pairing/scoring/handicap/financial/publication mutations occurred. Native Leaders remains locked. No native changes, Release A changes, Odds changes or unrelated worktree cleanup occurred.
