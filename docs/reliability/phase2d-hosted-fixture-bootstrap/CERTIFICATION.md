# Hosted synthetic fixture bootstrap — local certification

**PASS at the local remediation layer. Hosted execution is not authorized by this result.**

Base application: `1ae328f8fb4e303af4e6ad18cb9de1ee09bb209f`. Existing hosted resource: `trmcwrljjxwhgtikfdgu`, `CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51`, revision 1. This run made no hosted requests or changes. The last verified hosted checkpoint remains disabled/PAUSED with three unlinked synthetic Auth users and no players, matches or scores.

## Proof

| Gate | Evidence | Result |
|---|---|---|
| Exact fixed resource and approved identities; no arbitrary loader | Renderer rejection plus independently embedded SQL descriptor/identity guards | PASS |
| Owner execution; anon/authenticated/service_role denied | Actual owned PostgreSQL execution under each role; owner runtime impersonation denied | PASS |
| Exact deployment, release, epoch, binding and revisions | Wrong-context transactions rejected without fixture/control changes | PASS |
| Admission disabled and gate PAUSED | Enabled/open negative transactions rejected; before/after controls equal | PASS |
| Managed non-superuser owner and provider Auth privileges | Local Supabase-shaped `postgres` is not a superuser; only retained existing provider privileges modeled | PASS |
| Three confirmed synthetic Auth links and one Director entitlement | Fixed UUID/email verification; unconfirmed/non-synthetic Auth denied; exact inserted fixture | PASS |
| Minimum fixture | Four players, two teams, one Singles round, two matches, 18 course holes, 36 match holes | PASS |
| Replay/conflict/drift | One audit receipt; exact replay changes nothing; conflicting fingerprint or fixture drift denied | PASS |
| Required audit atomicity | Injected local audit failure rolls back every fixture row | PASS |
| Catalog/security parity | All catalog sections equal before/after and equal certified portable manifest | PASS |
| Private cores | Actual anon/authenticated/service_role denial probes | PASS |
| Later canonical usability | Separate explicit **local** activation; canonical setup/read, full-roster pairings, Net Skins/Calcutta reads and scoring-context preparation via admitted wrappers/leases | PASS |
| Dormant state and no work | Package leaves controls unchanged, scoring permissions revoked, scores/jobs/publications zero | PASS |
| Remote/Google execution | Credential-stripped proof process with remote Node sockets denied; package contains no network/provider operation | PASS |

`evidence/focused.json` records **178/178 pass**, including 27 fixture integration cases. `evidence/local-proof.json` records the actual database cases, audit/package fingerprint, fixture counts and catalog/control parity. Auth claims are modeled in the owned local database; no new hosted Auth/session proof is claimed.

`evidence/application.json` records **4,077 pass / 20 fail / 0 skip**. All 20 failure identities equal the established baseline; `evidence/regression-accounting.json` records zero new or unaccounted failure identities. `evidence/build.json` records build PASS. The final additional fixture usability assertion changed only the new integration test, which is outside the frozen 493-file broad selection and the application build; those successful source-stable results remain valid.

The broad raw TAP is retained locally at `/private/tmp/bagger-fixture-retained-raw/application.tap`, and the byte-original build log at `/private/tmp/bagger-fixture-retained-raw/build.tap`; their SHA-256 values are recorded in their run receipts and `evidence/final-review.json`. This preserves provider progress-line carriage returns without altering raw evidence to satisfy Git whitespace checks. Concise machine receipts and the focused log are committed. The final review confirms all 4,034 base tracked files unchanged and zero secret leakage across the added files and retained logs, including comparison with securely read local credential values without output.

## Impact and identity

Only the new provisioning renderer/template, local test/runner and this evidence package are added. Existing tracked application, configuration, schema, migrations and bootstrap artifacts remain byte-identical to the base. No grant, RLS policy, function owner, security mode, search_path, dependency, public API or competitive receipt contract changes. All 1,117 function ACLs retain their certified manifest, including the 444 anon/authenticated denials, 162 service_role denials and 17 intentional PUBLIC grants.

The bootstrap version remains `bagger-canonical-bootstrap-v1`; its artifacts, manifest and existing hosted installation receipt are unchanged. The added provisioning package has a separate content digest in its owner audit receipt. It is not a bootstrap reinstall or receipt rewrite. Historical 048/057 remain NOT REPRODUCIBLE FROM RETAINED EVIDENCE — NOT PROVEN; their predicates and migrations are unchanged. The approved 069 correction is unchanged.

No 864-hole rerun is required: no installed function/schema or scoring/domain behavior changed. This proof establishes construction, guards and compatibility of the small fixture, not hosted scoring or a full tournament. Part 2A must still exercise real hosted Auth/RLS, shipping Director/scoring APIs, lifecycle, recovery and safe shutdown after separate execution authorization.

The fixture is intentionally UPCOMING and unprepared, with revoked permissions. It does not falsely assert that scoring context has already been prepared. Later activation and shipping Director operations perform that work under existing authority. Nominal synthetic Calcutta configuration is empty and unpublished; no real financial fact or completed result is created.

## Owner checkpoint

Follow [RUNBOOK.md](RUNBOOK.md) only after approval to deploy the remediation candidate, safely rebind its **real** Certification deployment, execute the owner fixture package and resume Part 2A. Deployment alone does not run it. Re-read all expected revisions and managed Auth privileges before execution; any mismatch stops, with no permission repair or SQL editing.

The isolated branch already has Git deployment disabled in `vercel.json`; there is no GitHub workflow in this repository. Pushing this candidate does not authorize or request a new deployment. No Vercel configuration was changed. Existing hosted admission remains DISABLED and ingress PAUSED; no users, tournament scores, workers, Odds, FinalRecap or annual operations were executed in this run.
