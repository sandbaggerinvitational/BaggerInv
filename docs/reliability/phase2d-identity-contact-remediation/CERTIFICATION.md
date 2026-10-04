# Local remediation certification — PASS

Base SHA: `5d053589fe29ea1db85219eaf5690749cfb3dca7`. This candidate changes fixed owner provisioning tools, local tests and evidence only. No application runtime, configuration, schema, migration, ACL, RLS, scoring, Director or authority predicate is changed.

| Gate | Result |
|---|---|
| Corrected fresh fixture | PASS: three contacts, context revision 1, truthful partial-roster import and identity audit, all in the original atomic fixture transaction |
| Preserved-fixture repair | PASS: exact original receipt/24-table snapshot required; three contacts plus four provenance/audit rows inserted; zero existing rows modified |
| Supported release rebind before repair | PASS: current deployment/release context used, original fixture receipt unchanged |
| Canonical identity | PASS for Director P01, participant A P12 and participant B P11 through actual unchanged Certification SQL projection and unchanged JavaScript resolver |
| Signed-out/unlinked/invalid identity | PASS: `AUTH_SESSION_REQUIRED` / `ACTIVE_USER_PLAYER_LINK_REQUIRED`; inactive/mismatched contacts, identifiers and memberships denied; client selection cannot switch verified subject |
| Owner-only/resource/deployment boundary | PASS: Production, old Preview and arbitrary registration requests denied; anon/authenticated/service_role invocation denied; wrong deployment/release/origin/CAS/binding/epoch/generation denied |
| Replay/conflict/atomicity | PASS: same request no-op; changed receipt/contact/fixture rejected; both required repair audit failures roll back all new rows |
| Catalog/security | PASS: full catalog unchanged, exact canonical manifest match for fresh fixture, function/trigger/owner/ACL/RLS/security modes/search_paths unchanged; private cores denied |
| Admission and ingress | PASS: fresh provisioning and repair leave controls byte-identical; separate local usability activation restored to disabled/PAUSED |
| Focused proof | **236 pass / 0 fail / 0 skip** across seven affected suites; 27 fresh-package cases and 32 preserved-repair cases |
| Broad regression | **4,077 pass / 20 established failures / 0 skip**; exact failure-identity and count match with base error-contract certification; zero new unexplained failures |
| Build | PASS, local Next.js build; credentials stripped, remote sockets denied, telemetry disabled |
| Source impact | 4,053 of 4,057 base tracked files byte-identical; only four existing provisioning/test files changed, plus bounded new package/test/evidence files. All application/schema/configuration/installed bootstrap content unchanged |
| Hosted action | **NONE**; no provider request, hosted mutation, deployment, rebind, repair, registration or admission change |
| 864-hole rerun | NOT REQUIRED: no tournament/scoring/domain impact |

Focused proofs use disposable managed-shaped non-superuser-owner PostgreSQL 17 fixtures. Auth verification uses modeled local verified subjects, not forged JWTs and not a claim of new hosted Auth proof. The exact unchanged canonical identity projection/resolver are exercised. Hosted sessions and shipping behavior remain for the owner-authorized resumed Part 2A.

Complete broad and build transcripts are retained as deterministic `evidence/application.tap.gz` and `evidence/build.tap.gz`; their decompressed SHA-256 values equal the respective JSON `rawSha256` fields. This preserves terminal carriage returns truthfully without source-diff whitespace errors. Summary JSON and failure-identity accounting remain readable without duplicating 30,425 regression transcript lines in the source diff.

Broad/build completed before one additional **test-only** case exercising the already-certified release-rebind function. No package/SQL/application content changed afterward. The new test is outside the 493-file broad selection and application build; broad/build are retained by that explicit source impact. The complete focused selection was rerun after the added case and passed. See `evidence/regression-accounting.json` and the per-run source manifests.

Initial local attempts exposed sandbox shared-memory restrictions and three ordinary harness issues: cookie-interface modeling, audit-count baseline after supported admission controls, and the exact existing wrong-tournament denial code. These were corrected only in the harness. No authorization predicate or implementation boundary was weakened. The final focused evidence supersedes those incomplete attempts.

Vercel's retained final-readback 403 is an independent credential issue. The locally inspected access-token expiry is `2026-10-04T13:41:32Z`; refresh credentials are present, but the direct REST reader did not invoke the CLI refresh flow. Refresh/reauthenticate normal CLI authorization before next hosted provider readback. No Vercel configuration change is indicated; this remediation performs no provider authentication attempt and does not independently revalidate historical provider rejection details.

The SQL package remains `bootstrap-certification-part2a-fixture-v1`; changed artifact hashes are truthful and bind the composed template/guards/contact SQL. The separate repair contract is `repair-certification-part2a-identity-contacts-v1`. The installed `bagger-canonical-bootstrap-v1` artifacts and hosted installation receipt are unchanged. No new persistent function/RPC/API or role is created.

Hosted checkpoint is preserved from accepted evidence: `trmcwrljjxwhgtikfdgu`, resource `CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51` revision 1, deployment `dpl_2WazmZVqcWXAudMEM9jXKweZ4JYH`, SHA `5d053589fe29ea1db85219eaf5690749cfb3dca7`, admission revision 7 disabled, Director disabled, ingress PAUSED, three synthetic Auth users, four players, two UPCOMING matches, zero scores/leases/unresolved or stranded required work. No new hosted readback is claimed.

Ready for owner review of deployment/rebind/preserved-fixture repair/resumed Part 2A. Follow [HOSTED-REPAIR-PLAN.md](HOSTED-REPAIR-PLAN.md). Do not execute automatically. The isolated branch's checked-in Git auto-deployment setting is false; evidence/candidate push must not be confused with deployment.

Production/old Preview/Google/messaging accesses and mutations: zero. Historical 048/057 remain unchanged and NOT REPRODUCIBLE FROM RETAINED EVIDENCE — NOT PROVEN; 069 remains unchanged. Full tournament, workers, side-game chronology, Odds publication, FinalRecap, annual transition, native Build 11 and Part 2B are outside this run.
