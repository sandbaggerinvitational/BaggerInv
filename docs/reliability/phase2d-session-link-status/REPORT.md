# Model D minimum session-link-status certification

STATUS: PASS — LOCAL ONLY. No hosted connection, installation, registration, deployment, Auth creation, fixture or competitive mutation occurred.

## Root cause and correction

`GET /api/participant/auth/session` previously requested `read_certification_runtime_context_v1` before discovering whether its provider-authenticated subject had an active canonical player link. The existing `READS` admission guard correctly denied inactive Model D; the route left that error uncaught and returned HTTP 500.

The new operation is `public.read_certification_session_link_status_v1(jsonb)` with private implementation `production_control.certification_session_link_status_v1(jsonb)`. Only the participant-session adapter uses it. It does not create a competitive context, invoke the legacy projection, alter admission, or return participant data.

The subject comes from an opaque WeakMap entry issued by the existing server `getClaims()` verification. A copied/fabricated result cannot select a subject; mutation of the returned claims cannot change the stored verified subject. Client query parameters and headers are not used as authority inputs.

A separate server attestation key is necessary: a service-role claim plus an asserted subject header alone would permit a bare service credential to fabricate the lookup. One new owner-only table, `production_control.certification_session_keys_v1`, holds a 32-byte key bound to resource, registration revision and authority epoch. It has RLS, no client/service grants, no policies and no competitive facts. This is the expressly allowed necessary private-table exception; **all 279 existing RLS tables, all existing policies and grants remain unchanged**. No role is created or broadened. The key is not the existing service credential and is never included in registration, response or evidence.

The transport signs the verified subject, exact resource/registration/schema/physical-project and full deployment/release envelope, epoch and timestamp. SQL requires service transport plus this proof, validates the current canonical binding under the shared admission fence, validates the current committed epoch and gate, and verifies the HMAC before reading `auth.users` or links. Proof lifetime is 60 seconds. Replaying a current read is harmless; it grants no authority and performs no application/control writes.

The closed registry admits the original exact Certification identity/project, or the existing receipt-backed registered Model D profile. Class/profile alone is insufficient. Production and old Preview are not admitted. Existing helpers, competitive guards and Queue engine scope are unchanged.

## SQL and response contract

Request body accepts only the fixed contract plus server-derived resource/deployment envelope; no target UUID, player ID, email, tournament or generic operation. Subject/proof headers are produced internally, not forwarded from the caller.

SQL result is exactly `{contract: "certification-session-link-v1", linked: boolean}`. It contains no player, email, team, match, permission, finance, Guide, projection, token or key.

| Case | Result |
|---|---|
| Signed out | Existing HTTP 200 inactive session; no link operation |
| Authenticated, no active link | HTTP 200 `{session:"inactive",identityAuthority:"supabase",code:"ACTIVE_USER_PLAYER_LINK_REQUIRED"}` |
| Linked, competitive disabled | Minimum fact true, then existing projection guard; typed HTTP 403 `CANONICAL_RESOURCE_DEPLOYMENT_DENIED` |
| Linked and current | Continues through the existing competitive path; positive continuation tested at the existing projection boundary |
| Wrong resource/project/release/deployment/origin/branch | Denied, never false/unlinked |
| Stale registration revision/authority epoch | Denied, never false/unlinked |
| Forged subject, missing/invalid/stale proof | Denied before subject/link lookup |
| Transport/database failure | Typed unavailable response, HTTP 503; not unlinked |

Production and ordinary Preview keep the old adapter, DTO and error behavior. Their positive/unlinked paths are tested as local boundary models, with zero contact to those environments. Original Certification unlinked and linked-disabled are tested against owned PostgreSQL. Actual linked Model D tournament acceptance remains deferred to D9/D10.

## Focused proof

Three grouped integration tests pass, with no skip. They exercise:

1. Shipping signed-out route and zero database reads.
2. Model D pre-fixture authenticated/unlinked route: zero players, teams, rounds, matches, scores and links.
3. Exact unlinked read replay and every application/control table hash unchanged.
4. Original Certification unlinked contract.
5. Model D linked-disabled: one minimal owned player/link; zero rounds, matches or scores.
6. Original Certification linked-disabled.
7. Linked-current continuation after an actual positive minimum fact, with existing projection boundary modeled.
8. Wrong resource, physical project, resource class and registration revision.
9. Wrong release, deployment, origin, branch and Vercel project.
10. Stale epoch, stale proof and unknown authority fields.
11. Fabricated/copied verified result, changed claims and cross-user proof tampering.
12. Existing and nonexistent alternate subjects produce the same proof denial.
13. Client target-user/player parameters denied or ignored by the shipping route.
14. Anon/authenticated public RPC denial and all client/service private-core denials.
15. Bare service credential without attestation, or with a fabricated assertion, denied.
16. Private key-table access denied to anon/authenticated/service_role.
17. Genuine transport failure remains HTTP 503 and sanitized.
18. Forward predecessor mismatch rolls back metadata changes.
19. Exact forward replay preserves full catalog and data.
20. Helper ACL, private-table RLS and private-table column drift reject with atomic rollback.
21. Owner key renderer contains no key material; setup replay is exact and conflict denied.
22. No player/match/private/financial data in the minimum response.

The minimal linked fixture is local authorization proof only, not D9 or D10 tournament proof.

BROAD: **4,077 pass / 20 established failures / 0 skip**. Exact failure identities match the preserved baseline; new unexplained failures: 0.

BUILD: PASS, offline, real credentials removed. 864-hole suite: NOT RUN.

Final installer-only replay guards were strengthened after broad/build. Focused tests were repeated. `evidence/final-candidate.json` proves the final shipping runtime, installed SQL schema and catalog hashes still match the broad/build certificates.

## Forward and future fresh-install lineage

Required hosted forward artifact: `supabase/production_incremental/certification-session-link-status-v1.sql`.

It is owner-only, transactional, predecessor/body/metadata guarded, replayable and mismatch-rollback tested. It adds two functions and one private control table, without changing any prior function or catalog record. Future fresh images therefore contain **1,160 functions and 280 RLS tables**: all prior 1,158 functions/279 RLS tables plus the two functions/private RLS table. These are additions, not normalized-away differences.

The consolidated Model D image/manifest is regenerated from committed forward history. Private key rows are **not** in the image/static data. Historical migrations and historical canonical bootstrap are unchanged. Existing hosted installation receipt, registration and image digest must not be rewritten; the new artifact is a forward installation there, not a reinstall.

The owner-only key renderer is `tools/reliability/certification-session-key.mjs`. It opens no connection and offers no RPC. It validates the closed server registration and real bound epoch, requires OFF/disabled/paused, initializes only the exact private key row, supports exact replay, and denies conflicts.

Future privately supplied Model D-only runtime prerequisites:

- `BAGGER_CERTIFICATION_SESSION_ATTESTATION_KEY`: fresh random 32-byte hexadecimal key, supplied privately to the owner package and Preview runtime; never Git/evidence/CLI arguments.
- `BAGGER_CERTIFICATION_SESSION_AUTHORITY_EPOCH`: exact current canonical epoch, matched to that private key row.

Missing configuration fails closed. A different epoch requires separately reviewed owner key handling; it never returns false/unlinked. No keys have been created/configured on any hosted resource by this task.

## Source and preservation

BASE: `a9bf1cce7d8ece199182603dc79e2eff4cf2959e`.
SUCCESSOR: the single commit containing this report; exact SHA is returned to the owner after commit.
PUSH: NO.
WORKTREE: `/private/tmp/bagger-worker-provider-portability`.

Application files: session route, `lib/participant-session-context.js`, `lib/certification-runtime-server.js`, `lib/supabase-auth-server.js`. Supporting changes: new forward SQL, regenerated Model D image/manifest/catalog, image compiler forward list, owner key renderer, focused certification tool/test, existing PWA test adapter seam and evidence/report.

All prior catalog records remain exact, including dependency content/multiplicity. Model D registration, catalog verifier, branch containment, existing forward SQL, Queue publisher/consumer/worker engines, FinalRecap, Net Skins, Calcutta, Odds, scoring/domain mathematics, fixture and dependencies are unchanged. Protected file count and final source hashes are recorded in `evidence/final-candidate.json`.

## Hosted / readiness

HOSTED MUTATED: NO. HOSTED CONTACT: NONE. DEPLOYED: NO. SQL INSTALLED: NO.
Model D project: `heoqynwlmqiejyxdmbmv`; preserved deployment: `dpl_DWVEwModvAbbmZbdQt7UKjozAa6J`.
Fixture/player links remain the supplied checkpoint's zero; Auth users unchanged. OFF/disabled/paused is preserved without contacting the resource. Production/original Certification/old Preview/Google/real messaging: no access/effects.

READY FOR HOSTED INSTALL/DEPLOY AND D7–D8 COMPLETION: YES.
READY FOR D9: NO. READY FOR D10: NO.

NEXT OWNER ACTION: Authorize Model D-only installation of the reviewed session-link-status forward SQL, owner-only private attestation-key initialization and its two exact Model D Preview configuration fields, push/controlled deployment of this certified successor, safe release/deployment rebind, hosted signed-out and authenticated-unlinked repro, completion only of remaining D7–D8 gates, and return to OFF/disabled/paused. D9/D10 remain unauthorized.
