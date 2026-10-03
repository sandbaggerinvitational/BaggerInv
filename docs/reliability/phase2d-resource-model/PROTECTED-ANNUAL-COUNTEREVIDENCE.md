# Protected local Production annual counterevidence

**Current disposition:**R2 passes at its accepted local scope. The owner accepts irreproducible048/057 exact historical positive adoption/publication as NOT PROVEN; the scoped failures/limitations below remain unchanged. No reconstruction, fabricated authority or live account access occurred. See [current certification](CERTIFICATION.md).

**PARTIAL — scoped local PostgreSQL proof only.** No hosted or Production target was contacted. The fixture starts from a declared synthetic admitted Production-shaped baseline; it does not prove historical preparation end to end.

The final-profile run (`131–143,145,146`, excluding pending release144) reached actual authorized annual CREATE, team/roster/round configuration, global course creation, valid global tee/hole configuration and three round assignments. `PROMOTE_RUNTIME_STRUCTURE` then rolled back with SQLSTATE23505: duplicate `tournament_setup_course_holes_v1_pkey` for `(2027, CRS000001, Synthetic, 1)`.

## Root cause and scope

**PROVEN (SOURCE + POSTGRESQL):** the fixture assigned the same canonical global course/tee to three rounds. The promotion query joins all three round references and copies every hole once per reference. Its tee insert uses `SELECT DISTINCT`; its hole insert does not. The target hole authority has one key per tournament/course/tee/hole, so the repeated identical references violate its existing primary key.

The complete hole-copy statement is **byte-for-byte identical** in preserved migration066 (`202608300066_production_future_runtime_activation_v1.sql`) and extracted migration139 (`202609300139_certification_future_authoring_v1.sql`). Statement SHA256: `8eab59b3a0c6856ae223a8dc0c1a4228bb2d8ca11b5b10f8c9322349698191a4`. This is an established-base defect exposed by the broader fixture, not an intentional resource-model semantic change. It remains unresolved; no constraint, authority, query or historical data was weakened or rewritten.

The prior attempt had stopped earlier because the synthetic identity helper tried to insert a second revision1 Odds configuration into a protected baseline that already contained a valid canonical configuration. The test-only helper now defaults to its existing Certification initialization behavior, while this protected caller explicitly preserves and verifies the pre-existing configuration. Passing that fixture boundary exposed the course duplication; it did not introduce the promotion query behavior.

## Narrow continuation

Parent review authorizes a separate scoped annual equivalence fixture using supported `ASSIGN_COURSE` calls for the distinct existing canonical predecessor courses C1/C2/C3. That path mirrors the Certification annual fixture and requires no runtime SQL change. Any successful continuation must retain this counterexample and must not claim that repeated use of one course/tee across rounds has been certified.

Issue: **R2-ANNUAL-SAME-COURSE-PROMOTION**. Impact: an otherwise valid future setup reusing one course/tee across multiple rounds cannot promote through the current query. Recommendation: separate bounded annual setup defect work; not an opportunistic correction during resource-class equivalence proof.

## Evidence

- [Second attempt log](implementation-evidence/annual-odds-final-profile-second-attempt.log)
- [Actual annual operation progress and rollback error](implementation-evidence/production-annual-final-profile-counterevidence.json)
- Raw local log: `/private/tmp/r2-annual-odds-final-profile.log`.

The log also contains a separately investigated protected Odds fixture mismatch. Certification Odds passed26/26 in that run; no aggregate PASS is inferred from those passing cases.

## Additional fixture distinctions and remaining positive-proof limit

**PROVEN (SOURCE):** the shared future-preparation helper currently checks Certification-only promotion provenance (`certification-canonical-promotion-v1`) unconditionally. Migration139 intentionally derives that presentation only inside its `resource_class='CERTIFICATION'` branch. A protected Production fixture must assert its existing Production behavior and absence of Certification provenance; it must not seed those rows or force that new class-specific behavior onto Production. The approved test-only parameter defaults to the existing Certification expectation.

**PROVEN (SOURCE, with earlier protected Odds runtime evidence):** this synthetic protected baseline has no legitimate retained frozen2026 Odds publication adoption. The unchanged Production first-publication contract rejects that missing historical authority. See [Odds equivalence limits](ODDS-EQUIVALENCE-PROOF.md). Positive Production2026 annual publication/FinalRecap/close cannot be inferred from a successful future-setup or protected calculation test. No adoption, publication, worker completion or closure certificate will be fabricated to make this fixture pass.

The focused Production Odds failure in the combined run is a separate **test-fixture regression**: its dynamic fixture expected `provisionAnnualSyntheticAuthority` to append normalized synthetic input, but the protected annual caller now explicitly skips that initialization to preserve its admitted baseline. Consequently the focused append adapter never ran, leaving the older baseline configuration that correctly failed the full `PRODUCTION_PREDICTION_SETTINGS_NOT_CURRENT` guard. The bounded correction is to restore explicit normalized synthetic initialization only in that focused Odds fixture, preserve predecessor facts and capability metadata, and certify the current configuration's real domain behavior. No shipping SQL or authority predicate changes are justified by that fixture mismatch.

## Harness accounting correction

The first short retry after the fixture corrections emitted one annual parent with no child. Review detected that changing its child name bypassed the preserved generator's exact `commit, workers, Odds` selection prefix. That annual attempt is **NOT RUN**, even though the test process reported success; its old progress artifact is not reused as new proof. The wrapper now preserves the selection key and changes only the emitted label. A fresh actual child execution remains necessary. The focused protected Odds child in the same process did execute and passed its two-test scoped calculation/rejection proof. See [detected omission log](implementation-evidence/protected-odds-pass-annual-omission.log).

## Executed scoped continuation

The corrected emitted-label wrapper executed its actual child: **2 assertions/tests including parent passed**, in the owned local final-profile fixture excluding144. The generated [annual artifact](implementation-evidence/production-annual-golden.json) deliberately reports `status:PARTIAL`, `futureSetup:PASS`, `completeProtectedAnnual:NOT_PROVEN`, not a full annual PASS. [Scoped run log](implementation-evidence/protected-future-setup-scoped-final-profile.log).

Actual supported operations created the future tournament, two teams,24 roster identities, three rounds,24 future matches, distinct existing-course references, promotion, handicap authority, pairings, frozen contexts, future Director grant, and canonical Guide/Draft/Prediction settings content. There was no direct readiness, publication, completion or activation fabrication. Production promotion retained its existing behavior and created zero Certification presentation provenance.

The run stopped before predecessor scoring and closure. Its actual readiness read correctly returned `ready:false` with missing predecessor scoring-close and final-facts blockers. The separate unchanged historical-adoption requirement explains why this fixture is not advanced or represented as a full Production2026 annual publication/close proof; that later gate was not reached in this scoped run. The original complete chronology code remains available but unexecuted in this narrowed test. The same-course/tee duplicate-hole counterexample above remains open.

## Historical publication artifact availability audit (2026-10-03)

**STRONGLY SUPPORTED — SOURCE / repository inventory:** the exact057 adoption snapshot identifier and payload/import fingerprints were searched across the relevant repository source, tests, scripts and preserved documentation. The matches are the immutable migration contract, source-contract assertions, and a minimal public DTO fixture in `test/odds-publication-withdrawal-v1-1.test.mjs`. That DTO contains year, phase and publication timestamp; it does not contain the required two-team/24-player canonical published payload, valid imported source, or replayable historical adoption chronology. No authorized matching retained snapshot fixture was found.

This is a missing authorized historical input for a positive frozen2026 publication proof. It is distinct from the actually observed provider→069 forward-install compatibility gap. Appending invented historical IDs/fingerprints to synthetic data would falsely assert provenance. The current synthetic fixture may prove actual calculation/reference equivalence and unchanged missing-adoption rejection, but cannot prove positive Production publication, FinalRecap or dependent full annual close. The distinct-course future setup proof remains valid at its stated scope; the unchanged same-course hole-copy defect remains open.

The approved Certification144/148 fixes do not authorize changing057 adoption, adding generic Production first publication, or seeding publication/completion/readiness records. Further Certification chronology proof proceeds independently without modifying these protected semantics.

The local Git history pickaxe for the exact retained payload hash identifies only `47a7077e` (migration source/runtime tests), `62f4d447` (historical course-adoption documentation), and `04b7d5ba` (legacy public DTO projection test). The inspected adoption commit adds source assertions and mocked runtime-contract tests, not a full imported snapshot fixture. This read-only history search did not contact a remote repository or historical account. Source identity at review:057 SHA256 `c45c3b418539aa9532f9dcfb0fb796318ad2eef5d2e9bc8056439da0048f8dc6`; minimal DTO fixture SHA256 `e4f2599b0703a55cb21f1937d6f5e7bb73b8ba213285fc57597ff846c5dfef0e`.

The bounded local follow-up included ignored-file metadata, first by name, in both authorized repositories: `/private/tmp/bagger-phase2d-staging-admission` and `/Users/claybeltran/Developer/BaggerInv`. Relevant ignored fixture/artifact/evidence/backup/snapshot/archive entries: **0 in each**. Top-level names disclosed no additional preservation directory. An explicit no-ignore content search in existing `candidates`, `test`, `tests`, `tools`, `docs`, `contracts` and `scripts` (where present) found the same contract/DTO/documentation references. The preserved raw-artifact storage manifest identifies compressed test/build TAP logs rather than historical database snapshots. Secret files, credentials, dependency/build directories, real accounts and unrelated personal paths were excluded. This exhausts the identified authorized local fixture locations; it does not assert that no historical artifact exists elsewhere under owner control.
