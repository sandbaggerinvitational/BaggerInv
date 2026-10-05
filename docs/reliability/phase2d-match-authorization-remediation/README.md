# Certification match-authorization adapter remediation

Base: `6b1961aea632d5c5a29d6809b090b711d7c8e580`. Local implementation and proof only. Hosted Certification was not queried, mutated, deployed, rebound, activated or processed during this task. Its four captured cycle-3 jobs remain pending. No local proof substitutes for their hosted drain.

## Root cause and existing contract

`POST /api/player-passport/matches` resolves the provider-authenticated player with the canonical participant identity resolver, then calls `authorizeMatchAccess`. That shared helper previously always submitted the logical `authorize_match_access` alias to `scoringShadowRpc`. Certification's explicit read alias map does not admit that alias, so it raises `CERTIFICATION_LEGACY_RPC_FORBIDDEN`; the route's blanket transport catch returned `503 / AUTHORIZATION_UNAVAILABLE`. No access was authorized.

The existing installed contract already provides `public.read_certification_projection_v1(jsonb)` with `READS.CURRENT_VIEW`, surface `MATCH_AUTHORIZATION`. Its canonical dispatch uses `public.read_match_authorization_matrix`, whose rows call `scoring_authority.match_access_decision(tournament, player, match, action)`. The old public alias calls that same private decision core. The matrix is a server-only response; this correction selects exactly one complete native decision and returns only that decision to the shared helper's callers. It does not implement match eligibility in JavaScript.

## Bounded change

Only `lib/match-authorization-supabase.js` and the error catch in `app/api/player-passport/matches/route.js` change shipping behavior. Certification resolves its registered READS context; START_SCORING additionally checks the existing SCORING capability/open-ingress context. Both tokens must agree. The projection repeats resource, deployment, admission and token validation in SQL. An absent exact tournament/player/match/action tuple is denied; duplicate or malformed decisions remain unavailable. The native DTO, including match/context/permission revisions, is preserved. No full matrix/private data reaches the route response.

The route accepts only the bounded adapter's typed errors as public authorization failures. Known binding/context/ingress denials return sanitized 403/409 responses. Generic/internal/provider failures remain `503 / AUTHORIZATION_UNAVAILABLE`. Signed-out and unlinked requests continue through the unchanged identity resolver before authorization and keep their 401/403 errors. Client body player/resource/deployment fields never select the server's actor or resource.

No SQL is required. No RPC admission map, historical migration, bootstrap, installation receipt, registration descriptor, private function, ACL, owner, security mode, search_path, RLS policy, role, scoring rule or authority control changes. `authorize_match_access` and arbitrary legacy RPCs remain forbidden in Certification. Production still translates the logical alias to `authorize_production_current_match_access_v1`; ordinary Preview still calls its legacy alias. The non-Certification adapter branch is unchanged.

## Directly related path inventory

- `POST /api/player-passport/matches`: writable and finalized scorecard session authorization; only its error catch changes.
- `lib/scoring-participant-authorization.js`: finalized read-only session revalidation uses the shared helper. Used by `/api/scoring/session`, `/api/scoring/diagnostics`, `/api/scoring/current` and `/api/scoring/matches/[matchId]`. Writable session revalidation already uses canonical SCORING.READ_PARTICIPANT_CONTEXT; it is unchanged.
- `lib/mobile-v1-scoring.js`: shared authorization for `/api/mobile/v1/scoring/current`, `/hole`, `/finalize`; source, identity and error contracts remain unchanged.
- `lib/mobile-v1-production-match-detail.js`: Production-only match-detail shared helper, reached from `/api/mobile/v1/matches/[matchId]`; existing Production selector and non-assignee read semantics remain unchanged. No native shipping source changes.
- `/api/live-matches` already reads the explicitly admitted matrix; no correction is required there.

## Security proof boundaries

Authentication, contact/link/current membership and actor separation remain the canonical resolver's responsibility. The decision core owns match assignment/lifecycle/lock/permission revision. A newly issued signed scoring session is independently revalidated against Auth identity and current permission before scoring. Current generation, ingress lease, stale match revision and transaction authority remain enforced by the unchanged scoring gateway at execution. A scorecard authorization read does not create a durable ingress lease or authorize a later stale write. Read-only final access retains the READS contract and cannot grant writable scoring.

The local integration uses an owned disposable PostgreSQL 17 database and the existing R2 synthetic model. Only provider Auth verification and HTTPS transport are modeled. Actual shipping route/session code, identity resolver, shared adapter, canonical resource envelopes and public SQL wrappers execute. Neither a provider-issued hosted session nor hosted scoring is claimed. Canonical catalog comparison proves no object/ACL/RLS/ownership/security/search-path changes.

## Validation

Result: **PASS**. Focused **220 pass / 0 fail / 0 skip**; broad **4,077 pass / 20 established failures / 0 skip**, exact established failure identities and **0 new unexplained failures**; build **PASS**. Preliminary failures were resolved local harness/setup issues (control DTO nesting, cleanup reference, multiple setup output lines, and the supported scoring-unlock action), plus the local sandbox shared-memory restriction. None was an application or authority defect. Only local test harness files changed after broad/build; the two shipping files have identical hashes across all three final receipts. Final results are in `evidence/focused.json`, `canonical-proof.json`, `application.json`, `failure-accounting.json`, and `build.json`. The established application selection has 493 files; new decisive adapter/route/database cases run separately in focused proof. Remote sockets are denied and inherited credentials removed. No 864-hole chronology: no scoring calculation, match lifecycle core, domain schema or mutation contract changes.

## Exact next hosted sequence — not executed

1. Reconfirm the preserved Certification checkpoint and the four exact cycle-3 job tuples/source revisions. Confirm disabled scoring/Director admission, paused ingress, zero leases/claims/UNKNOWN/dead letters and unchanged isolated branch configuration. Source-only correction: no forward SQL or bootstrap replay.
2. Deploy the exact newly reviewed candidate to the existing isolated Certification Preview project/branch; verify READY, team/project, branch, SHA and generated origin. Preserve existing protection and provider configuration.
3. Use the certified owner-only release rebind while disabled/paused. Verify zero unresolved ingress and no outgoing Odds work under migration 144's existing release fence. The four Competition/Intelligence jobs are not the Odds jobs checked by that fence; retain their exact captured tuples/source revisions for the separately bounded drain. Never edit rows or bypass the rebind contract. Verify exact new binding and idempotent replay.
4. Activate only through the existing Certification owner operation. Reproduce POST /api/player-passport/matches using Participant A's real hosted session on its permitted LIVE match. Verify exact native authorization/session DTO, Participant B's cross-match denial, signed-out denial, disabled/paused and stale-context denials at their certified boundaries.
5. Continue shipping scoring, receipts, canonical readback, duplicate/conflict, lock/reopen, one lawful 18-hole Finalize and recovery/concurrency gates. Preserve completed Part2A proof; do not complete the second match/tournament.
6. At the approved safe processing window drain only the four captured required cycles via the existing bounded Competition and Intelligence processors, respecting source drift, attempt/backoff/maximum-five attempts and stop conditions. Do not enable autonomous scheduling. Newly eligible work requires truthful classification and scope authorization; never suppress or manually complete it. FinalRecap remains ineligible and unprocessed; Odds publication remains zero.
7. Resolve all deliberate uncertainty/leases/claims, verify no stranded required work, and disable scoring/Director admission and pause ingress through certified owner controls. Preserve fixture/users/receipts/audits. Stop before Part2B.

## Retained hosted checkpoint

Project `trmcwrljjxwhgtikfdgu`; resource `CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51`; deployment `dpl_HJacbg8kWUypsMC5iG7qTiJ1N9bC`; SHA `6b1961aea632d5c5a29d6809b090b711d7c8e580`; admission revision 20 disabled; ingress paused. `2026-R3-12` LIVE revision 3 with two structurally active permissions; `2026-R3-11` UPCOMING revision 0. Scores, active claims/leases, unresolved outcomes and dead letters zero. Four current cycle-3 automatic jobs pending. Global admission and ingress keep competitive mutation unavailable. These are retained owner/previous-run facts, not a new hosted readback.
