# Participant-context error-contract remediation

**Status: PASS — local remediation only. Hosted Part 2A remains incomplete.**

Base: `3f6793c0d79ec19cbb8a22f7c66cacd18edc2492` on
`codex/reliability-phase2d-staging-admission`.

## Root cause and bounded correction

`resolveSupabaseParticipantIdentity` throws the exported
`ParticipantIdentityResolutionError`. Its constructor maps
`AUTH_SESSION_REQUIRED` to HTTP 401 but does not attach `authority`.
The participant-context route previously translated errors only when
`error.authority.resolved` was `supabase`. The missing optional metadata
therefore produced generic HTTP 503 despite the correctly denied session.

The route now identifies that existing error class with `instanceof` and
uses the unchanged `participantIdentityPublicError` translation. Existing
authority metadata handling remains for other errors. Error names, codes
or status fields alone do not qualify an unrelated exception as that class.
The successful response and private/no-store headers are unchanged.

Only `app/api/participant/context/route.js` changes shipping behavior.
The shared helper, resolver, Auth, resource selection, Director authority,
admission, scoring, RLS, private cores, schema, migrations and fixture
bootstrap remain unchanged. No new role or capability exists.

The directly related participant home, My Match and Player Passport
session/initialize/matches routes already translate this error family
without the same optional-metadata gate. They need no correction.

## Executed local contract proof

The new test executes the actual shipping GET route and actual resolver,
with local Auth and canonical-read boundaries. It does not contact a
provider or use privileged credentials. The request deliberately contains
client-selected player/resource query parameters; successful identity
still comes from the verified synthetic Auth UUID.

| Case | Local result |
|---|---|
| Signed out | 401, `AUTH_SESSION_REQUIRED`, no canonical read |
| Authenticated but unlinked | 403, `ACTIVE_USER_PLAYER_LINK_REQUIRED` |
| Linked participant | 200, unchanged context and response headers |
| Typed authorization failures without authority metadata | Certified 401/403 and typed codes |
| Typed context/service unavailability | 503 and typed unavailable code |
| Internal exception, connection failure, untyped lookalike | Generic 503; no authorization misclassification |
| Wrong physical resource | Existing fail-closed 503 before Auth/DB lookup |
| Non-Preview route | Existing 404 before authority resolution |
| All typed denials | No participant/private fields or internal error message |

Before the fix, the same 25-case regression reproduced 18 failures;
7 unaffected cases passed. After the fix all 25 pass. The affected
participant identity, impersonation, Auth boundary, Certification adapter
and resource registration selection passes **159/159**, including those
25 new cases. See the exact selected files and source hashes in
[focused.json](evidence/focused.json).

## Security and impact

Signed-out access remains denied. Participant and Director authority,
resource validation, admission predicates, database grants/RLS and private
cores are unchanged. Related authorization/security tests pass; this run
does not claim new hosted RLS or scoring proof.

The source comparison finds 4,047 existing tracked files unchanged and
only the route changed. All 838 existing files in the protected
library/schema/configuration/tool/native groups and package/Vercel
configuration group are unchanged. See
[source-impact.json](evidence/source-impact.json).

The correction does not reach domain/scoring semantics. The prior
tournament evidence is retained; no 864-hole rerun is required or run.
Protected historical 048/057 positive replay remains
**NOT REPRODUCIBLE FROM RETAINED EVIDENCE — NOT PROVEN**; those migrations
and the 069 correction are unchanged.

## Regression and build

The retained 493-file broad selection yields **4,077 pass / 20 established
failures / 0 skipped / 0 cancelled**. Every failure identity matches the
accepted baseline; new unexplained failures: **0**. The broad process
exit is 1 because those 20 failures remain; accounting passes. The new
25-case regression is outside that retained selection and reported
separately. See [regression-accounting.json](evidence/regression-accounting.json)
and [application.json](evidence/application.json).

Next.js build: **PASS**, exit 0. Retired historical-loader and static
sitemap-unavailable log counts match the retained build baseline; no
Google or remote connection occurs. See [build.json](evidence/build.json).

Runs strip provider/credential environment variables, disable Next
telemetry and preload `tools/reliability/phase2-network-deny.cjs`.
Test commands use `--conditions=react-server --test --test-reporter=tap
--test-concurrency=1` with the recorded selections. Build uses
`node node_modules/next/dist/bin/next build`. The temporary orchestration
script and raw TAP/build logs remain outside Git under `/private/tmp`;
their hashes and exact proof-source hashes are in the receipts.

## Hosted boundary and push safety

No hosted request or mutation, deployment, release rebind, fixture
mutation, activation, Vercel change, schema change, Production access,
old Preview access or Google access occurred during this remediation.

The owner-provided hosted checkpoint is preserved:

- Certification project: `trmcwrljjxwhgtikfdgu`.
- Deployment: `dpl_2eEXgMpUdo9FGJZstCyU8k1b1q91`.
- Deployed SHA remains the base above.
- Scoring/Director admission DISABLED; ingress PAUSED.
- Synthetic fixture preserved: 4 players, 2 UPCOMING matches, 0 scores.
- Active leases, unresolved outcomes and stranded required work: 0.

The unchanged `vercel.json` disables Git auto-deployment for this exact
branch. No deployment workflow exists in the repository. This candidate
may be pushed without deploying it. Secret scan scope/results are recorded
in [secret-scan.json](evidence/secret-scan.json); raw secrets are excluded.

## Next owner action

**AUTHORIZE DEPLOYMENT OF THE PARTICIPANT-CONTEXT ERROR-CONTRACT CANDIDATE,
SAFE CERTIFICATION RELEASE REBIND, AND RESUMPTION OF PHASE 2D-P PART 2A
FROM THE PRESERVED HOSTED FIXTURE.**

Do not deploy or resume hosted Part 2A without that separate authorization.
