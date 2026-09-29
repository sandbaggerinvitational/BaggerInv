# Evidence ledger

Generated from local source-bound runner receipts by `node docs/reliability/phase2c1/collect-evidence.mjs`. JSON retains each implementation hash manifest; the execution Git HEAD is the unchanged base at test time, not a claim the uncommitted candidate was already that commit. CANDIDATE-MANIFEST.md binds the later source commit.

**Overall PARTIAL.** Exact capability limits are in CERTIFICATION.md and PROOF-MATRIX.md. No Production, hosted, physical, real Google or real-data proof was collected.

| ID / suite | Result | Tests / pass / fail / skipped | Stable source | Artifact |
|---|---|---|---|---|
| P2C1-E-ANNUAL | PASS | 26 / 26 / 0 / 0 | true | [receipt](evidence/annual.json) / [raw](evidence/annual.tap) |
| P2C1-E-APPLICATION | FAIL | 4159 / 3971 / 188 / 0 | true | [receipt](evidence/application.json) / [raw](evidence/application.tap.gz) |
| P2C1-E-BOOT | PASS | 1 / 1 / 0 / 0 | true | [receipt](evidence/boot.json) / [raw](evidence/boot.tap) |
| P2C1-E-BUILD | PASS | Build only | true | [receipt](evidence/build.json) / [raw](evidence/build.tap.gz) |
| P2C1-E-DEADLOCK | PASS | 10 / 10 / 0 / 0 | true | [receipt](evidence/deadlock.json) / [raw](evidence/deadlock.tap) |
| P2C1-E-DELIVERY | PASS | 54 / 54 / 0 / 0 | true | [receipt](evidence/delivery.json) / [raw](evidence/delivery.tap) |
| P2C1-E-FINITE | PASS | 7 / 7 / 0 / 0 | true | [receipt](evidence/finite.json) / [raw](evidence/finite.tap) |
| P2C1-E-FULL-SEQUENCE | PASS | 1 / 1 / 0 / 0 | true | [receipt](evidence/full-sequence.json) / [raw](evidence/full-sequence.tap) |
| P2C1-E-RECOVERY | PASS | 50 / 50 / 0 / 0 | true | [receipt](evidence/recovery.json) / [raw](evidence/recovery.tap) |
| P2C1-E-RETIREMENT-RELEASE | PASS | 2 / 2 / 0 / 0 | true | [receipt](evidence/retirement-release.json) / [raw](evidence/retirement-release.tap) |
| P2C1-E-RETIREMENT-SECURITY | PASS | 84 / 84 / 0 / 0 | true | [receipt](evidence/retirement-security.json) / [raw](evidence/retirement-security.tap) |
| P2C1-E-RETIREMENT-SQL | PASS | 8 / 8 / 0 / 0 | true | [receipt](evidence/retirement-sql.json) / [raw](evidence/retirement-sql.tap) |
| P2C1-E-RETIREMENT | PASS | 47 / 47 / 0 / 0 | true | [receipt](evidence/retirement.json) / [raw](evidence/retirement.tap) |
| P2C1-E-WORKER-LOCK-ORDER | PASS | 5 / 5 / 0 / 0 | true | [receipt](evidence/worker-lock-order.json) / [raw](evidence/worker-lock-order.tap) |

## Claim-to-evidence mapping

| Claim | Confidence / proof layer | Evidence | Limitation |
|---|---|---|---|
| Source retirement and canonical authority | PROVEN / SOURCE | GOOGLE-DEPENDENCY-REGISTER.md; CAPABILITY-REPLACEMENT.md | Not deployed; isolated Director replacement incomplete |
| No new Google jobs; financial/history rows preserved | PROVEN / POSTGRESQL | evidence/google-retirement-sql.json | Synthetic fixtures, upgrade path; no real account/Production inventory |
| All2017–2026 canonical History/Records service fixtures | PROVEN / INTEGRATION with injected canonical transport | retirement receipt; HISTORY-SOURCE-PROOF.md | Complete corrected real historical dataset NOT PROVEN |
| Compiled zero-credential boot | PROVEN / API localHTTP | boot receipt; evidence/zero-credential-boot.json | Synthetic nonfunctional provider config; no DB connectivity/authenticated Director proof |
|432holes/24Final without Google | PROVEN / POSTGRESQL + INTEGRATION | full-sequence receipt; evidence/revalidation/phase2c/full-sequence-results.json | Explicit synthetic admission boundaries; no hosted client/Prepare/Open rehearsal |
| Managed internal delivery | PROVEN at named test layers | delivery receipt and P0-B-RECERTIFICATION.md | Hosted scheduler/resource capacity unproved |
| Annual current/target contradiction | PROVEN / POSTGRESQL + SOURCE | evidence/annual-initialization.json; ANNUAL-INITIALIZATION.md | Expected-red reproduction is not annual initialization success |
| Bounded local score benchmark | Measured PERFORMANCE | benchmark-results.json and PERFORMANCE.md | Rollback samples/fsync off; local only; tails and variance reported separately |
| Missing Director replacement / compatibility | PROVEN SOURCE and failing broad contracts | CLIENT-COMPATIBILITY.md; application receipt/adjudication | Blocks advancement; no weakening of Production gates permitted |
| Identity fallback correction | PROVEN / UNIT + injected API | retirement-security; evidence/identity-admission-security-correction.json | No hosted identity proof |
| Historical external preservation | UNKNOWN | HISTORICAL-PRESERVATION.md | Real account never accessed; no deletion authorized |

Failing TAP outputs with significant whitespace are stored losslessly as gzip. [Storage manifest](evidence/raw-artifact-storage.json) maps original receipt paths and SHA256 to compressed files. Decompress before comparing rawSha256; no diagnostic bytes were trimmed.
