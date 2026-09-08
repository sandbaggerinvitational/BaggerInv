# PN-6B dormant-native reconciliation candidate

## Scope and settled baseline

Production Guide release 66 settled at `6d0b2ad5cab61f50e6d2a269bb2d02e036ccae05`, deployment `dpl_8hHHuerViGbRMaVery2NSu7TQg2q`. Provider identity, release head, consumed intent, receipt, activation/admission revisions, authority generations and resource scope agreed before this worktree was created. No pending intent remained. Native configuration was absent. These are execution-time observations, not permission to skip later checks.

The candidate starts directly from that Production commit. The prior candidate `39291fbd99cfa80c3fce9bec42e68273d28b7816` is reference only. Its dormant-native diff from `7be648302c98ca8243af0034e2cdfec063a37d36` contains 79 paths. Production advanced across 11 disjoint paths. No branch merge or blind cherry-pick was used.

## Guide reconciliation

All 11 newer Production paths are byte-identical to the settled baseline, including optional publication, public presentation, authoring validation and migration history. The semantic overlap is the existing mobile Guide adapter consuming the shared Production publication/participant projection. Its bounded arrays already admit empty optional collections; published core content remains PUBLISHED and unpublished content remains UNPUBLISHED. No adapter/schema change is necessary and no filler is introduced.

Five new integration tests feed real Production authoring output through the existing participant projection and mobile transport. They cover minimum published content with three canonical course/format assignments, each optional domain independently, unpublished content, invalid publication input and canonical tournament/membership denial. The committed Guide DTO schema stays byte-identical. Schedule/timeline ownership remains with its existing separate mobile contract.

Three imported source-preservation tests now anchor their unchanged assertions to the settled Production SHA. This strengthens preservation coverage to include the Guide release. The PN-4 report retained in this tree describes its historical candidate, not this candidate.

## Defaults, authority and provenance

Every dormant-native runtime and contract file is byte-identical to the prior certified package. The sole shared runtime change relative to Production remains PN-4's explicit mobile projection opt-in; default web/PWA behavior is preserved. Production identity, current tournament, scoring authorization/ingress, workers/outboxes/archives, release/rebind/rollback and Guide authority remain the Production implementations.

Missing, malformed and unsupported native capability configuration remain fail-closed. Reads, Auth, certification and scoring default OFF. No signing key, provider configuration, new database dependency or migration is added. Existing Production migrations are preserved byte-for-byte and none is applied here.

PN-5/PN-5B source-contract and provisioning evidence is reusable: environment, credential, project, resource and expected-commit/release predicates are unchanged. This does not certify current provider values or complete deployment access. Resumed PN-6 must repeat candidate, current Production, capability, provenance and serial release-head checks, and establish deployment/rebind readiness before its first write.

## Complete reconciliation map

| Path | Resolution | Classification | Diff category |
| --- | --- | --- | --- |
| `app/api/mobile/v1/auth/captcha/route.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `app/api/mobile/v1/auth/otp/certify/route.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `app/api/mobile/v1/auth/otp/request/route.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `app/api/mobile/v1/guide/route.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `app/api/mobile/v1/health/route.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `app/api/mobile/v1/history/[year]/route.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `app/api/mobile/v1/history/route.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `app/api/mobile/v1/matches/[matchId]/route.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `app/api/mobile/v1/odds/route.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `app/api/mobile/v1/passport/route.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `app/api/mobile/v1/records/route.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `app/api/mobile/v1/scoring/current/route.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `app/api/mobile/v1/session/route.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `contracts/mobile/v1/README.md` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `contracts/mobile/v1/auth-otp-certify-response.schema.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `contracts/mobile/v1/error.schema.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `contracts/mobile/v1/fixtures.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `contracts/mobile/v1/guide.schema.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `contracts/mobile/v1/history-detail.schema.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `contracts/mobile/v1/history.schema.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `contracts/mobile/v1/match-detail-fixtures.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `contracts/mobile/v1/match-detail.schema.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `contracts/mobile/v1/matches.schema.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `contracts/mobile/v1/odds.schema.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `contracts/mobile/v1/opaque-match-id-fixtures.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `contracts/mobile/v1/participant-content-fixtures.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `contracts/mobile/v1/passport.schema.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `contracts/mobile/v1/production-health.schema.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `contracts/mobile/v1/records.schema.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `docs/pn2-production-native-admission.md` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | DOCUMENTATION |
| `docs/pn4-production-native-default-off-candidate.md` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | DOCUMENTATION |
| `lib/mobile-api-v1.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `lib/mobile-bearer-identity.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `lib/mobile-match-id-path.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `lib/mobile-native-admission.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | NATIVE CAPABILITY CONTROL |
| `lib/mobile-native-auth.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `lib/mobile-native-certification.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | CERTIFICATION SECURITY |
| `lib/mobile-native-production-authority.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | PRODUCTION AUTHORITY PRESERVATION |
| `lib/mobile-native-production-environment.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | PRODUCTION NATIVE ENVIRONMENT |
| `lib/mobile-opaque-match-id.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `lib/mobile-v1-career-authority.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `lib/mobile-v1-guide.js` | Import unchanged; new Production publication integration tests certify semantic overlap | CLEAN IMPORT | GUIDE RECONCILIATION |
| `lib/mobile-v1-history.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `lib/mobile-v1-match-detail.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `lib/mobile-v1-odds.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `lib/mobile-v1-participant-content-authority.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `lib/mobile-v1-passport.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `lib/mobile-v1-production-match-detail.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `lib/mobile-v1-production-read-context.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `lib/mobile-v1-records.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `lib/mobile-v1-route.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `lib/mobile-v1-scoring-route.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | ROUTE ADMISSION |
| `lib/mobile-v1-scoring.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `lib/mobile-v1-tournament-reads.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | REQUIRED MOBILE CONTRACT |
| `lib/tournament-live-supabase.js` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | PRODUCTION AUTHORITY PRESERVATION |
| `package-lock.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `package.json` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/fixtures/pn1-mobile.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/fixtures/pn2-native.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/mobile-api-v1-routes.test.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/mobile-opaque-match-id-route.test.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/mobile-opaque-match-id.test.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/mobile-v1-guide-route.test.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/mobile-v1-guide.test.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/mobile-v1-match-detail-contract.test.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/mobile-v1-match-detail-pwa-parity.test.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/mobile-v1-match-detail.test.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/mobile-v1-matches-contract.test.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/mobile-v1-participant-content-fixtures.test.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/mobile-v1-participant-content-routes.test.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/mobile-v1-participant-content.test.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/mobile-v1-passport.test.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/mobile-v1-tournament-reads.test.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/pn1-production-mobile-boundary.test.mjs` | Re-anchor Production preservation assertions; retain every assertion | MANUAL RECONCILIATION | TEST |
| `test/pn1-production-mobile-reads.test.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/pn2-native-admission.test.mjs` | Re-anchor Production preservation assertions; retain every assertion | MANUAL RECONCILIATION | TEST |
| `test/pn4-production-reconciliation.test.mjs` | Re-anchor Production preservation assertions; retain every assertion | MANUAL RECONCILIATION | TEST |
| `test/support/mobile-opaque-match-id-cases.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |
| `test/support/mobile-v1-schema-validator.mjs` | Import only this inspected dormant-native path; no Production overlap | CLEAN IMPORT | TEST |

## Newer Production preservation

| Path | Preservation |
| --- | --- |
| `app/admin/director/ProductionGuideEditor.js` | BYTE-IDENTICAL |
| `app/tournament-guide/page.js` | BYTE-IDENTICAL |
| `docs/guide-optional-content-certification.md` | BYTE-IDENTICAL |
| `lib/guide-editor-presentation.js` | BYTE-IDENTICAL |
| `lib/guide-publication-policy.js` | BYTE-IDENTICAL |
| `lib/production-guide-authoring-contract.js` | BYTE-IDENTICAL |
| `lib/tournament-guide-projection.js` | BYTE-IDENTICAL |
| `supabase/production_migrations/202609080094_production_guide_optional_content_v1.sql` | BYTE-IDENTICAL |
| `test/guide-optional-content-render.test.mjs` | BYTE-IDENTICAL |
| `test/step13e8c-production-guide-postgres.integration.test.mjs` | BYTE-IDENTICAL |
| `test/step13e8c-runtime-guide-authoring.test.mjs` | BYTE-IDENTICAL |

## Focused differential validation

Tests use an allowlisted local environment with no provider credentials. Live PostgreSQL integration tests are excluded. Test output is captured in memory and only safe summaries are retained. Counts below are selection totals; overlapping selections are not unique-test totals. Added PN suites have no corresponding suite on the Production base.

| Selection | Candidate pass/fail | Base pass/fail | Candidate-only failures |
| --- | --- | --- | --- |
| guide-public-plain | 3/0 | 3/0 | 0 |
| guide | 72/0 | 72/0 | 0 |
| newer-production-plain | 39/0 | 39/0 | 0 |
| pn1 | 193/0 | N/A | 0 |
| pn2 | 18/0 | N/A | 0 |
| pn4-final | 5/0 | N/A | 0 |
| pn6b | 5/0 | N/A | 0 |
| preview | 92/0 | 92/0 | 0 |
| production-authority | 136/2 | 136/2 | 0 |
| production-scoring | 66/0 | 66/0 | 0 |
| release-binding | 32/0 | 32/0 | 0 |
| web-pwa | 147/2 | 147/2 | 0 |

Four unchanged inherited failures remain in Production authority and web/PWA selections. No tests were weakened to suppress them. Candidate-only security and unresolved regression failures are zero. Exact per-selection file manifests and safe results are in `/private/tmp/bagger-pn6b-evidence`.

Build and final candidate evidence are recorded below after completion. No deployment, push, merge, release intent, rebind, participant operation, worker operation or Apple change is part of PN-6B.

## Build and diff certification

Compile-only Next.js build passed with sanitized local configuration. All 21 mobile routes compiled. Existing autoprefixer and webpack cache warning categories remain; no compile error or static participant collection. The complete candidate diff is limited to the 79 inspected dormant-native paths plus this report and the new five-case Guide integration test. No generated build file, migration, iOS file, active polish or unrelated path is included.

The two added PN-6B paths are `test/pn6b-guide-reconciliation.test.mjs` (TEST) and `docs/pn6b-production-native-reconciliation.md` (DOCUMENTATION).
