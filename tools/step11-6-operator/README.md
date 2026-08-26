# Step 11.6 / Step 12 Operator Bundle v2

This is an inert, repository-local payload generator for the admission-hardened
Step 12 runbook. It does **not** connect to GitHub, Vercel, Supabase, Google, or
any other provider. It has no credential reader, provider SDK, HTTP client, SQL
client, or mutation executor. Its only outputs are sanitized JSON payloads and
SQL text envelopes for an independently authorized operator to review.

The authoritative runbook is
[`docs/step12-production-cutover-runbook-v2.md`](../../docs/step12-production-cutover-runbook-v2.md).
This tool does not grant Step 12 authorization and cannot execute that runbook.

## Fixed scope

The tool refuses any resource tuple other than:

- Production Supabase: `ymqhhtxaywtqllynrmxe`
- Production workbook: `1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4`
- Vercel project ID: `prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU`
- Vercel project: `bagger-inv`
- Canonical domain: `https://baggerinv.com`
- Tournament: `2026`

Preview project/workbook identifiers are forbidden. Payload generation also
refuses secrets, tokens, private keys, cookies, and credential values.

## Commands

Copy `manifest.template.json` to a separate sanitized evidence file and replace
placeholders only with values captured by the certified diagnostics. Never put
secrets in that file.

```sh
node tools/step11-6-operator/operator.mjs validate --manifest ./step12-v2.json
node tools/step11-6-operator/operator.mjs readiness --manifest ./step12-v2.json
node tools/step11-6-operator/operator.mjs fingerprint --manifest ./step12-v2.json
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation inspect
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation inspect-scoring-admission
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation stage-release
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation read-cutover
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation identity
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation arm-legacy-admission
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation issue-begin-provider-attestation-challenge
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation inspect-begin-provider-attestation-challenge
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation begin-provider-quiesce
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation issue-finalize-provider-attestation-challenge
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation inspect-finalize-provider-attestation-challenge
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation finalize-provider-quiesce
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation inspect-provider-quiesce
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation inspect-persistent-provider-fence
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation install-persistent-provider-fence
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation record-provider-fence
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation close-legacy-admission
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation drain-legacy-admission
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation capture-final-google-fingerprint
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation finalize-legacy-closed
```

`inspect-scoring-admission` is an owner-authorization-exempt, service-only,
read-only diagnostic envelope for
`inspect_production_scoring_admission`. It carries only the exact Production
project URL/ref, workbook, tournament, and environment scope. It has no actor,
stable mutation request ID, or optimistic write fields. Map its authoritative
response into the sanitized manifest as follows; do not infer these values from
an application deployment or browser session.

| RPC response field | Manifest/diagnostic use |
|---|---|
| `ok`, `contract_version` | Require `ok=true`; retain the exact admission contract version as evidence |
| `activation_state` | `state.activationState` |
| `activation_revision` | `state.activationRevision` |
| `authority_generation_id` | `state.authorityGeneration` |
| `staged_request_fingerprint`, `staged_payload_hash` | `state.stagedRequestFingerprint`, `state.stagedPayloadHash` |
| `staged_certification_fingerprint` | `state.stagedCertificationFingerprint` |
| `staged_environment_delta_fingerprint_v2` | `state.stagedEnvironmentDeltaFingerprintV2` |
| `scoring_authority` (`authority` is its compatibility alias) | `state.scoringAuthority` |
| `scoring_ingress_enabled` | `state.scoringIngressEnabled` |
| `execution_gate` | `state.gateExecutionState` |
| `admission_state` | `state.admissionState` |
| `admission_protocol_enforced` | `state.admissionProtocolEnforced` |
| `admission_generation_id` | `state.admissionGeneration` |
| `admission_revision` | `state.admissionRevision` |
| `admission_deployment_id` (`deployment_id` is its compatibility alias) | `state.admissionDeploymentId` |
| `active_closure_id`, `active_closure_kind` | `state.activeClosureId`, `state.activeClosureKind` |
| `active_closure_status` | `state.activeClosureStatus` |
| `external_fence_evidence_id` | `state.externalFenceEvidenceId` / exact external-fence receipt |
| `active_legacy_writers` | `state.activeLegacyWriters` |
| `unresolved_legacy_writers` | `state.unresolvedLegacyWriters` |
| `ambiguous_google_writes` | `state.ambiguousGoogleWrites` |
| `partial_google_writes` | `state.partialGoogleWrites` |
| `legacy_unclassified` | `state.legacyUnclassifiedWriters` |
| `v2_unresolved` | Aggregate v2 unresolved diagnostic; retain it as cross-check evidence and do not substitute it for any exact count above |
| `unresolved_outbox`, `unresolved_archive` | `state.unresolvedOutbox`, `state.unresolvedArchive` |
| `lease_set_fingerprint` | Current diagnostic lease-set evidence; it is not a substitute for the finalized closure boundary |
| `first_supabase_canonical_write_possible` | `state.firstSupabaseCanonicalWritePossible` |
| `first_supabase_canonical_write_observed` | `state.firstSupabaseCanonicalWriteObserved` |
| `first_supabase_canonical_write_possible_at`, `first_supabase_canonical_write_observed_at` | Preserve as timestamp evidence; never infer the booleans from participant reports |
| `active_closure_high_watermark` | Drain/high-watermark evidence for the exact active closure |
| `external_google_writer_fence_centrally_enforced` | Diagnostic only; the durable provider-fence proof remains separately required |
| `captured_at` | Authoritative snapshot timestamp |

The database activation revision/generations and this protected diagnostic are
the authority for current state. The manifest is a sanitized local projection,
not a source of truth.

The challenge response is the only attester request source. Do not create or
edit a challenge nonce locally. Install the persistent signer once, store its
public pin in the exact candidate environment, and sign each BEGIN/FINALIZE
request independently:

```sh
node tools/step11-6-operator/vercel-provider-attester.mjs install-keychain-signer
node tools/step11-6-operator/vercel-provider-attester.mjs attest \
  --request ./begin-provider-challenge-response.json \
  --output ./begin-provider-attestation.json
node tools/step11-6-operator/vercel-provider-attester.mjs attest \
  --request ./finalize-provider-challenge-response.json \
  --output ./finalize-provider-attestation.json
```

The private Ed25519 key is generated in memory and stored only in macOS
Keychain service `com.baggerinv.step11-6.vercel-provider-attester`, account
`production-vercel-provider-attestation-ed25519-v1`. The installer first reads
that exact item, derives its public key/fingerprint, and returns
`recovered=true` without overwriting it when it already exists. Initial storage
uses `/usr/bin/security -i`, with `-i` as its only argv value. An exact add-only
interactive command is sent through stdin with a single versioned
`STEP11_6_ED25519_PKCS8_B64_V1_<base64url>` secret token, the fixed item
identity/label, and `-T /usr/bin/security`. It never uses `-U` or `-A`. The same
trusted executable then reads the item back; the token is strictly decoded,
canonicalized, and parsed as Ed25519 PKCS8 material. Readback is authoritative:
a generated-key match is the new install, while a different valid exact signer
is recovered as a concurrent/existing item regardless of the interactive
shell's outer exit status. It is never overwritten.
Both the read and add subprocesses have fixed fail-closed timeouts; a timed-out
add is killed and resolved only by the same bounded, verified Keychain readback.
The key is never placed in argv, logs, or a file. A duplicate or lost helper
response is resolved by validating the exact existing item; an invalid duplicate
fails closed. There is no private-key file option. Output files are created once
with mode `0600`; copy
each complete signed envelope into the matching sanitized manifest challenge
record.

The local reader invokes the repository-installed authenticated CLI as
`npx --no-install vercel api`; a global Vercel binary is not required. It uses
only these GET-only contracts:

- `/v1/security/firewall/config?projectId=…&teamId=…`
- `/v6/deployments?projectId=…&teamId=…&limit=100[&until=…]`
- `/v9/projects/{projectId}/env?teamId=…`

Deployment pagination follows the official `pagination.next` cursor until it
is explicitly null; a repeated cursor, 100-page nontermination, unrelated
branch deployment, missing retained tuple, or unclassified post-freeze tuple
fails closed. The Vercel CLI exposes JSON bodies rather than response headers,
so the signed metadata records header dates/request IDs as unavailable and
preserves the body ETag where present. References:
[Vercel REST API](https://vercel.com/docs/rest-api),
[Vercel Firewall API](https://vercel.com/docs/vercel-firewall/firewall-api),
and [Vercel API integrations](https://vercel.com/docs/integrations/create-integration/vercel-api-integrations).

The Step 12 provider sequence is intentionally separate from the restored
Step 11.6 rehearsal. First complete stage, static-backend, read, identity, and
current-read cutover. Arm the barrier-aware candidate so the exact dedicated-
credential deployment is `GOOGLE_LEASE_ARMED`, admission is `OPEN`, the v2
protocol and gate are `OPEN`, and the candidate controls live traffic. Only
then, immediately before recording external fence evidence and closing, begin
the project-wide Vercel writer quiesce. Wait for at least 300 seconds, finalize
and inspect its durable evidence, inspect the Google provider baseline, and
install the persistent fence. This ordering keeps the deliberate Vercel 403
window short and never applies it to the old V0 deployment path.
Do not remove the temporary project-wide deny merely because sheet protections
were installed. Before removal, the signed provider proof must bind
`docs/evidence/step11-6-production-google-credential-confinement.json` exactly:
1,140 classified origins, records fingerprint
`c63962703a60745786ffce2e43e9fef5fa38e12746fce5627f33bfde92c8f508`,
and evidence fingerprint
`1d6f4203fc56226ba4f6881339e9b2dfcede0e413485a110785d28e066a569df`.
That proof establishes zero dedicated-writer markers in all 458 retained main
Production SHAs; exact Preview environment denial/read-only confinement for the
681 executable retained Preview records; one provider-BLOCKED deployment with
zero builds, functions, and aliases; and exact-SHA/branch/target plus v2 database
admission for every signed post-capture candidate. Redacted environment
metadata is necessary but is not treated as sufficient by itself. If any
artifact, provider scope, or candidate binding drifts, leave the deny in place,
keep authority unchanged, and stop.

The browser payload uses `quiescePurpose=CUTOVER` and supplies only an explicit
owner-freeze confirmation plus the exact certified
`ownerFreezeTtlSeconds=1800`. It does not
supply authoritative acknowledgement/expiry timestamps or unresolved-write
counts. The route timestamps the freeze and the database derives and validates
the zero-unresolved predicates.

## Step 12 environment delta v2

The final Step 11.6 reproducibility/diagnostics patch adds **zero new
environment variables**. Its deterministic environment-delta material records
`newEnvironmentVariables: []` and binds the exact Production resources,
release identity, provider-control constants, retained inventory and credential-
confinement evidence, and migration name/SHA. The following six non-secret
provider controls were already part of the hardened contract and remain
disabled/blank by default in `.env.example`; they are existing bindings, not
new additions in this final delta:

- `PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_REHEARSAL_ENABLED`
- `PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_EXPECTED_COMMIT_SHA`
- `PRODUCTION_VERCEL_PROVIDER_ATTESTATION_ED25519_PUBLIC_KEY`
- `PRODUCTION_VERCEL_PROVIDER_ATTESTATION_TEAM_ID`
- `PRODUCTION_STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ENABLED`
- `PRODUCTION_STEP12_GOOGLE_WRITER_PROVIDER_FENCE_EXPECTED_COMMIT_SHA`

The first pair is candidate-only Step 11.6 evidence, the middle pair pins the
local signer and Vercel team, and the final pair is the separate Step 12
persistent-fence gate and exact-SHA binding. No credential or secret value is
fingerprinted. The Ed25519 private key remains only in the authorized new Mac's
exact macOS Keychain item. The material instead binds the public signer
fingerprint, exact Vercel team, signed redacted environment-scope fingerprint,
credential-confinement evidence fingerprint, and additive migration
`202608260038_production_provider_preview_target_inventory_v4.sql` with exact
SHA-256
`32cc5994570aaa77679b19e14a71a917dcc7fe297bc559ebe82dd320bff94c4c`.

## Fingerprint dependency and lifecycle

The `fingerprint` command returns these claims in dependency order:

1. `environmentDeltaFingerprintV2`, computed independently of all fingerprint
   claims;
2. `certificationFingerprint`, computed for the final DORMANT Step 11.6
   snapshot using the computed environment fingerprint and the exact
   `certification`, restored rehearsal, quiesce, state, resources, and release
   material, excluding its own claim and the execution claim; and
3. `executionBundleFingerprintV2`, computed after injecting the first two
   claims into the manifest material.

At DORMANT readiness and `stage-release`, all three claims must exactly match
their computed material. The mutable
`execution.step12OwnerAuthorizationRecorded` flag is excluded from every
fingerprint: recording the later explicit Step 12 authorization does not alter
the certified bytes, although mutating payloads still refuse while the flag is
false.

After `stage-release`, preserve `environmentDeltaFingerprintV2` and
`certificationFingerprint` byte-for-byte as the historical claims bound by the
stage transaction. Final DORMANT readiness and the stage payload require the
four protected `state.staged*` provenance fields to be null. The database
atomically stores the stage request fingerprint, payload hash, certification
fingerprint, and environment-delta fingerprint in protected activation state.
After stage, hydrate `state.stagedRequestFingerprint`, `state.stagedPayloadHash`,
`state.stagedCertificationFingerprint`, and
`state.stagedEnvironmentDeltaFingerprintV2` directly from
`inspect_production_scoring_admission`. The operator rejects every non-DORMANT
manifest without all four fields and rejects any later certification or
environment claim that differs from the protected database values.

Update state/evidence only from protected diagnostics and durable receipts, then
run `fingerprint` and replace only
`executionBundleFingerprintV2`. In a non-DORMANT manifest the command carries
the historical certification claim forward rather than recertifying mutable
cutover state. Every non-diagnostic envelope verifies the exact environment
claim and current execution material; `stage-release` additionally recomputes
and verifies the DORMANT certification material. Operation inputs may neither
override the stage claims nor carry them into later RPCs. If immutable release,
resource, provider, migration, certification, or rehearsal material changes,
stop and perform explicit recertification; do not call it a routine execution
rebind.

Migrations `202608260036_production_reviewed_post_capture_preview_deployments_v2.sql`
and `202608260037_production_provider_rpc_name_and_inventory_v3.sql` together
install the narrow recovery contract for an expired, unconsumed BEGIN
provider-attestation challenge and its PostgREST-safe inspect RPC. Inspection and abandonment are service-role
operations bound to the exact original Director, Production resources,
candidate, rule, purpose, and request identities. Abandonment shares the same
database transition lock as consumption, uses database time, rejects every
consumed or progressed challenge, preserves an immutable `ABANDONED` row and
audit event, and is idempotent under a lost response. Browser recovery retains
the request identity and may clear the old cycle only after the exact
authoritative `ABANDONED` receipt. It never deletes a challenge or treats a
local-storage reset as recovery.

The install consumes `quiesceEvidenceId` and leaves exactly 17 whole-sheet
protections installed. Those protections remain installed through external-
evidence record, close, final Google capture, prepare, commit, and any supported
rollback. Stage does not carry provider-fence IDs because they do not exist yet.
The close/prepare/commit artifacts bind the installed quiesce, fence, and
verification IDs.

The retained origin inventory is
`docs/evidence/step11-6-production-origin-inventory.json`: 1,140 exact v2
tuples (458 main Production plus 682 feature-branch Preview) with digest
`533178a28a5458c5f2f727b77af3024de4cc0402c49e90dcd763b950d26fb4c6`.
It binds complete pagination evidence, the prior live deployment, the frozen
Step 11 candidate, nine provider-resolved CLI SHAs, one provider-proven
non-executable blocked deployment with a null SHA, scope/status semantics,
and credential-capability sets. The operator revalidates only its repository
binding and refuses caller-supplied origin matrices/fingerprints. The control
route loads the artifact server-side and additionally requires the seven exact
reviewed post-capture Preview deployments pinned by additive migrations
`202608260035_production_reviewed_post_capture_preview_deployments.sql` and
`202608260036_production_reviewed_post_capture_preview_deployments_v2.sql`
plus `202608260037_production_provider_rpc_name_and_inventory_v3.sql` and
`202608260038_production_provider_preview_target_inventory_v4.sql`. Their
ordered tuple-set fingerprint is
`91cdd7ab6fc077cb422c4b8921a0ac431ddf38f043167c457cc7ad4cc288a01a`.
The provider reader binds Vercel v6's exact Preview encoding: a Preview
deployment has an explicit JSON `target: null`; a missing target or a non-null
target is not silently classified as `FEATURE_PREVIEW`.
Only provider-signed same-current-SHA deployments in the target-appropriate
scope may extend that required set; all other additions fail closed. The route
then adds four fixed aliases and the current candidate alias. If the signed
live inventory has `N` immutable origins, each snapshot
contains exactly `N + 5` origins and `9 × (N + 5)` edge requests. Every
retained and signed post-freeze origin is probed, including `ERROR`
and `BLOCKED` records. The vectors cover `POST` on all eight
historical/candidate writer routes plus `DELETE /api/tournament-guide`. It
writes the immutable inventory and compact per-origin nine-vector proofs to the
durable RPCs. The database validates the exact signed live origin set, coverage
mask, ordered per-vector proof fingerprints, and dynamically derived logical
origin×vector expansion. The minimum Step 11.6 signed live inventory is 1,148
immutable origins (1,140 retained + 7 reviewed + 1 exact dynamic candidate),
which produces 1,153 probed origins and 10,377 requests per snapshot after the
five fixed/candidate aliases. A normal Step 12 Preview-plus-Production candidate
pair adds at least one more same-SHA immutable origin, producing at least 1,154
probed origins and 10,386 requests. The provider-signed inventory and durable
receipt remain authoritative when additional exact same-SHA redeploys exist.

The five alias entries are fixed diagnostic canaries, not a claim that Vercel
has only five aliases. Coverage of aliases that are not enumerated is derived
from the authenticated provider's active **project-wide** firewall
configuration, which applies before hostname routing. The attester binds its
exact version, rule, conditions, and fingerprint and rejects any pending draft
change; BEGIN and FINALIZE use independently signed observations. During the
bounded quiesce window, place the Vercel project under a provider-admin change
freeze and monitor the active version/draft. Any unexplained provider change or
loss of monitoring is a STOP condition; keep the deny active until re-attested.

Refreshing the persistent fence first requires a new
`begin-provider-quiesce` request with `priorEvidenceId`, followed by finalize
and inspect. `refresh-persistent-provider-fence` consumes that new verified
`quiesceEvidenceId` and the current fence/verification IDs. A lost response is
retried with the same stable operation request ID and identical envelope; the
durable begin/finish or refresh receipt is authoritative.

Do not generate removal merely because the cutover completed. Only after an
authoritative rollback or abort has returned the system to `DORMANT` or
`ROLLED_BACK`, Google canonical, Passport identity, admission `OPEN`, gate
`PAUSED`, no prepared epoch/closure, no writers, and no queue backlog may the
operator generate:

```sh
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation remove-persistent-provider-fence
```

Removal additionally requires a fresh verified project-wide quiesce already
linked to the fence. Keep that WAF rule active across exact protection removal
and V0/Passport/Google deployment/domain restoration; its control-path
exception must keep the authenticated candidate action reachable. Remove the
temporary WAF rule only after authoritative diagnostics prove the legacy state,
then run the immediate post-removal edge/read smoke.

The control route still re-inspects authority and calls
`authorize_production_google_writer_provider_fence_removal` before touching
Google. Only that authorization permits deletion of the exact run-owned 17
protections; `finish_production_google_writer_provider_fence_removal` records
the verified restoration. No operator boolean can substitute for this check.

For an authority rollback, use the exact Supabase-ingress closure sequence:

```sh
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation pause-supabase-ingress
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation drain-supabase-ingress
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation finalize-supabase-ingress-closed
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation prepare-rollback
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation commit-rollback
```

`state.scoringIngressEnabled` records the activation-level authority flag.
`state.gateExecutionState` independently records whether the database admission
gate is `OPEN` or `PAUSED`. A Supabase rollback begins with authority still
Supabase and the activation flag still true: `pause-supabase-ingress` atomically
changes the gate from `OPEN` to `PAUSED`. Drain and closure finalization happen
while that gate remains `PAUSED`; only then may the rollback epoch be prepared
and committed. The tool refuses to collapse these two state dimensions.

If the short-lived external provider-fence evidence will expire while admission
is `CLOSING` or `CLOSED`, generate `refresh-provider-fence`. It maps only to
`refresh_production_scoring_external_fence_evidence` and requires the prior
evidence ID, active closure, paused gate, optimistic revisions, and a byte-exact
match between `providerFenceProof.boundImmutableScope` and the newly captured
provider/deployment/credential/writer coverage. Only the legacy lease-set
fingerprint/count and capture time may advance. Save the returned evidence ID
and refreshed activation/admission revisions before generating another payload.

The manifest and every rendered envelope expose `activeClosureKind`,
`activeClosureStatus`, `unresolvedOutbox`, and `unresolvedArchive` in the
diagnostic state guard. Closure finalization and authority prepare/commit refuse
non-zero durable queue counts. An admitted canonical transaction may complete
while close waits; any durable outbox/archive work it creates remains explicit
work to drain and is never treated as completed merely because close returned.

`validate` reports structural and exact-scope errors. `readiness` derives a
truthful readiness decision; it never trusts a manifest's claimed `ready`
value. `payload` checks the exact phase, authority, admission state,
activation/admission revisions and generations, lease counts, provider fence,
and first-write markers before rendering an envelope.

Step 11.6 readiness uses `providerFenceRehearsal`, which records that the
provider-level Google writer fence was applied, verified against legacy and
dedicated identities, and restored to its exact baseline. This is deliberately
separate from `providerQuiesceEvidence`, `persistentProviderFence`, and
`providerFenceProof`. The first two bind the durable Vercel quiesce record and
Google fence/verification records. `providerFenceProof` is the DB-derived
external evidence record that binds those three durable IDs. A restored DORMANT
rehearsal must never be treated as an installed cutover fence.

Final DORMANT readiness is deliberately stricter than forward Step 12 state.
It requires `providerFenceRehearsal.restoredFingerprint` to equal the exact
`baselineFingerprint`, retained `providerQuiesceEvidence.status=VERIFIED`,
`persistentProviderFence.status=MISSING|REMOVED` with `protectionCount=0`, and
`providerFenceProof.status=MISSING`. `stage-release` enforces the same
non-impact predicates before it can render a payload. The active persistent
fence and its DB proof are installed only after stage at the certified forward
cutover checkpoint; they are never valid evidence for a Step 11.6 DORMANT PASS.

Every mutating operation uses a stable, pre-recorded request UUID from
`stableRequestIds`. The request fingerprint is deterministic over the complete
payload. Save the generated envelope and retry it byte-for-byte after a lost
response. Do not regenerate it from a newer state and assume it is the same
operation.

`operationInputs` may add only operation-allowlisted fields. It cannot replace
computed project/workbook/deployment, revision/generation, closure/epoch,
authority, evidence, or fingerprint bindings. Repeating one of those fields is
accepted only when its canonical JSON value is exactly equal to the computed
value; any differing value fails closed. Only `stage-release` carries the
historical certification/environment claims. Later operation inputs reject
those fields entirely.

## Inertness and authorization

- `mode` must remain `DRY_RUN`.
- `execution.enabled` must remain `false`.
- `execution.networkAllowed`, `execution.providerSdkAllowed`,
  `execution.credentialReaderAllowed`, and `execution.sqlExecutionAllowed`
  must all remain `false`.
- The tool never spawns a shell or opens a socket.
- SQL envelopes are review artifacts, not executed commands.
- Set `execution.step12OwnerAuthorizationRecorded=true` only after the new,
  explicit Step 12 owner authorization. Every mutating payload refuses without
  it. The scope-only `inspect` and `inspect-scoring-admission` diagnostics, the
  protected provider inspections, and read-only capture artifacts remain
  available according to their own guards.

The template intentionally evaluates not ready. Readiness remains false until
all of the following are populated and mutually consistent:

1. the exact final frozen SHA and Step 11.6 certification fingerprint;
2. the final environment-delta and execution-bundle fingerprints;
3. an independently captured, current provider-fence proof establishing that
   every old/immutable Production-capable host and credential is fenced;
4. a complete origin matrix with zero writers capable after `CLOSED`;
5. the dormant migration and focused certification results; and
6. a fresh, exact Production snapshot ending Google + Passport + admission
   `OPEN`, with zero leases and both first-write markers false.

## Tests

```sh
node --test tools/step11-6-operator/operator.test.mjs
```

The tests are filesystem-local and do not call providers.
