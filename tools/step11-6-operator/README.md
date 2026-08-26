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
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation inspect
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation close-legacy-admission
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation drain-legacy-admission
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation capture-final-google-fingerprint
node tools/step11-6-operator/operator.mjs payload --manifest ./step12-v2.json --operation finalize-legacy-closed
```

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

Every mutating operation uses a stable, pre-recorded request UUID from
`stableRequestIds`. The request fingerprint is deterministic over the complete
payload. Save the generated envelope and retry it byte-for-byte after a lost
response. Do not regenerate it from a newer state and assume it is the same
operation.

`operationInputs` may add only operation-allowlisted fields. It cannot replace
computed project/workbook/deployment, revision/generation, closure/epoch,
authority, evidence, or fingerprint bindings. Repeating one of those fields is
accepted only when its canonical JSON value is exactly equal to the computed
value; any differing value fails closed.

## Inertness and authorization

- `mode` must remain `DRY_RUN`.
- `execution.enabled` must remain `false`.
- `execution.networkAllowed`, `execution.providerSdkAllowed`,
  `execution.credentialReaderAllowed`, and `execution.sqlExecutionAllowed`
  must all remain `false`.
- The tool never spawns a shell or opens a socket.
- SQL envelopes are review artifacts, not executed commands.
- Step 12 still requires explicit owner authorization after Step 11.6 PASS.

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
