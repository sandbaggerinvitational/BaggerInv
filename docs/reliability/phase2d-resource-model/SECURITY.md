<!-- CURRENT_R2_FINAL_CHECKPOINT -->
**Current final local status: PASS at the accepted R2 scope; all six Phase2 score-path P0 gates close at that layer.** Ready for owner review before separate Phase2D-P.048/057 exact positive historical proof remains an accepted NOT PROVEN limitation. See [CERTIFICATION.md](CERTIFICATION.md), [EVIDENCE.md](EVIDENCE.md) and [069 review](069-COMPATIBILITY-REVIEW.md). Older statements below remain historical evidence, not new approval requests or current totals.
<!-- END_CURRENT_R2_FINAL_CHECKPOINT -->

# Certification resource security design

> **October2 implementation addendum — PARTIAL, not final security certification:** the design below is preserved as the original authority rationale. Approved implementation now exists. Actual seven-capability Director/financial integration, scoped two-resource Odds and mixed-round Net Skins negative tests pass at the source hashes in [EVIDENCE.md](EVIDENCE.md). Full final-profile annual, release, Production equivalence and install/runtime proof remain incomplete. The old statement that no source/migrations/tests changed describes the original design checkpoint only. Hosted physical identity and credential provenance remain NOT PROVEN.


Status: **PROPOSED — OWNER REVIEW REQUIRED.** This is a design at application base `7cec5128409286f5b4a5f3524d4c5488124a7be7`, not security certification. No source, migrations, tests, credentials, hosted resources, or Production resources were changed. SOURCE observations below are PROVEN by the cited repository code; enforcement proposed below is NOT PROVEN until implementation and runtime tests pass.

## Boundary and existing enforcement

One physical database contains exactly one canonical resource. `PRODUCTION` and `CERTIFICATION` are the only proposed resource classes. This is not a tenant selector. Physical database, Auth, storage, credentials, receipts and jobs are separate. A database cannot switch class after registration and cannot register a second resource. Table names and constraints are governed by [RESOURCE-MODEL.md](RESOURCE-MODEL.md).

Current source anchors:

| Source | Actual authority behavior | Design consequence |
|---|---|---|
| `lib/canonical-runtime-source.js` | Ordinary hosted Preview permits only the exact old Preview hostname; local development permits loopback. Diagnostic and cutover branches are separately admitted. | Add an explicit certification admission branch; never turn arbitrary environment URL equality into registration. Invalid explicit certification selection must stop selection before diagnostic/cutover/old Preview fallback. |
| `lib/participant-identity-authority.js` | Preview identity requires server/public Auth URL agreement plus canonical resource eligibility. Production has separate activation, captcha, rate-limit and credential gates. | Preserve Production branch exactly. Certification requires registered resource, exact public/server credential provenance and synthetic identity; it must not inherit Production identity gates or credentials. |
| `lib/supabase-auth-server.js`, `lib/supabase-auth-browser.js` | Client configuration checks URL/key presence; server verifies Auth claims using that configured project. | Presence does not establish resource identity. Validate build public settings against registered resource before emitting a browser bundle, and bind server Auth creation to the same admitted context. |
| `lib/isolated-director-operations.js` | Server binds actor, tournament and binding ID; rejects privileged client payload fields; verifies expected context/revision and readback. | Preserve actor and payload restrictions. Bind context to the singleton certification resource instead of the current Production-scoped pointer. |
| `202609300128_isolated_director_context_v1.sql` | Owner-only binding table; service-only public wrappers; owner-only private cores; exact local/old Preview check; `BAGGER_INV_PRODUCTION` current pointer dependency. | Retain this compatibility contract unchanged. New certification gateways bind resource-local authority through the new registration/admission tables. Keep equivalent actor/domain predicates, ACLs, lock ordering and shared canonical core use. |
| `lib/scoring-shadow.js` | Transport permits several independently admitted paths, including legacy shadow gate and read-only diagnostic translation. | A certification request must use only the verified certification transport/allowlist; it cannot borrow another path when its admission fails. |
| `lib/score-derived-delivery.js` | Supported current worker resolves Production dispatch and calls existing processors. | Add separately admitted certification dispatch; reuse worker algorithms. Never provide fabricated Production dispatch metadata. |
| `app/api/director/future-tournaments/route.js` | Returns unavailable outside Production; authorizes Production entitlement and cutover. | Keep route semantics; add a certification route and admitted wrapper around shared canonical annual business logic. |

## Trust anchor and the project-not-created sequence

The proposed trust anchor is a **checked-in, owner-reviewed exact resource registration manifest**, loaded as application code/data. It is not a JSON object supplied by a request, a mutable environment manifest, a remote registry discovered at runtime, or a matching pair of arbitrary URLs. No new signing service or PKI is proposed.

1. Initial implementation has no enabled hosted CERTIFICATION registration. Its default is unavailable. Local tests may dependency-inject synthetic manifests only through test-owned transport/registry seams; no environment flag exposes those seams in shipping runtime.
2. A later separately authorized preparation task creates the dedicated Supabase project and independently verifies its exact identity. Creation itself grants no application authority.
3. Owner review approves an exact registration entry: logical resource ID, class CERTIFICATION, exact Supabase ref/HTTPS origin, immutable database installation ID, expected Vercel team/project/branch and deployment class, schema contract/digest, and resource revision. Expected team/project are `team_kPw5zaib8uaQJALAwj4fWI6R` / `prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU`; the exact final deployment branch must be recorded, not inferred from its prefix. Credentials are identified by non-secret digests backed by verified project-side provenance; values are never committed.
4. That registration is a reviewed source commit. Affected local admission, schema, compatibility and security checks rerun. **This commit produces a new final deployment candidate after resource creation.** The design deliberately gives up the earlier assumption that the final deployable SHA can be fixed before the resource exists.
5. Owner-only database registration records the same resource identity, manifest digest, installation identity and schema contract. The runtime service role cannot register, modify, activate or reclassify a resource. The installer and its authority are separate from runtime credentials.
6. After the final application commit exists, a separately approved exact release/admission record binds that SHA and deployment origin to the registered resource. The manifest does not attempt to contain its own Git hash. Installation/registration alone does not enable scoring or workers.
7. Future hosted preparation compares Vercel management metadata, branch/commit, project-side credential provenance and read-only database registration readback before activation. No hosted verification occurred in this task.

The proposed chain is: owner-reviewed manifest → exact physical project and installed singleton registration → separately admitted deployment/release → server-bound current/governance context → actor entitlement → allowed operation → atomic receipt/audit. A missing link yields unavailable/denied, never another provider or resource.

## Deployment and credential proof limits

Environment strings and a `Host` header alone are not cryptographic evidence of where code executes. An attacker with ordinary HTTP input cannot create the chain, but a privileged operator possessing the service key can copy configuration. The design does not claim to defend a compromised deployment administrator, database owner or stolen service credential. Those credentials require protection, project isolation and later revocation procedures; generic tenant RLS would not solve that threat.

Exact Vercel team/project/Preview/branch/SHA/origin comparison is required, with management-plane readback before hosted activation. **The selected design does not add OIDC, a token exchange, or a new attestation service.** It relies on the owner-reviewed registration plus protected deployment credentials and independently checked hosted metadata. Runtime comparisons detect wrong configuration; they do not prove execution location against a privileged actor who can copy credentials and impersonate the complete approved runtime. If protection against that privileged actor is later required, it is a new reviewed security scope, not an implicit guarantee of this model. No hosted attestation capability was inspected or assumed in this repository-only review.

A nonempty secret, a JWT-looking string, a decoded JWT `ref`, and an `sb_secret_` prefix do not prove project ownership. The future preparation task must associate keys with the dedicated project through its authorized provider inventory and an accepted read-only registration handshake at the exact pinned HTTPS endpoint. Key digests detect accidental substitution after that evidence; they do not create provenance. Public keys are not privileged credentials, and secret/service keys must never enter `NEXT_PUBLIC_*`, client JSON, logs or source. This retains the public/server credential separation already used by the inspected Auth adapters; actual future hosted key provenance remains unverified.

## Admission, operation and revocation

The registration must reject URL credentials, ports, query, fragments, paths other than `/`, suffix/substring matches, redirects to another host, and Production refs/origins. Server and public Auth target must be exact matches to the one registered resource. Certification selection accompanied by Production shadow/cutover/foundation/ingress/publication/worker authority is a configuration conflict, not a routing hint. Google/legacy workbook configuration cannot confer authority. Resource class/ref/origin/installation identity is immutable. Ordinary key rollover requires closed admission, owner-reviewed key provenance and manifest revision, and affected proof; it does not relocate the resource or require a new database. Runtime service credentials cannot perform that rollover.

Read-only registration lookup occurs only after local manifest/transport checks; no capability may auto-create missing schema or registration. The server validates schema contract, installation ID, manifest/resource revision, admission status, release commit and activation epoch from bounded exact lookups. Mutation wrappers recheck resource/admission/current pointer and domain revisions under existing locks; caching cannot authorize a write after revocation. Long-lived workers rebind each claim/tick. If read admission is cached at all, its maximum staleness and revocation behavior must be explicit and tested; unlimited process-lifetime trust is prohibited.

Actor identity comes from verified Auth and canonical account linkage, membership and entitlement inside the admitted database. Client claims cannot select resource, role, actor, release, governance tournament or authority epoch. Existing Director non-impersonation, owner-only annual actions, setup/handicap/match/permission/financial revisions, CAS, ingress/leases, Lock/Final/readiness rules and financial privacy all remain. Client operation IDs and expected revision tokens are assertions to compare against server authority, not authority themselves.

Current public score DTOs need not gain a resource selector. Score mutation/recovery, worker job/status and financial readback operations operate against the one admitted database/context. Identical mutation/job IDs in another physical database do not grant read or replay authority here. A payload copied between projects must fail actor/context/resource checks even if both fixtures use identical tournament IDs.

## Database privilege proof required

Use current canonical domain cores without duplicating rules. New resource-context assertions and private cores remain unavailable to PUBLIC, anon, authenticated and runtime service callers. Only separately admitted public wrappers receive the precise required EXECUTE grants. No broad schema grant is a substitute for function-level review. Keep resource registration and activation installer-only.

Before any implementation PASS, inspect `pg_proc`, function owner, `prosecdef`, `proconfig/search_path`, `proacl` with inherited PUBLIC privileges, `pg_depend`, nested callers, schema ownership, table ACLs, RLS policies and function replacement OIDs. Demonstrate direct private-core calls fail under anon/authenticated/service-role, admitted wrappers succeed, and wrongly admitted service-role calls fail. SECURITY DEFINER must be justified per function and use safe fixed search_path/qualified objects. Test ordinary database roles rather than only the installer/superuser.

Resource registration is not a replacement for RLS. Existing participant row access, privacy projections and Director authorization remain. With one resource per database, broad `resource_id` columns on every domain row are unnecessary. Any resource-aware control FK or audit reference must resolve to the singleton installed resource. Financial and public read projections must be field-for-field compared with the base; never expose auction/purchase/ownership data through a generic registration/status response.

## Proposed negative and compatibility proof matrix

All rows below are **NOT RUN** and release-blocking for the future implementation where applicable.

| Case | Required outcome / layer |
|---|---|
| Empty registry, unknown manifest entry, missing DB registration/schema, wrong schema digest | 503/unavailable; no alternate transport; UNIT + PostgreSQL + API |
| Arbitrary new ref, Production ref, old Preview ref paired with certification registration | Denied before capability RPC; UNIT + no-network integration |
| URL substring/suffix/userinfo/port/path/redirect trick | Denied; exact parsing and transport proof |
| Wrong public URL/key, wrong server key, correct key name with wrong digest/provenance | Denied; local modeled negatives, actual future hosted credential proof |
| Wrong team/project/branch/Preview class/SHA/origin, stale admission/resource/release revision | Denied/conflict, no silent rebind; integration + release compatibility |
| Client adds resource/project/actor/role/governance or nested privileged field | 400/403 and no write; API |
| Signed-out, spectator, participant, unlinked/revoked/impersonating Director, wrong tournament | Existing denial semantics; API + PostgreSQL under actual roles |
| Production/certification Auth token crossover | No account admission, even with identical user/player IDs; API + Auth contract |
| Receipt, context token, mutation ID or financial revision copied between physical resources | No data disclosure or replay; two-database integration |
| Certification worker pointed to Production manifest; job/lease ID copied between resources | Denied before claim/ack/process; two-database worker proof |
| Read-only context attempts score/control/publication; wrong RPC allowlist | Denied, zero writes; PostgreSQL + API |
| Missing/failed canonical read or optional telemetry | Typed canonical failure, no Google/Production fallback, no unjustified session reset |
| Failure after score or financial mutation before receipt/audit; retry same/different request | Atomic rollback or durable confirmed outcome; no false provenance; failure injection |
| Registration changes during mutation/worker claim | Locks/revision guard prevents stale commit; deterministic concurrency |
| Old Production wrapper on upgraded Production resource | Same admission/denial, response/error shapes, result and audit semantics as base |
| Direct core invocation/ACL default regression/new nested caller | Denied for every non-owner role; catalog and behavioral proof |
| Zero Google configuration/network plus full synthetic sequence | 432 holes, 24 Finals, no Google jobs, no stranded required automatic work; retained rules |

Unknown hosted key provenance, actual deployment attestation, messaging isolation and provider settings remain future proof gates. None is inferred PASS from this design.

## Future execution source review checkpoint

Forward140 keeps frozen2026 admission separate from future resource admission. The protected current context must match the physical registered Certification resource and current pointer. Future runtime checks retain the existing annual allowlist, ACTIVE catalog/runtime generation, exact pointer/lifecycle/runtime/authority/admission revisions, canonical Supabase authority and side-game readiness. The Certification annual authority must reference its immutable Certification initialization origin, and its durable ingress generation must match the same resource, tournament, pointer and authority epoch. Mutation admission requires OPEN. Private cores have no direct PUBLIC, anon, authenticated or service-role EXECUTE grant; the original Production public OIDs, owners, ACLs, security modes, search paths and volatility are checked during installation. These are installation assertions, not evidence that installation has already passed.

Future actor validation preserves the original verified Auth link/contact, membership, identity binding, global-owner existence, Director role/entitlement and match-permission predicates. The existing synthetic `.example` identity fixture conforms to the old contact policy; no email-policy relaxation is introduced. Recovery remains separate and origin-bound. Fresh admission installs its resource context before the actor check; exceptions must atomically roll back the marker and any attempted admission. No participant, spectator or signed-out caller acquires a new capability.

Future `MATCH_CONTROL` reads expose only established match/control fields. They do not expose the broader setup or financial projection. Forward141 admits only the already-declared derived-worker operation IDs, retaining leases, retries, hashes, configuration/result CAS and owner-controlled Net Skins/publication boundaries. It reuses the physical resource ID in nested enqueue/readiness helpers; the Production helper still returns the fixed Production resource. All these changes require runtime negative tests, installed owner/ACL/search-path/pg_depend inspection and Production-equivalence proof before security can be marked PASS.

## Focused final-review checkpoint — October2, SOURCE layer only

- `canonical-resource-registration.js` selects only the checked-in exact registration; missing/invalid explicit Certification selection fails before another provider. The shipping manifest remains disabled/null. Public/server key digests, exact resource URL/ref, team/project/branch/class/release/deployment and conflicting Production/Google configuration are checked. These comparisons do not prove hosted credential provenance against a privileged operator; that remains future management-plane proof.
-131 stores the operation marker in an RLS-protected private table bound to backend PID and transaction ID. Nested callers must retain exact phase/mutation/context token/operation/actor. The current-context accessor revalidates the original admitted request; ordinary client-set session variables are not authority. Exception rollback and explicit pop preserve transaction locality. Final database ACL/owner/dependency proof must still cover the complete emitted profile.
-143 receipt replay/recovery performs resource and exact original-actor/target checks independently of fresh current-release mutation admission. It cannot execute a new historical mutation. Publication remains explicitly separate from calculation/worker/annual processing. The new client `operationTournamentId` is an untrusted receipt selector, not a current-resource override; fresh writes require its agreement with current server authority.
-145 closed History requires completed same-resource annual lineage and unchanged finalized snapshot authority.146 routes only four already-defined current public read surfaces to the current admitted successor and leaves the existing public domain functions unchanged. Runtime positive proof after genuine annual advance is pending; source assertions alone do not close it.
-144 is owner-only SECURITY INVOKER with explicit runtime EXECUTE revocation and exclusive existing admission fence. Its valid initial request currently fails closed. Initial/reopened/closed-generation selection and outgoing Odds drain are pending exact approvals/proof, not completed security gates.

No new runtime role, client-selected resource authority, Google fallback, native source change or Production access is introduced by these inspected paths. This is a scoped review conclusion, not a replacement for the required negative runtime matrix.

## New configuration surface

| Configuration | Purpose / authority effect | Secret | Hosted scope and default |
|---|---|---|---|
| `BAGGER_CERTIFICATION_RESOURCE_ID` | Explicitly selects an already checked-in approved registration; cannot create authority | NO | Future dedicated branch only; absent uses existing non-Certification selection, invalid explicit value denies rather than falling back |
| `config/certification-resource-registration.json` | Reviewed immutable project/install/team/project/branch/schema/key-digest descriptor | NO secret values; credential digests only | Currently disabled/null; future resource creation and exact registration require separate owner review/source commit |
| Existing `VERCEL_*`, public Auth and server Supabase variables | Must match that exact registration and admitted database release | Server key secret; public key is nonprivileged | No usable Certification secret default; missing/mismatch unavailable; no hosted setting changed here |
| Test-only `BAGGER_R2_*` controls | Owned local fixtures/evidence/transport | Synthetic values only | Not consumed by shipping runtime, not a hosted authority mechanism |
