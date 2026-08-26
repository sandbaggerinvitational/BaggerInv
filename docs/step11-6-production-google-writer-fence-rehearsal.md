# Step 11.6 Production Google writer-fence rehearsal

This candidate-only tool certifies a provider-level fence for the legacy Google
service-account identity. It does **not** perform Step 12, change application
authority, write a cell, create a score, or mutate Supabase application data.
It records only the dedicated dormant control-plane rehearsal receipt.

## Operator surface

Use the authenticated candidate page:

`/admin/step11-6-production-google-writer-fence`

The page exposes six same-origin controls:

1. **Inspect workbook** — reads sanitized metadata and establishes the exact baseline.
2. **Begin controlled quiesce** — the server loads and hashes the retained
   1,140-deployment v2 inventory and probes every signed immutable, fixed, and
   candidate origin against the exact nine-method/path write vector. For signed
   live inventory count `N`, a snapshot contains `9 × (N + 5)` probes.
3. **Finalize quiesce** — repeats the complete probe. The database requires at
   least 300 elapsed seconds and zero unresolved request logs/writes.
4. **Inspect quiesce receipt** — discovers a lost response by retained request ID.
5. **Apply Rehearsal Fence** — in one request, atomically adds 17 whole-sheet,
   non-warning protected ranges, proves the dedicated identity can edit them,
   proves the legacy service account cannot, attempts one same-description
   update against a run-owned protection and requires a provider `403`, then
   restores the exact baseline in `finally`.
6. **Restore exact rehearsal fence** — recovery-only; deletes only exact tagged whole-sheet ranges
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
  `docs/evidence/step11-6-production-origin-inventory.json` artifact (1,140
  exact tuples: 458 main Production and 682 feature-branch Preview, digest
  `533178a28a5458c5f2f727b77af3024de4cc0402c49e90dcd763b950d26fb4c6`),
  complete pagination evidence, and required prior-live/frozen-Step-11 IDs;
- exact generated credential-confinement evidence for all 1,140 retained
  origins (records fingerprint
  `c63962703a60745786ffce2e43e9fef5fa38e12746fce5627f33bfde92c8f508`,
  evidence fingerprint
  `1d6f4203fc56226ba4f6881339e9b2dfcede0e413485a110785d28e066a569df`),
  including nine provider-resolved SHAs and the sole non-executable BLOCKED
  null-SHA tuple;
- two complete dynamically sized live probe matrices (`18 × (N + 5)` total
  edge requests) covering all 1,140 retained and all signed post-freeze origins
  regardless `READY`/`ERROR`/`BLOCKED` status, four fixed aliases, and the
  dynamic candidate alias, with exact `403`,
  `x-vercel-mitigated: deny`,
  `server: Vercel`, and `x-vercel-id` evidence;
- an action-time owner-write freeze with the database-issued 30-minute
  window. The browser supplies neither evidence fingerprints nor timestamps.
- a bounded Vercel provider-admin change freeze with monitoring of the active
  firewall version and pending-draft state through restoration/removal.

The exhaustive two-pass edge proof plus the mandatory five-minute drain is
budgeted as a roughly 15–25 minute controlled live window. Each snapshot uses
`N + 5` compact per-origin tuples carrying a nine-bit coverage mask and nine
ordered provider-proof fingerprints; the database validates and expands the
logical `9 × (N + 5)` origin×vector set without relying on a multi-megabyte repeated
JSON matrix.

Only public-key hashes and sanitized metadata fingerprints are returned. OAuth
tokens, private keys, service-account principals, protected-range principals,
Drive principals/permission IDs, and cell values are never returned.

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
`bagger-inv` project. The reviewed rule is:

- Request Path **Does not equal**
  `/api/admin/step11-6-production-google-writer-fence`;
- Method **Is not any of** `GET`, `HEAD`, `OPTIONS`;
- Action: **Deny**.

This keeps read-only traffic available, permits only the exact authenticated
candidate rehearsal POST, and blocks every other mutating HTTP method without
depending on a route inventory. Do not scope it to Vercel's Production
environment: retained branch and immutable Preview deployments may still hold
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
