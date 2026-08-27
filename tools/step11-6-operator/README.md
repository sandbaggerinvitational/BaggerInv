# Step 11.6 / Step 12 dry-run operator

`operator.mjs` is an offline renderer and validator for the certified Production
cutover payloads. It cannot execute SQL, call a provider, read credentials, or
make network requests. Every envelope reports:

```json
{
  "mode": "DRY_RUN",
  "executable": false,
  "networkCalls": 0,
  "providerSdkCalls": 0,
  "credentialReads": 0,
  "sqlExecutions": 0
}
```

The manifest deliberately starts unresolved and not ready. Never put tokens,
private keys, service-account emails, Drive permission IDs, cookies, or provider
plaintext configuration values in it.

## Durable critical-WAF epoch

The temporary WAF is tracked as one immutable `CRITICAL_WINDOW_WAF_V1`
epoch. Baseline capture, staging the run-owned rule, activating it, binding the
exact Drive ACL fence, reattesting it, restoring the ACL, and reactivating the
captured baseline all use that same epoch identity. There is no separate
restore epoch, and a historical/restored epoch is not reusable.

Render the WAF payload contracts through the same dry-run wrapper:

```bash
node tools/step11-6-operator/operator.mjs waf-operations
node tools/step11-6-operator/operator.mjs waf-payload \
  --manifest /path/to/sanitized-manifest.json \
  --operation begin-critical-waf-epoch
```

The sequential commands are:

```text
begin-critical-waf-epoch
begin-critical-rule-insert-dispatch
mark-critical-rule-insert-dispatch-started
record-critical-rule-insert-result
begin-critical-draft-activate-dispatch
mark-critical-draft-activate-dispatch-started
record-critical-draft-activate-result
record-critical-waf-reattestation
begin-baseline-version-activate-dispatch
mark-baseline-version-activate-dispatch-started
record-baseline-version-activate-result
finalize-baseline-restored-fence
inspect-critical-waf-epoch
inspect-critical-waf-unknown
```

Drive-ACL binding and restoration are rendered by the main provider-fence
operations, not fabricated as WAF RPCs. The WAF wrapper emits only canonical
receipt-adapter calls and their exact verified RPC projections.

Each provider mutation has a durable reserve → mark-started → result sequence.
Only the first unexpired module-issued dispatch capability may cross the
provider boundary. `OUTCOME_UNKNOWN` is terminal for that dispatch: inspect it,
retain the critical window, and never issue a second dispatch. Waiting for a
TTL does not make an unknown result retryable.

`CRITICAL_RULE_INSERT` is confirmed by the exact module-owned provider response,
which records the provider-assigned rule identity; no caller may preselect or
invent it, and it does not create a signed draft observation. `CRITICAL_DRAFT_ACTIVATE`, fresh
critical reattestation, and baseline restoration require their distinct signed
WAF evidence. The Drive ACL fence binds atomically only while the epoch is
`ACTIVE_UNBOUND`, producing `FENCE_BOUND`. During Step 11.6 restore, the ACL
first reaches `ACL_RESTORED_WAF_ACTIVE`; PASS remains forbidden until the same
epoch reaches `BASELINE_RESTORED` and the fence finalizer reports
`REHEARSAL_RESTORED`.

## Commands

```bash
node tools/step11-6-operator/operator.mjs validate \
  --manifest tools/step11-6-operator/manifest.template.json

node tools/step11-6-operator/operator.mjs readiness \
  --manifest /path/to/sanitized-manifest.json

node tools/step11-6-operator/operator.mjs fingerprint \
  --manifest /path/to/sanitized-manifest.json

node tools/step11-6-operator/operator.mjs payload \
  --manifest /path/to/sanitized-manifest.json \
  --operation inspect-scoring-admission

node tools/step11-6-operator/operator.mjs operations
```

`fingerprint` computes the environment-delta, Step 11.6 certification, and Step
12 execution-bundle fingerprints in dependency order. The claimed readiness
field is excluded and ignored. Step 12 owner authorization is also outside
certification material; it must be recorded only when the owner separately
authorizes Step 12.

## ACL-v2 boundary

The certified provider fence is the exact legacy Production service-account
Drive permission:

```text
OPEN/CLOSING boundary: writer -> reader
Step 11.6 restoration: reader -> writer
```

The provider transition is accepted only as `TARGET_CONFIRMED` after exact
provider readback. `OUTCOME_UNKNOWN` is permanent fail-closed evidence for that dispatch:
do not retry, reopen, begin another close, or advance Step 12. The 1,810-second
old-function horizon never converts an ambiguous Drive update into a resolved
one.

The durable settlement is:

```text
AWAITING_ACL_READER_CONFIRMED
-> ACL_READER_CONFIRMED (T0)
-> wait >=190 database-clock seconds
-> SETTLEMENT_READBACK_1
-> wait >=10 database-clock seconds
-> SETTLEMENT_READBACK_2
```

The exact ACL dispatch and settlement records, not client-supplied JSON, are the
primary canonical-writer proof.

## WAF modes

The manifest records two different configurations:

- `BASELINE`: the exact normal, legacy-compatible firewall configuration;
- `CRITICAL_WINDOW`: the temporary five-group containment configuration.

The critical window allows only the exact signed candidate-control request on
the candidate hosts, denies all other noncanonical traffic, denies canonical
unsafe methods, denies canonical safe-method historical writer routes, and
allows normal canonical safe reads. Its activation timestamp starts the minimum
1,810-second old-function hold.

Step 11.6 must finish by confirming the ACL restoration, atomically reopening
the rehearsal record, and then restoring the exact WAF baseline. Step 12 keeps
the ACL at `reader` after Supabase authority commit but restores the WAF baseline
so Supabase scoring `POST`s can reach the canonical application. Rollback must
reinstall and attest the critical WAF before restoring the ACL.

Owner-freeze confirmations are purpose-bound. Step 11.6 accepts only
`I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS REHEARSAL`; a Step 12
`purpose=CUTOVER` epoch accepts only
`I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS PRODUCTION CUTOVER`.
Neither statement authorizes the other lifecycle.

All `REHEARSAL`, `CUTOVER`, and `ROLLBACK` WAF transitions execute only from
the exact Project Preview control candidate. Therefore the signed evidence
always binds `candidateDeploymentTarget=PREVIEW`, the exact deployment ID and
40-character commit SHA, and both exact candidate origins. `purpose=CUTOVER`
and `transitionMode=CUTOVER|ROLLBACK` identify the lifecycle; they do not
relabel the control runtime as a Production-target deployment. New/current
candidate classification is `PROJECT_PREVIEW`; historical Production-target
receipt labels remain historical evidence only.

Do not relabel this control candidate as `PRODUCTION`. The protected route uses
`productionWriterFenceCandidateCutoverEnvironment`, the distinct
`production-writer-fence-candidate-cutover-v1` contract for the exact
non-authoritative Preview deployment. It requires the certified candidate SHA,
Vercel project, Production resources, Director/session protections, and an
eligible cutover phase; a Production runtime is rejected rather than treated
as a second WAF-exempt control origin.

## Local signed WAF evidence

The local attester can sign an exact request plus provider readback files. It
does not call Vercel for these commands; the operator must first save the exact
protected-route request and separately captured read-only provider JSON:

```bash
node tools/step11-6-operator/vercel-provider-attester.mjs attest-waf \
  --request /path/to/exact-waf-request.json \
  --firewall-readback /path/to/read-only-firewall.json \
  --output /path/to/signed-waf-evidence.json

node tools/step11-6-operator/vercel-provider-attester.mjs \
  attest-rule-insert-result \
  --request /path/to/exact-rule-insert-result-request.json \
  --outcome TARGET_CONFIRMED \
  --provider-response /path/to/exact-provider-response.json \
  --firewall-readback /path/to/read-only-post-dispatch-firewall.json \
  --output /path/to/signed-rule-insert-result.json
```

For an ambiguous provider response, use `--outcome OUTCOME_UNKNOWN` and omit
both provider files. That signed result is terminal and never authorizes a
retry. Output files are add-only (`0600`) and are never overwritten. The
Step 11.6 wrapper remains dry-run and cannot submit these artifacts to a
provider or Production RPC.

## Evidence model

The retained historical writer-scope artifact is historical evidence only:

```text
settlementAcceptedAsPrimaryProof = false
unexplainedConcurrencyWindowCount = 1
```

The operator verifies that exact false/one state. It must never be changed to
make readiness green.

`aclV2Acceptance` is a separate immutable acceptance binding loaded from the
fixed repository path:

```text
docs/evidence/step11-6-production-google-drive-acl-v2-acceptance-v1.json
```

The manifest must exactly equal that loaded artifact. Its self-hash is only an
integrity check; recomputing a manifest hash is not evidence and cannot make
readiness pass. The real artifact is generated only after the provider and
database receipts prove the rehearsal restored Production. Until that file is
present, readiness must remain false. The artifact requires:

- schema `step11-6-production-google-drive-acl-v2-acceptance-v1`;
- `acceptedAsPrimaryProof=true`;
- `unexplainedConcurrencyWindowCount=0`;
- exact historical evidence fingerprint input;
- exact candidate/migration/resources and origin/credential bindings;
- exact fence/install/quiesce/restore identities, provider transition proofs,
  timestamps, and forward/reverse results `TARGET_CONFIRMED`;
- no unknown ACL result;
- 190+10 settlement complete;
- critical WAF held at least 1,810 seconds;
- WAF baseline and legacy `writer` permission exactly restored;
- the exact legacy-principal fingerprint from the DB ACL intent/proof, equal to
  the final `DORMANT` ADMISSION_V3 `provider_principal_fingerprint`;
- zero Google data mutations and zero Supabase canonical writes;
- final Production state `DORMANT / GOOGLE / PASSPORT / OPEN`.

Certification uses two traceable commits without self-reference. SHA A is the
implementation candidate that performs the rehearsal. After restoration, the
provider/DB-derived artifact is committed as evidence and SHA B becomes the
final frozen certification SHA. The artifact records SHA A only. The external
execution bundle binds SHA B and independently proves an A-to-B evidence-only
diff with zero unexpected paths. A caller-edited artifact or self-recomputed
manifest hash is insufficient.

## Provider and admission operations

Provider actions render HTTP `POST` envelopes for the protected candidate
control route. Authority operations render SQL text for review only. Stable
request IDs must be reused after lost responses; do not generate a new request
because a response was lost.

The supported cutover ordering is:

```text
stage-release
read-cutover
identity
arm-legacy-admission
begin WAF epoch; insert and activate CRITICAL_WINDOW; finalize quiesce
install-persistent-provider-fence (Drive writer -> reader)
record-provider-fence
close/drain/finalize legacy admission
capture-final-google-fingerprint
prepare-authority
commit-authority
workers
odds-runtime
```

The Step 11.6 restored WAF epoch and its bound quiesce evidence are historical
and terminally consumed.
Step 12 must create a new, provider-attested `purpose=CUTOVER` critical-window
epoch after the recorded Step 12 start, with a new evidence identity, an
unexpired owner freeze, new install/fence run identities,
`baselineWafRestored=false`, and no restored WAF fingerprint. A lost response
may rediscover database state for that same durable active epoch, but never
authorizes redispatch of a provider result that is unknown;
restoring `BASELINE` consumes it, and it cannot be reused for another install
or rollback.

The persistent install is `lifecycle_mode=CUTOVER`. The candidate UI's
`inspect-drive-acl-rehearsal`, `downgrade-drive-acl-rehearsal`, and
`restore-drive-acl-rehearsal` aliases are `lifecycle_mode=REHEARSAL` and legal
only in `DORMANT`.

## Readiness versus execution

`executionReadiness.ready=true` means only that the sanitized bundle is
internally consistent and all Step 11.6 evidence is bound. It does not execute
anything and is not owner authorization.

Before Step 12, independently refresh:

- repository SHA and GitHub tip;
- live deployment and Production resources;
- activation/admission revisions and generations;
- current data fingerprints and Supabase parity;
- Auth/Director/PWA health;
- WAF baseline and Drive ACL source state;
- first-write possible/observed markers.

Any drift, Preview resource, unresolved writer, ACL `OUTCOME_UNKNOWN`, phase skip,
stale revision, or dual-authority possibility fails closed.

## Rollback ordering

- Precommit: abort preparation, keep critical WAF, restore ACL only with
  `TARGET_CONFIRMED`, atomically reopen Google, then restore WAF baseline.
- Post-commit/no-write: install critical WAF, pause Supabase ingress, roll back
  authority, restore ACL, reopen, then baseline WAF.
- Post-write: install critical WAF, pause/drain Supabase, enumerate and reconcile
  every write, roll back authority, restore ACL, reopen, then baseline WAF.

There is no direct `SUPABASE canonical -> Google admission OPEN` transition.

## Tests

```bash
node --test tools/step11-6-operator/operator.test.mjs
node --test tools/step11-6-operator/waf-critical-epoch.test.mjs
node --test test/step11-6-waf-critical-epoch-receipt-server.test.mjs
node --test test/step11-6-vercel-provider-attestation.test.mjs
git diff --check
```

The final repository certification also requires the PostgreSQL 17 integration
suite, complete `npm test`, Production build, and client-secret scan.

See:

- `docs/step11-6-production-google-writer-fence-rehearsal.md`
- `docs/step12-production-cutover-runbook-v2.md`
