# PN-2: Production native admission (source candidate; NOT activated)

PN-2 descends from PN-1 `64e936a6464d0b106be32f66a1f8cb3b8cee3ccd`.
No deployment, provider configuration, schema application, real authentication,
score, worker, or Apple operation belongs to this change.

## Baseline and separation

On September 8, 2026, read-only Vercel alias/deployment metadata identified
`baggerinv.com` as deployment `dpl_FHUVhSNUCqA3JtRr5nKbRX39KPXA`, commit
`c0d8267b5803e20348a2de0e1ebe22e1304e0b2f`, source branch
`codex/advisory-prediction-team-symmetry`, READY/Production. Relative to PN-1's
Production parent `bffd4a621c2d8bca88153c7bb6c6f2206ce8e62d`, that release changes
only prediction-engine/war-room advisory calculations and supporting evidence.
Admission, identity, current tournament and scoring authority are unchanged in
that diff. PN-2 deliberately retains its authorized PN-1 ancestry. Any eventual
deployment must deliberately reconcile then-current releases and follow the
existing normal-release resource rebind process; this is not authorization to
deploy an older advisory implementation over Production.

Only `/api/mobile/v1` entry points consume these gates. No web/PWA handler,
canonical authorization/persistence adapter, existing Production control module,
Google admission fence, worker, or Preview authority implementation changes.

## Environment and live authority

Environment recognition requires exact `VERCEL_ENV=production`, existing
Production activation/resource approval (canonical origin `https://baggerinv.com`,
Vercel project, expected/runtime Git SHA, Production project and workbook,
existing phase/credentials), exact Auth and scoring service origins at the
Production Supabase project, matching server credentials, and Supabase identity.
Preview never uses this path; its original exact project/workbook checks remain.

Protected requests also require the canonical HTTPS request host and
`X-Bagger-Mobile-Contract: bagger-production-native-v1`. This header is only a
compatibility claim. It grants no capability or identity. Request player,
tournament, environment and capability claims cannot configure server gates.

Admission reads the existing read control inspector, existing scoring admission
inspector, and existing current-tournament resolver, with no persistent or
request-shared cache. It validates SCORING_COMMITTED/OBSERVATION, Supabase identity
and current reads, matching deployment/resources and activation revision,
current active tournament, supported admission protocol, closed legacy admission,
and the configured authority/admission generations. Partial snapshots fail closed.
The platform inspector's frozen 2026 scope is existing platform infrastructure;
the current participant tournament is selected exclusively by the existing
current-tournament resolver, including annual generation handling.

Reads require all mobile read selectors to explicitly select Supabase. This also
prevents historical/career service selectors from choosing a Google foreground
path. Auth/certification require the existing Turnstile, rate-limit and disabled
public signup prerequisites. Native does not perform controlled first-time
enrollment; its existing-user OTP behavior retains `shouldCreateUser:false`.

Scoring additionally requires the Supabase scoring selectors, canonical ingress
enabled/open and NORMAL maintenance. SCORING_MAINTENANCE can suspend mutations
while retaining reads/auth/certification under valid identity/read authority.
An unknown maintenance state denies all protected capabilities. Canonical match
authorization, revisions, idempotency, receipt, epoch and finalization checks
remain mandatory after native admission. Native health never substitutes for them.

## Control source and default OFF

The server-only `PRODUCTION_NATIVE_CAPABILITIES` JSON document is the native
control source. It uses the existing server-environment deployment model, not a
new database control plane. Do not add it to any live environment in PN-2.
Its exact fields are:

| Field | Required value/type |
|---|---|
| version | `bagger-production-native-v1` |
| environment | `production` |
| apiOrigin | exact canonical Production HTTPS origin |
| projectRef | exact existing Production Supabase project |
| deploymentCommit | approved runtime Git SHA (40 lowercase hex characters) |
| revision | positive JSON integer; operator audit revision |
| revocationGeneration | 16–80 ASCII letters/digits/underscore/hyphen |
| capabilities | exactly `reads`, `auth`, `certification`, `scoring`, each JSON boolean |

Missing, malformed, unexpected-key, unsupported-version, wrong-resource,
wrong-release, or false values never enable access. Only boolean `true` admits a
configured gate; strings such as `"true"` or `"false"` invalidate the document.
Environment identity is recognizable without this document. No configuration
file sets any live value in this candidate. Revision is an audit label, not a
new monotonic database authority; deployment binding rejects stale release
approvals. Operators must retain configuration changes in the existing provider
audit/release process. A same-release configuration replay is an operator action,
not something a client can request. Do not reuse revocation generations after
revocation or roll them backward during an environment rollback.

Independent switches require no iOS update. **Environment-backed switching takes
effect through a server configuration rollout, not instantly across already
running Vercel instances.** Use the existing certified release/rebind process,
verify the serving alias and retirement/rejection of old deployments, and certify
the propagation/drain boundary before activation. No native admin write route or
provider automation is introduced. PN-2 does not claim an instantaneous database
transactional native kill switch.

## Public health

`GET /api/mobile/v1/health` preserves Preview's original response. Production
uses `contracts/mobile/v1/production-health.schema.json` and returns only:

- `ok`, `apiVersion`, `service`, `environment`, `contractVersion`;
- `compatibility`: COMPATIBLE / AUTHORITY_INCOMPATIBLE / CLIENT_UPDATE_REQUIRED;
- safe identity/current-tournament authority designations;
- four effective capability booleans;
- scoring AVAILABLE / SUSPENDED / MAINTENANCE.

Valid authority plus all native controls absent yields 200/COMPATIBLE/all false.
Wrong or unreadable authority yields 503 and all false. A supplied unsupported
client contract yields 503/CLIENT_UPDATE_REQUIRED/all false. Health itself does
not require a client contract header. It makes only read-only control inspections;
it neither authenticates a participant nor enables a gate. Scoring suspension
does not invalidate an otherwise compatible read environment. An enabled gate
advertises admission, not a particular participant's eligibility or match rights.

No deployment SHA/ID, operational revision, generation, workbook, database row,
participant, credential, or secret name/value is returned. All health responses
are no-store. Protected errors use the existing bounded mobile error envelope.

## Every route

All paths below have prefix `/api/mobile/v1/`.

| Method | Route | Gate |
|---|---|---|
| GET | health | Public compatibility only |
| GET | auth/captcha | Auth |
| POST | auth/otp/request | Auth |
| POST | auth/otp/certify | Certification |
| GET | session | Reads + bearer/certification |
| GET | today | Reads + bearer/certification |
| GET | matches | Reads + bearer/certification |
| GET | matches/[matchId] | Reads + bearer/certification |
| GET | leaders | Reads + bearer/certification |
| GET | schedule | Reads + bearer/certification |
| GET | guide | Reads + bearer/certification |
| GET | passport | Reads + bearer/certification |
| GET | history | Reads + bearer/certification |
| GET | history/[year] | Reads + bearer/certification |
| GET | records | Reads + bearer/certification |
| GET | odds | Reads + bearer/certification |
| GET | net-skins | Reads + bearer/certification |
| GET | calcutta | Reads + bearer/certification |
| GET | scoring/current | Reads + bearer/certification + canonical scoring read checks |
| POST | scoring/hole | Scoring + bearer/certification + canonical mutation checks |
| POST | scoring/finalize | Scoring + bearer/certification + canonical mutation checks |

There is no separate committed Players route. Score Current is intentionally a
read: an existing authenticated client can reconcile committed state with scoring
OFF. Scoring can independently progress with Reads OFF only if the bearer,
certificate, canonical identity, permission and all scoring checks succeed.

## Certification and containment

Preview keeps its exact `v1` signature message and key. Production uses `v2p`, a
distinct domain-separated JSON signature message and the server-only
`PRODUCTION_NATIVE_CERTIFICATION_SIGNING_SECRET`. Reusing the configured Preview
key is rejected. Production signatures bind environment, project, contract,
verified Auth UUID, canonical player, current tournament, issue/expiry time,
nonce, revocation generation, pointer/lifecycle and annual runtime generations.
No identity fields or operational generations are exposed in the opaque token.
The lifespan remains twelve hours; future clock skew is bounded to sixty seconds.
Deployment SHA and general activation revision are deliberately not signed:
ordinary compatible releases need not log everyone out. Existing identity/link
and membership revocation remains checked on every authenticated request.

Issuance requires the certification gate plus a verified canonical OTP challenge,
verified user, rate checks and canonical identity. Issuance is rechecked after
asynchronous work. Closing certification denies new/renewed proofs; it does not
invalidate existing valid proofs for other enabled capabilities. Rotating the
native revocation generation or signing key rejects older proofs after rollout.

Closing Reads denies subsequent reads, including Session and Score Current;
pending read responses recheck before returning content or 304. Closing Auth
denies new initiation and rechecks before OTP delivery; existing authenticated
readers do not depend on this switch. Closing Scoring denies new and retried
mutations/finalizations before canonical persistence, including a second check
after canonical match authorization. A server-branded identity ties that check
to the authenticated request/context. Reads recheck pointer/generation context;
mutations retain existing transactional authority checks.

Already executing canonical transactions may finish if admitted before the
effective shutdown boundary. This environment-backed layer does not cancel
transactions, remove committed scores, revoke Supabase sessions, drain queues,
disable post-commit delivery for committed work, or reopen Google. A client must
keep a pending score intent uncommitted until acknowledged/reconciled; native
offline UX and effective rollout/drain timing remain later certification items.

## Database and next boundary

NO DATABASE CHANGE REQUIRED. No migration is prepared/applied. Existing inspector,
current-runtime, identity, mobile read and scoring functions/grants still require
live read-only conformity verification before limited activation. Missing or
incompatible functions deny native admission. Inspectors are read-only by source;
PN-2 tests use synthetic transport responses, not a live database certification.

Recommended next boundary: **live database capability/grant conformity verification**
against the final candidate requirements. This can run read-only while native
polish continues. Keep Reads/Auth/Certification/Scoring OFF. Do not activate gates,
deploy, send email, create users, issue real certificates or submit scores as part
of that verification without separate authorization.

Deferred: controlled enrollment/coverage; SMTP delivery/capacity; native Turnstile
and edge rate-limit certification; limited read/auth/cert/scoring activation;
canonical first-write/idempotency/finalization lifecycle; mirror/archive physical
destination/readback; runtime switch propagation; Production iOS contract/storage
configuration; bundle/signing; reviewer authentication and downstream isolation;
TestFlight, App Review, and public rollout.

## Validation scope

Run Node tests with `NODE_OPTIONS=--conditions=react-server` in an environment
without real provider credentials. `test/pn2-native-admission.test.mjs` covers
all capability combinations, controls, canonical authority mismatch, all 21 route
classifications, default denial before transport, real wrapper inspection via
synthetic fetch, public schema/privacy, certification crossover/expiry/revocation,
bearer insufficiency, identity denial, independent switches, and scoring checks
before persistence. Preview/PN-1/Production authority regressions are separate.
No live or local database migrations/transactions are executed by these tests.
Compile with Next's compile-only mode to avoid production static data reads.

Observed local validation: 357/357 required tests passed across 34 files,
including 18 PN-2 security/admission tests. The broader non-database-integration
suite ran 3,256 tests across 424 files: 3,223 passed and 33 failed. All 33 failing
test names match the recorded PN-1 baseline failures; none are new to PN-2.
After the final deployment-ID/rehearsal/UUID rejection tightening, the required
suite and compile-only build both passed again. Existing CSS warnings remain.
No unrelated baseline failures were repaired. Database integration tests were
excluded; live schema/provider/rollout certification is not implied by this result.
