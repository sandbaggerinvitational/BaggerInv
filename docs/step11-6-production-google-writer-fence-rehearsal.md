# Step 11.6 Production Google writer-fence rehearsal

This candidate-only tool certifies a provider-level fence for the legacy Google
service-account identity. It does **not** perform Step 12, change application
authority, write a cell, create a score, or mutate Supabase application data.
It records only the dedicated dormant control-plane rehearsal receipt.

## Operator surface

Use the authenticated candidate page:

`/admin/step11-6-production-google-writer-fence`

The page exposes the following same-origin controls:

1. **Inspect workbook** — reads sanitized metadata and establishes the exact baseline.
2. **Begin controlled quiesce** — the server loads and hashes the complete
   1,291-deployment all-project v3 inventory, verifies its signed full-provider
   and enforcement-projection tuples, and probes every signed immutable, fixed,
   and candidate origin against the exact eleven-method/path write vector. For
   signed live inventory count `N`, a snapshot contains `11 × (N + 5)` probes.
3. **Finalize quiesce** — repeats the complete probe. The database requires at
   least 300 elapsed seconds and zero unresolved request logs/writes.
4. **Inspect quiesce receipt** — discovers a lost response by retained request ID.
5. **Inspect / abandon a retained BEGIN or FINALIZE challenge** — reads the
   authoritative challenge/reservation state. An expired unconsumed challenge,
   or a stale consumed attestation that remains `RESERVED` and never bound to
   quiesce evidence, may be immutably abandoned with a separate stable request
   identity. A `BOUND` reservation or any evidence progression cannot be
   abandoned.
6. **Apply Rehearsal Fence** — in one request, atomically adds 17 whole-sheet,
   non-warning protected ranges, proves the dedicated identity can edit them,
   proves the legacy service account cannot, attempts one same-description
   update against a run-owned protection and requires a provider `403`, then
   restores the exact baseline in `finally`.
7. **Restore exact rehearsal fence** — recovery-only; deletes only exact tagged whole-sheet ranges
   owned by the dedicated identity and requires exact baseline readback. A
   recovery-only restore records `FAILED / restoration_confirmed=true`; it
   clears the authority-mutation safety guard but does not certify the candidate.

The provider canary changes no application value: it asks the legacy identity
to set one temporary protection's description to the description it already
has. A successful canary response fails certification, even though the
requested metadata is unchanged. No cell/value request is constructed.

Before installation, the server creates a durable Production control-plane
receipt. That transaction must prove `DORMANT / GOOGLE / PASSPORT`, admission
`OPEN`, zero active or unresolved legacy writers, scoring ingress and workers
off, and neither first-write marker set. It serializes the one authorized
rehearsal. Each protected-range description is run-owned:

`STEP11_6_WRITER_FENCE_REHEARSAL:<run UUID>:<sheet ID>`

Recovery Restore requires that exact authoritative run receipt; it cannot
delete another rehearsal run's ranges or a later Step 12 fence.

The tool reads the complete used range of all 17 canonical sheets twice: once
with `FORMULA` and once with `UNFORMATTED_VALUE` plus `SERIAL_NUMBER`. It retains
separate formula, unformatted-value, used-range, and combined SHA-256
fingerprints. Formula and value fingerprints must be identical before install,
after the provider proof, and after restoration before the response may state
`applicationDataChanged=false`. There is no `A:ZZ` cap.

It also enumerates the exact workbook with Drive `permissions.list` using only
`drive.metadata.readonly`. The response exposes hashes, roles, and counts—never
emails, domains, permission IDs, or service-account principals. Certification
requires exactly one owner, no pending ownership transfer, both the legacy and
dedicated service accounts to be ordinary non-owner editors, and no
group/domain/anyone editor grant. The single Drive owner is recorded as an
explicit operational override and is **not** claimed to be machine-fenced.

## Required candidate gates

- exact Production-shadow candidate host and same-origin request;
- Vercel Preview deployment in project `bagger-inv`;
- branch `feature/mock-tournament-qa-integration`;
- exact candidate SHA in both the normal candidate contract and
  `PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_EXPECTED_COMMIT_SHA`;
- `PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_REHEARSAL_ENABLED=true`;
- exact Production workbook and Supabase project tuple;
- active non-impersonating Production-shadow Director `CB01` for tournament
  `2026`;
- distinct legacy `GOOGLE_*` and dedicated `PRODUCTION_GOOGLE_*` service-account
  emails and RSA public-key fingerprints;
- dormant candidate flags: Google scoring, no Supabase scoring ingress, no
  workers, no publication, and no public read cutover.
- exact server-configured Vercel project/rule/revision and the retained
  `docs/evidence/step11-6-production-origin-inventory.json` artifact, schema
  `step11-6-production-origin-inventory-v3`: 1,291 all-project deployments,
  comprising 458 Production-target and 833 project Preview records, with full
  provider fingerprint
  `6488da5c86e50bd0c524a94a8c8f97c1aeb8576393fc14d68a7bd76ebe338692`
  and one-to-one projection fingerprint
  `d238c5eeefef4606e0a05c2d0dbcee1a2b29cd07a2dd480435c0e75a0c3a91a6`;
- exact generated credential-confinement evidence, schema
  `step11-6-production-google-credential-confinement-v2`, for all 1,291
  retained origins (classification fingerprint
  `9ce65239f41086f56ea126e2491afe36ae90e85172a8536706f549912b27979b`,
  evidence fingerprint
  `071ca9163f6a1033e17136ace4c82b3163aa7a1c29900300ddafeeda5b7bb133`),
  including five READY null-SHA deployments and three READY deployments whose
  exact Git objects are unavailable, all conservatively treated as potential
  legacy writers;
- exact historical safe-method Google-writer evidence at
  `docs/evidence/step11-6-historical-safe-method-google-writer.json`, evidence
  fingerprint
  `6bf411a2e119e8552e6b3ac9ac51d8828e9fc853e5c43069dc40c31a6e794f28`,
  proving 236 READY immutable origins can reach the historical
  `GET`/implicit-`HEAD` Round Scorecards archive writer and binding the single
  all-method path-set fingerprint
  `fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa`;
- two complete dynamically sized live probe matrices (`22 × (N + 5)` total
  edge requests) covering the exact retained inventory or retained inventory
  plus one exact current candidate, regardless `READY`/`ERROR`/`BLOCKED`
  status, four fixed aliases, and the dynamic candidate alias, with exact `403`,
  `x-vercel-mitigated: deny`,
  `server: Vercel`, and `x-vercel-id` evidence;
- an action-time owner-write freeze with the database-issued 30-minute
  window. The browser supplies neither evidence fingerprints nor timestamps.
- a bounded Vercel provider-admin change freeze with monitoring of the active
  firewall version and pending-draft state through restoration/removal.

The exhaustive two-pass edge proof plus the mandatory five-minute drain is
budgeted as a roughly 15–25 minute controlled live window. Each snapshot uses
`N + 5` compact per-origin tuples carrying an eleven-bit coverage mask and eleven
ordered provider-proof fingerprints; the database validates and expands the
logical `11 × (N + 5)` origin×vector set without relying on a multi-megabyte repeated
JSON matrix.

The signed provider attestation is consumed into a durable `RESERVED` row
before the exhaustive edge probes begin. If probing or the network fails after
that transaction, the challenge is not reusable forever and local storage must
not be cleared as a workaround. Inspect the exact retained stage. Once the
database reports `ELIGIBLE_CONSUMED_UNBOUND`, abandon it with the retained
abandonment request ID. The database serializes abandonment against binding,
requires the reservation still be unbound with no quiesce progression, marks
both challenge and reservation `ABANDONED`, and preserves the consumed IDs and
fingerprints in the audit chronology. A lost abandonment response is recovered
by retrying that exact ID. Reissue BEGIN with a new evidence and all-new stage
IDs; reissue FINALIZE with the same draining evidence ID and all-new FINALIZE
IDs. Keep the provider deny rule installed while recovering.

Only public-key hashes and sanitized metadata fingerprints are returned. OAuth
tokens, private keys, service-account principals, protected-range principals,
Drive principals/permission IDs, and cell values are never returned.

The inventory artifact binds two ordered, one-to-one tuple forms. The full
provider tuple is `deploymentId`, `sha`, `providerCommitSha`, `origin`,
`deploymentTarget`, `gitBranch`, `providerSource`, `deploymentStatus`,
`createdAt`, and `shaResolution`. The enforcement projection is
`deploymentId`, `sha`, `origin`, `scopeClass`, `deploymentStatus`, and
`providerMetadataFingerprint`. A signed live observation must be exactly the
retained 1,291 tuple pairs, or those pairs plus one exact current-candidate pair.
No mutable reviewed-deployment addendum is accepted.

## Fixed provider scope

The canonical union is derived from the mutation-intent allowlists and must
exactly equal this fixed 17-sheet Production provider-ID catalog:

| Sheet | ID |
|---|---:|
| Players | 0 |
| Awards | 28074660 |
| Calcutta Ownership | 214637017 |
| Net Skins Result | 270637829 |
| Calcutta Round Results | 314908504 |
| Calcutta Standings | 388354025 |
| Tournaments | 625223812 |
| Net Skins | 804336907 |
| Team Names | 844307454 |
| Live Matches | 1074655326 |
| Calcutta Purchases | 1403525379 |
| Admin Audit Log | 1404770729 |
| Match Update Log | 1471947317 |
| Courses | 1677468900 |
| Matches | 1763222762 |
| Live Hole Scores | 1802214847 |
| Handicaps | 1940053655 |

Any missing/recreated sheet, existing protection on this union, malformed tag,
partial fence, duplicate fence, or baseline drift fails closed.

## Lost-response and restoration behavior

All 17 additions and all exact deletions use one atomic Sheets `batchUpdate` per
direction. After every mutation attempt, provider metadata is re-read. This
recovers an add/delete whose response was lost and makes Inspect/Restore safe to
retry. Restore never deletes an unrelated protection.

If automatic restoration cannot prove the exact metadata and canonical-value
baselines, the response says
`restoreRequired=true`; stop and use Inspect before any retry.

The begin and finish calls are serialized by a durable Production Supabase
receipt. Begin binds the verified quiesce evidence ID, candidate deployment ID/SHA, current activation and
admission generations/revisions, value/metadata/Drive baselines, fixed writer
scope, server-probed origin inventory, owner fingerprint, and owner-freeze window.
Finish binds the installed provider fingerprint, exact run-owned protection IDs,
legacy denial, dedicated editability, restored metadata/value/provider
fingerprints, and zero active run-owned protections. A lost successful response
is recovered by retrying **Apply** with the same request identity; the restored
receipt is read back without installing a second fence.

## Scope limitation and cutover requirement

The proof applies to the legacy service-account identity, not to the human
spreadsheet owner. Google owner override is explicitly untested and must not be
reported as machine-fenced.

Before the live rehearsal is invoked, all Google-mutating application activity
must be operationally paused and checked for in-flight multi-call operations.
The protected-range installation can reject the next call in a legacy
multi-call sequence; it is not itself an in-flight-operation drain. This is a
hard execution precondition outside this candidate route.

## Mandatory all-origin quiesce and drain

Before `Apply Rehearsal Fence`, install one temporary **project-level** Vercel
WAF deny rule across every Production and Preview deployment/hostname in the
`bagger-inv` project. Its action is **Deny**, and it has exactly these three OR
groups:

1. Request Path **Does not equal**
   `/api/admin/step11-6-production-google-writer-fence` **and** Method **Is not
   any of** `GET`, `HEAD`, `OPTIONS`.
2. Host **Is any of** the exact eight source-unresolved READY immutable
   hostnames, with no method exception:
   `bagger-1w07if9d1-sandbagger-invitational.vercel.app`,
   `bagger-60ah92b8c-sandbagger-invitational.vercel.app`,
   `bagger-6nrmyunec-sandbagger-invitational.vercel.app`,
   `bagger-b8ob0hjnu-sandbagger-invitational.vercel.app`,
   `bagger-f64olgv1h-sandbagger-invitational.vercel.app`,
   `bagger-h0eycprri-sandbagger-invitational.vercel.app`,
   `bagger-kh2m1cy6h-sandbagger-invitational.vercel.app`, and
   `bagger-kj3c0pkvm-sandbagger-invitational.vercel.app`.
3. Request Path **Is any of** the exact single historical safe-method writer
   path `/api/cron/round-scorecards-archive`, with no method exception.

The exact sorted eight-origin fingerprint is
`62f14a6635bc9ec16ce681e04b17bbd0f39e9ff55a858bbcb75f4aa75bc3bc4d`.
The first group keeps ordinary read-only traffic available, permits only the
exact authenticated candidate rehearsal POST, and blocks every other mutating
HTTP method without depending on a route inventory. The second group closes
all methods on source-unresolved READY code, so an unknown mutating `GET`,
`HEAD`, or `OPTIONS` path cannot bypass the fence. The third group blocks the
audited historical archive writer on all 236 affected immutable deployments,
including explicit `GET` and framework-dispatched `HEAD`. Do not scope any
group to
Vercel's Production environment: immutable Preview deployments may still hold
Production Google credentials.

After saving the rule:

1. Open the authenticated candidate page and begin the server-probed quiesce.
   Client-supplied origin lists or opaque fingerprints are not accepted.
2. After at least 300 seconds, finalize it. The database uses its own clock and
   current unresolved-writer predicates; browser timestamps cannot shorten the drain.
3. Capture stable formula and unformatted-value fingerprints before applying the Google
   protections.
4. Run the provider rehearsal and require exact value and metadata restoration.
5. Delete only this temporary WAF rule, verify a probe is no longer edge-denied,
   and re-certify live Google/Passport operation without making a score.

The four fixed aliases plus the candidate alias are diagnostic canaries, not an
exhaustive provider alias inventory. The security boundary is the authenticated
Vercel **project-wide** active firewall configuration, which applies to every
project hostname before application routing. The local attester binds the exact
active version/rule/conditions, rejects `active=null`, never accepts a matching
draft in place of active, and rejects every nonempty pending draft. No other
Vercel firewall, deployment, alias, or environment change is permitted during
the bounded window. If provider-admin monitoring or the change freeze cannot be
maintained, retain the deny and stop.

If any origin is not covered, any writer may still be running, or restoration
cannot be proven, keep new mutations paused and stop. A DNS or alias redirect
does not satisfy this gate.

Do not deploy or invoke this tool merely because its tests pass. The controlled
Production rehearsal requires the separate owner authorization and coordinated
operator window already defined by Step 11.6.

## Step 12 persistent fence (not invoked by Step 11.6)

The distinct authenticated page
`/admin/step12-production-google-writer-provider-fence` is available only when
the separate Step 12 enable flag and exact frozen-SHA variable match and the
Step 11.6 rehearsal flag is false. Step 11.6 does not render or invoke these
controls.

The corrected Step 12 sequence is:

1. deploy/promote the barrier-aware candidate and complete read, identity, and
   current-read phases;
2. arm the v2 Google gate (`GOOGLE_LEASE_ARMED`, admission `OPEN`, protocol
   enforced) while Google remains canonical;
3. begin/finalize a fresh `CUTOVER` WAF quiesce;
4. install and durably verify the exact 17 protections tagged
   `STEP12_GOOGLE_WRITER_PROVIDER_FENCE:<fence UUID>:<sheet ID>`;
5. remove the temporary WAF rule while the persistent protections remain;
6. close admission, drain, fingerprint, prepare, and commit. These authority
   operations bind the exact fence, verification, and quiesce IDs.

The persistent fence survives close, prepare, and commit. Inspect and refresh
recover by durable install request ID. Removal first obtains an authoritative
authorization that accepts only a proven safe Google rollback/abort state with
Supabase ingress, workers, leases, outbox/archive work, and prepared epochs
clear. It takes a fresh pre-removal provider/ACL/formula/value snapshot, deletes
only the 17 exact run-owned range IDs, and requires the post-delete state to
match that fresh snapshot. It does not assume install-time application values
remain unchanged throughout legitimate mirror or reconciliation activity.
