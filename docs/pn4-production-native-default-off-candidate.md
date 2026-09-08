# PN-4 current Production reconciliation

Production source verified through the Vercel alias API at 2026-09-08T18:30:36Z: `7be648302c98ca8243af0034e2cdfec063a37d36`.
Source branch: `codex/matchup-lab-ancillary-fix`. Serving deployment: `dpl_CLTT5CNwdKfGgKxzKAK6CeTzn7FV` (READY).
Deployment created: 2026-09-08T15:52:32.876000+00:00.

The isolated candidate starts at that exact SHA. PN-1 is `64e936a6464d0b106be32f66a1f8cb3b8cee3ccd`; PN-2 is `614c0fbe4fb336fb8f5be8d9c9d92c4600d511d9`; shared ancestry is `bffd4a621c2d8bca88153c7bb6c6f2206ce8e62d`.

## Reconciliation boundary

The newer Production commits are `c0d8267` (team symmetry and central tie allocation) and `7be6483` (Matchup Lab advisory acceptance). Their 15 files have no overlap with the 77 PN-1/PN-2 files. They are preserved byte-for-byte, including advisory calculations, neutral tee behavior, recorded-score intelligence counts, input identity validation, UI copy and certification tests. No branch was blindly merged or cherry-picked. Only the inspected PN-1/PN-2 path set was imported from committed source.

One shared projection required manual semantic reconciliation: `tournament-live-supabase.js`. PN-1 globally changed opaque IDs, aggregate ordering and explicit-null fallback. PN-4 makes that behavior opt-in with `mobileContract: true` at the mobile Matches call. Existing web/PWA, Director, prediction and leaderboard callers retain their exact Production default behavior. No data authority or RPC changed. The focused tests compare both modes with stored Production and PN-2 implementations across BB/SC/SI and scheduled/live/final fixtures, with and without explicit nulls.

The two inherited source-preservation tests now compare against the verified Production SHA, rather than the older PN-1/shared ancestry. Their security assertions remain intact. The PN-1 client contract remains pinned to its original committed iOS revision; later committed and uncommitted native polish is deferred.

## File-level three-way map

For every row, Production equals the shared-base version (or the path does not exist), PN-1/PN-2 supplies the mobile requirement, and final source preserves that requirement except the explicitly scoped projection adjustment. All other current Production source remains byte-for-byte unchanged.

| File | Production state | Requirement/category | Resolution |
|---|---|---|---|
| `app/api/mobile/v1/auth/captcha/route.js` | Existing shared-base version | PN-2 ROUTE ADMISSION | CLEAN SEMANTIC IMPORT |
| `app/api/mobile/v1/auth/otp/certify/route.js` | Existing shared-base version | PN-2 ROUTE ADMISSION | CLEAN SEMANTIC IMPORT |
| `app/api/mobile/v1/auth/otp/request/route.js` | Existing shared-base version | PN-2 ROUTE ADMISSION | CLEAN SEMANTIC IMPORT |
| `app/api/mobile/v1/guide/route.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `app/api/mobile/v1/health/route.js` | Existing shared-base version | PN-2 PRODUCTION NATIVE HEALTH | CLEAN SEMANTIC IMPORT |
| `app/api/mobile/v1/history/[year]/route.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `app/api/mobile/v1/history/route.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `app/api/mobile/v1/matches/[matchId]/route.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `app/api/mobile/v1/odds/route.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `app/api/mobile/v1/passport/route.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `app/api/mobile/v1/records/route.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `app/api/mobile/v1/scoring/current/route.js` | Existing shared-base version | PN-2 ROUTE ADMISSION | CLEAN SEMANTIC IMPORT |
| `app/api/mobile/v1/session/route.js` | Existing shared-base version | PN-2 ROUTE ADMISSION | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/README.md` | Existing shared-base version | DOCUMENTATION | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/auth-otp-certify-response.schema.json` | Existing shared-base version | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/error.schema.json` | Existing shared-base version | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/fixtures.json` | Existing shared-base version | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/guide.schema.json` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/history-detail.schema.json` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/history.schema.json` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/match-detail-fixtures.json` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/match-detail.schema.json` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/matches.schema.json` | Existing shared-base version | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/odds.schema.json` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/opaque-match-id-fixtures.json` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/participant-content-fixtures.json` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/passport.schema.json` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/production-health.schema.json` | Absent | PN-2 PRODUCTION NATIVE HEALTH | CLEAN SEMANTIC IMPORT |
| `contracts/mobile/v1/records.schema.json` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `docs/pn2-production-native-admission.md` | Absent | DOCUMENTATION | CLEAN SEMANTIC IMPORT |
| `lib/mobile-api-v1.js` | Existing shared-base version | PN-2 ROUTE ADMISSION | CLEAN SEMANTIC IMPORT |
| `lib/mobile-bearer-identity.js` | Existing shared-base version | PN-2 ROUTE ADMISSION | CLEAN SEMANTIC IMPORT |
| `lib/mobile-match-id-path.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `lib/mobile-native-admission.js` | Absent | PN-2 CAPABILITY CONTROL | CLEAN SEMANTIC IMPORT |
| `lib/mobile-native-auth.js` | Existing shared-base version | PN-2 ROUTE ADMISSION | CLEAN SEMANTIC IMPORT |
| `lib/mobile-native-certification.js` | Existing shared-base version | PN-2 CERTIFICATION SECURITY | CLEAN SEMANTIC IMPORT |
| `lib/mobile-native-production-authority.js` | Absent | PN-2 PRODUCTION NATIVE ENVIRONMENT | CLEAN SEMANTIC IMPORT |
| `lib/mobile-native-production-environment.js` | Absent | PN-2 PRODUCTION NATIVE ENVIRONMENT | CLEAN SEMANTIC IMPORT |
| `lib/mobile-opaque-match-id.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `lib/mobile-v1-career-authority.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `lib/mobile-v1-guide.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `lib/mobile-v1-history.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `lib/mobile-v1-match-detail.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `lib/mobile-v1-odds.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `lib/mobile-v1-participant-content-authority.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `lib/mobile-v1-passport.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `lib/mobile-v1-production-match-detail.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `lib/mobile-v1-production-read-context.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `lib/mobile-v1-records.js` | Absent | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `lib/mobile-v1-route.js` | Existing shared-base version | PN-2 ROUTE ADMISSION | CLEAN SEMANTIC IMPORT |
| `lib/mobile-v1-scoring-route.js` | Existing shared-base version | PN-2 ROUTE ADMISSION | CLEAN SEMANTIC IMPORT |
| `lib/mobile-v1-scoring.js` | Existing shared-base version | PN-2 ROUTE ADMISSION | CLEAN SEMANTIC IMPORT |
| `lib/mobile-v1-tournament-reads.js` | Existing shared-base version | PN-1 MOBILE CONTRACT | MANUAL RECONCILIATION |
| `lib/tournament-live-supabase.js` | Existing shared-base version | CURRENT PRODUCTION PRESERVATION | MANUAL RECONCILIATION |
| `package-lock.json` | Existing shared-base version | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `package.json` | Existing shared-base version | PN-1 MOBILE CONTRACT | CLEAN SEMANTIC IMPORT |
| `test/fixtures/pn1-mobile.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/fixtures/pn2-native.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/mobile-api-v1-routes.test.mjs` | Existing shared-base version | TEST | CLEAN SEMANTIC IMPORT |
| `test/mobile-opaque-match-id-route.test.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/mobile-opaque-match-id.test.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/mobile-v1-guide-route.test.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/mobile-v1-guide.test.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/mobile-v1-match-detail-contract.test.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/mobile-v1-match-detail-pwa-parity.test.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/mobile-v1-match-detail.test.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/mobile-v1-matches-contract.test.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/mobile-v1-participant-content-fixtures.test.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/mobile-v1-participant-content-routes.test.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/mobile-v1-participant-content.test.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/mobile-v1-passport.test.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/mobile-v1-tournament-reads.test.mjs` | Existing shared-base version | TEST | CLEAN SEMANTIC IMPORT |
| `test/pn1-production-mobile-boundary.test.mjs` | Absent | TEST | MANUAL RECONCILIATION |
| `test/pn1-production-mobile-reads.test.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/pn2-native-admission.test.mjs` | Absent | TEST | MANUAL RECONCILIATION |
| `test/support/mobile-opaque-match-id-cases.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |
| `test/support/mobile-v1-schema-validator.mjs` | Absent | TEST | CLEAN SEMANTIC IMPORT |

The new PN-4 regression test is TEST; this document is DOCUMENTATION. Package changes add only the PN-1 pinned AJV schema validators as development dependencies; runtime dependencies are unchanged.

## Authority and database compatibility

Canonical participant identity, current-tournament dispatch, match authorization, ingress, receipts, finalization, legacy Google closure, post-commit scheduling, Calcutta/competition/intelligence, workers, Google outbox, archives and rollback code remain unchanged from Production. PN-2 adds admission before existing mobile work; it does not replace canonical scoring. Health uses only the existing three inspectors/resolver. PN-3A is the accepted structural database evidence: no new database dependency, schema, RPC, migration or grant is introduced.

The three internal default-EXECUTE helpers and historical NOT VALID constraint remain inherited P5 debt; PN-4 neither changes nor treats them as deployment blockers.

## Default-OFF behavior

`PRODUCTION_NATIVE_CAPABILITIES` is server configuration only. No live value is created. Missing, malformed, stale, unsupported and unknown-field documents deny all protected capabilities. Versioned public health can return COMPATIBLE with all gates false when the existing authority is valid, and fails closed otherwise. Health exposes no participant data, secrets, workbook, deployment SHA or internal control identifiers.

Reads, Auth, certification and scoring remain independent. Preview keeps its exact environment/resource admission and v1 proof. Production v2p uses a separate server-only key and binds canonical identity, current tournament, expiry and revocation/runtime context. No real key or proof was created. Tests use synthetic values only.

Native denial occurs before domain content transport, Auth/provider delivery, certification issuance or canonical score persistence. A second scoring gate runs after authorization. No receipt/outbox/archive/derived scheduling can be reached after default-OFF denial. Existing web/PWA paths do not consume native switches.

## Validation and safety scope

Local tests run with an allowlisted process environment without provider credentials or live native controls. PostgreSQL integration tests are excluded. The exact Production base is tested in its own isolated detached worktree with the same non-database suite selection. Compile-only Next build avoids static participant data collection. No live login, OTP, enrollment, certification, scoring, finalization, queue, Google or archive operation is part of validation.

Test manifests, TAP logs and comparison evidence are local artifacts in `/private/tmp/bagger-pn4-evidence-pwp2tbec`. See the final validation results below.

## Separate deployment preflight (not performed)

Before a default-OFF deployment: recheck then-serving Production SHA and material drift; review the candidate/CI build; verify live capability configuration is absent or all false and cannot be inherited as enabled; certify the established deployment/resource rebind and rollback procedure; approve deployment separately; plan a health-only smoke check. A Production signing key is not required for default-OFF health or denial, and no key is created here.

Before later capability activation: certify each gate and its dependencies separately, including the dedicated signing key, canonical current context, native Auth/enrollment integration, SMTP/Turnstile operation, scoring and downstream delivery, client environment and reviewer isolation. None is authorization to enable native access.

Deferred: deployment; native read/Auth/certification/scoring activation; first-time native enrollment; provider operational certification; physical Google/archive delivery; Production iOS configuration; Bundle ID/Apple setup; reviewer identity/demo data; TestFlight; App Review; public release; later native polish contracts.

## Final test evidence

| Suite | Files | Passed | Failed |
|---|---:|---:|---:|
| pn4-final | 1 | 5 | 0 |
| pn2 | 1 | 18 | 0 |
| pn1 | 14 | 193 | 0 |
| production-authority | 18 | 136 | 2 |
| production-scoring | 6 | 66 | 0 |
| web-pwa | 15 | 143 | 2 |
| preview | 12 | 92 | 0 |
| newer-production-plain | 3 | 39 | 0 |
| candidate-broad | 427 | 3239 | 36 |
| production-base-broad | 411 | 3024 | 35 |
| candidate-js | 1 | 4 | 0 |
| production-base-js | 1 | 4 | 0 |
| candidate-additional | 2 | 17 | 0 |
| production-base-additional | 2 | 17 | 0 |
| candidate-admission-recheck | 1 | 25 | 0 |
| base-admission-recheck | 1 | 25 | 0 |

Broad MJS comparison: 35 shared failure names, zero Production-base-only names. Candidate-only initial failure: `v3 admission fails closed and uses the fenceable legacy credential identity`. Its source and all five entrypoint modules are byte-identical to Production. This fixture uses a 20 ms expiry window and a 35 ms timer; the concurrent broad run returned an empty pause-code map. The complete file subsequently passed 25/25 on both candidate and exact base without any source change. Classified as a non-reproducing, timing-sensitive baseline test failure; not a PN-4 code regression. Retained in raw broad counts rather than hidden.

The shared Matchup Lab module-load failure is caused by applying Node’s `react-server` condition to a normal React DOM rendering test. Its correct normal-rendering run, together with symmetry and input regressions, passes 39/39. No Production test was modified to suppress inherited failures.

The additional JS and `tests/production` suites contribute 21 passes on each revision. Combined broad selections: candidate 3,260 passed / 36 failed across 430 files; exact base 3,045 passed / 35 failed across 414 files. Added contract/preservation cases explain the different test counts. No skipped tests in the selected suites. Database integration suites were deliberately not selected.

PN-4-introduced failures: **0**. Unresolved candidate-specific source/security failures: **0**. The raw candidate-only broad failure count is **1**, with the focused closure above.

### Shared broad failure names

- 2025 owns one compact top year navigator while preserving canonical destinations
- 2026 Year navigation is shared, top-placed, two-destination, and has no fabricated 2027
- CLI writes one immutable local artifact and never calls a provider
- Courses UI uses chronological groups, bounded prefetch, one AppShell, and no per-card data topology
- Director menu is exposed only after canonical Director authorization resolves
- Game Center removes duplicated tournament masthead and uses a compact match identity
- Game Center return context defaults to My Match and preserves explicit safe origins
- History prefetch is bounded to recent Archive, first Round, teams, and shell destinations
- History-context Course navigation sits below the hero while direct and Guide entry stay normal
- Home result and details destinations use same-origin Game Center with Home return context
- Home routes, identity, facts, and accessible actions remain intact
- Homepage completed-history composition keeps explicit 2026 history while current presentation follows the Production pointer
- Leaderboards owns exactly Players, Teams, Net Skins, and Insights
- Leaderboards use shared tournament identity, explicit app routing, URL tabs, detail sheets, and Passport highlighting
- Net Skins reads canonical NOT_CONFIGURED state while Calcutta retains its configuration gate
- PLAYER accounts are redirected away from the Director page
- Phase 2 public pages consume the shared scorecard analytics service
- Preview page and API use Supabase core with no Google fallback or Passport-named identity request
- Supabase Home does not register the legacy Trusted Devices install callback
- View Scorecard targets the canonical Game Center and preserves leaderboard return state
- analytics implementation digest requires an explicit version update
- both 2026 Team pages place one Tournament parent rail below the hero
- current Course Detail uses the Guide resolver while archive transport uses the explicit historical-course boundary
- current-read dispatch preserves frozen input and makes the pointer authoritative for future
- deep Career detail mounts locally on first expansion and remains mounted
- every callable mutation symbol remains on an exactly classified intent entrypoint
- full current standings disclose inline from the existing 24-row History payload
- legacy /api/live is explicit rollback/Production only and cannot be a Supabase fallback
- mobile and desktop Leaderboards share the canonical four-module contract
- overview model marks legacy Production controls and Preview tooling unavailable by construction
- participant shell uses selective idle prefetch while retaining explicit heavy-link control
- player profiles preserve draft history as display-only career context
- public desktop menu uses the original website navigation sections
- test/matchup-lab-ancillary.test.mjs
- the public site menu restores its original tournament footer without changing the PWA Hub

### Compiled mobile route inventory

| Route under `/api/mobile/v1` | Method | Classification |
|---|---|---|
| `auth/captcha` | GET | NATIVE AUTH |
| `auth/otp/certify` | POST | NATIVE CERTIFICATION |
| `auth/otp/request` | POST | NATIVE AUTH |
| `calcutta` | GET | NATIVE READ |
| `guide` | GET | NATIVE READ |
| `health` | GET | PUBLIC HEALTH |
| `history` | GET | NATIVE READ |
| `history/[year]` | GET | NATIVE READ |
| `leaders` | GET | NATIVE READ |
| `matches` | GET | NATIVE READ |
| `matches/[matchId]` | GET | NATIVE READ |
| `net-skins` | GET | NATIVE READ |
| `odds` | GET | NATIVE READ |
| `passport` | GET | NATIVE READ |
| `records` | GET | NATIVE READ |
| `schedule` | GET | NATIVE READ |
| `scoring/current` | GET | NATIVE READ |
| `scoring/finalize` | POST | NATIVE SCORING |
| `scoring/hole` | POST | NATIVE SCORING |
| `session` | GET | NATIVE READ |
| `today` | GET | NATIVE READ |

Compiled mobile routes: **21**. Unclassified: **0**. This exactly matches the security test inventory. Protected routes deny before external transport with absent controls. The only intentionally public surface is privacy-safe health.

Compile-only Next.js 15.5.18 build: **PASS**, exit 0. Existing CSS/autoprefixer and webpack warning serialization messages remain; no build error. No static participant data collection, live credentials, or provider operations were used.
