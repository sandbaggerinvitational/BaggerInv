# Certification Director Net Skins calculation adapter

Base source: `2a0e47c7d107de96aa0ac77d4e1cb9ba0c4aa2ea`.
This review, implementation and certification are local only. No hosted reads,
mutations, deployment, queue publication, supervisor START or push occurred.

## Shipping architecture and correction

Production uses Director-only `POST /api/admin/production-net-skins-v1`, with
separate `configure`, `enqueue` and `process` actions. The route requires the
Production runtime and canonical cutover authority before mutation. Preview
continues to receive its existing 404. That route is byte-for-byte unchanged.

`processProductionNetSkinsV1Job` is a synchronous Director-controlled processor,
not a Queue engine. It claims one job, calculates with
`calculateProductionFullNetSkins`, then completes/fails through the canonical
Net Skins cores. Its existing claim lease is 60 seconds, its attempt ceiling is
five, and its durable derived-delivery backoff remains authoritative. The
Production HTTP route's existing 300-second ceiling is unchanged. The new
adapter does not introduce Queue retry, retention or 90-second lease semantics.
The existing Production request after-hook remains unchanged; it is not the Net
Skins calculation authority.

Certification now supports the fixed operation `DIRECTOR.CALCULATE_NET_SKINS`
through `/api/director/canonical-operations`, family `NET_SKINS_CALCULATION`,
action `calculate`. The server adapter invokes the unchanged shipping processor
through its existing transport dependency seam. Claim/complete/fail, frozen
inputs, mathematics and automatic publication are unchanged.

The canonical Director admission phase is required. Server runtime registration,
resource/project/deployment/release, current authority token, tournament pointer,
session linkage and active Director entitlement are independently enforced by
the existing application and database gateway. This path is Certification-only;
ordinary Preview, Production-shaped and old Preview-shaped targets are denied.
No arbitrary resource, job, engine, processor or tournament selector exists.

## Request, demand and prerequisites

A Director first reads the fixed calculation model. Its reviewed command is:

```json
{
  "family": "NET_SKINS_CALCULATION",
  "action": "calculate",
  "operationRequestId": "<review UUID>",
  "expectedContextToken": "<current Director context token>",
  "payload": {
    "expectedConfigurationRevision": 1,
    "entryRevisions": {"3": 1},
    "sourceFingerprints": {"3": "<current 64-character source hash>"}
  }
}
```

All maps must exactly match the saved configuration's selected rounds and entry
revisions. They are optimistic-concurrency expectations, not authority. Runtime
resource identity, project, deployment, release, Director identity and tournament
are server-derived. Client authority/processor/job fields are rejected.

Prerequisites are current configuration, its immutable manifest and selected
rounds, current explicit saved entries, current pairing consent, canonical score
facts and frozen Full-Net snapshot/handicap/course context. The existing source
function binds these facts and lifecycle revisions into the exact source hash.
Full-Net authority validates 18 distinct hole allocations and frozen handicap
identity; calculation uses full-course handicap strokes, not matchup-net values.
Only saved eligible opt-ins enter the calculation.

Configuration saved after finalized scores need not have a Net Skins job. The
new private Director wrapper therefore materializes at most one missing selected
round demand using the unchanged private canonical enqueue core, then claims one
job. It acquires the existing round locks in ascending order, validates source
again after claim, and rolls back a source conflict atomically. It never inserts
jobs directly. A same-source current result or any existing non-superseded job
prevents replacement enqueue, including failed/exhausted history. Ordinary
calculation does not grant a new retry budget or bypass Director recovery.

## Fixture and phase

Prior locally retained hosted evidence records configuration 1, round-3 saved
entry revision 1 with only P12 opted in, primary FINAL with 18 scores, secondary
UPCOMING/locked/unscored, zero Net Skins jobs and zero result rows. This task did
not refresh that hosted read. `evidence/fixture-provenance.json` retains a bounded
summary and hashes of the prior evidence files.

The owned fixture uses canonical saved-entry, configuration, scoring and
lifecycle operations. It explicitly finalizes scores before configuration and
starts calculation with zero Net Skins jobs, matching that chronology. The first
Director calculation produces result revision 1, OFFICIAL, automatically
published. The unentered secondary match does not block the opted-in primary
subset. Local synthetic inputs yield one entrant, 18 awarded skins and a $25
synthetic pot under the unchanged installed rules. These local numeric results
are not a claim about the hosted primary's different score values.

OFFICIAL requires the calculated round to be complete and every included entry
to have available frozen authority and official match state. A lawful reopen
produces PROVISIONAL, stored but unpublished. Re-finalization produces a new
truthful source; stale completion cannot install a current result. All 18 owned
score rows remain unchanged through these lifecycle tests.

## Claims, receipts, replay and recovery

The review UUID determines a stable canonical request fingerprint; stage IDs are
fixed derivatives of it. The private wrapper stores the claim correlation in the
existing `cutover_operation_receipts` ledger. Completion/failure use the existing
domain receipts and audits. No new table, recovery system or reusable secret is
introduced.

Receipt replay cannot run the calculator again with the returned claim token.
The adapter reconciles instead. Exact replay remains historical COMMITTED even
after a later source change; current readback is returned separately. Reuse of
the same review identity with a conflicting payload is denied.

| Canonical evidence | Outcome / response |
| --- | --- |
| No configuration | Read HTTP 200 `NOT_CONFIGURED`; calculate HTTP 409 `PRODUCTION_NET_SKINS_CONFIGURATION_REQUIRED`. |
| Missing/stale saved-entry revision | HTTP 409 `FULL_NET_ENTRY_REVISION_STALE_OR_UNAVAILABLE`. |
| Stale configuration/source | HTTP 409 `PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT` / `PRODUCTION_NET_SKINS_SOURCE_REVISION_CONFLICT`. |
| Exact current demand already satisfied, held, backed off or otherwise not claimable | Canonical `EMPTY`, COMMITTED no-work receipt; never claim successful calculation. Model reports processing/pending separately. |
| Concurrent replay while the admitted claim is live | HTTP 409 reconciliation required; UNKNOWN, no second calculation. |
| Completion receipt exists | COMMITTED, sanitized canonical result receipt. |
| Failure receipt, ownership loss or natural lease expiry without completion | NOT_COMMITTED for that calculation; inspect current work before a new review. |
| Live claim, or receipt absence without proof of rollback | UNKNOWN; status/reconciliation required. |
| Infrastructure/programming failure | HTTP 503 with truthful uncertainty; no manufactured authorization denial or COMMITTED outcome. |
| Director/session/resource/context denial | HTTP 403 or stale-context 409; no domain execution. |

Application response loss and database completion-ACK loss reconcile from real
committed receipts. Claim-ACK loss remains UNKNOWN; repeated delivery/review
cannot execute again. The local test waits the natural 60-second Net Skins lease,
observes NOT_COMMITTED, respects canonical backoff, then a new review reclaims the
same job with attempts 1 -> 2. Lease timestamps are never edited. Existing
terminal/dead-letter and retry rules are not replaced.

## Participant read and privacy

The already-certified `READS.NET_SKINS_V1` path remains unchanged. Before a
result, participant GET returns bounded HTTP 200 state. PROVISIONAL payouts and
winners are withheld. OFFICIAL exposes only the existing participant-safe
current summary, winners and 18-hole/detail projections. GET never recalculates
or schedules an after-hook. Raw snapshots, internal fingerprints, receipts,
audits, claim tokens and private configuration are absent from participant DTOs.
Direct private reads remain denied/filtered. RLS, table ACLs and roles are
unchanged.

## Forward installation and lineage

Artifact: `supabase/production_incremental/certification-net-skins-calculation-v1.sql`.
It installs atomically only on the exact registered Certification database while
supervisor OFF, admission disabled and ingress paused, without live claims.
Two existing dispatcher/admission function bodies change; one private fixed
helper is added, owned by the existing dispatcher owner with owner-only EXECUTE.

| Changed existing function | Required predecessor body SHA-256 |
| --- | --- |
| `certification_operation_phase_v1(text,boolean)` | `0b9d4cad7e0870e1a2a163d8eb48dabc1d5a0061e05c34a07ff73ae7aa5fc69b` |
| `dispatch_certification_operation_v1(jsonb,jsonb,boolean)` | `8dea95b16851cbb1b972cd66ce85fe4573ce4941c4a870f7fe5cf83da5cb59de` |

Read-core, enqueue and claim/complete/fail predecessor hashes are also required.
Replay verifies body hashes, owner, security mode, search path and ACLs; drift or
mismatch rolls back. Existing function metadata is preserved. No historical
bootstrap/migration, domain core, Queue registry/config, lease, Calcutta or Odds
artifact changes.

The base already contains both Calcutta engine scope and publication changes.
Net Skins read correction and those Calcutta artifacts are byte-verified against
the base in focused tests. One consolidated candidate can deploy the preserved
lineage plus this calculation adapter.

## Certification evidence and limits

Final focused certificate: **153 pass / 0 fail / 0 skip**. It covers owned
PostgreSQL 17 with real pg-safeupdate, actual application route/server adapter,
shipping processor/calculator, SQL authority, receipts, result/publication and
participant projections. External Auth session lookup, provider HTTP transport
and Next wrapper are modeled at explicit module seams. Real database identity,
entitlement/context validation and mathematics are not mocked.

Broad certificate: **4,077 pass / 20 established failures / 0 skip**, with
**0 new unexplained failures**. Production build: **PASS**. Results are retained
in `evidence/application.json` and `evidence/build.json`; source manifests and
corresponding TAP record the checks. All three executable source manifests
remained stable. The underlying broad process exits 1 for the exact established
failure set; the certificate accepts only that baseline. Remote sockets are denied and real credentials
removed throughout. No 864-hole rerun. Owned local clusters are destroyed.

## Prepared hosted continuation — not executed

1. Under separate owner authorization, freshly verify the safe hosted fixture,
   retained config/entry revision 1 and current release/deployment.
2. While OFF/disabled/paused, install the Net Skins read correction followed by
   this calculation-adapter SQL. Verify required Calcutta predecessors already
   installed; preserve/replay only as required by the reviewed lineage.
3. Deploy one exact consolidated candidate and safely rebind/replay.
4. Activate only required existing Certification/Director admission.
5. Execute one reviewed Director calculation; verify phase, canonical receipts,
   automatic publication if OFFICIAL and corrected participant reads.
6. Resume nonempty Calcutta calculation and Director publication, inspect the
   existing Odds architecture, and verify FinalRecap's negative prerequisite gate.
7. Reconcile/drain, owner STOP, return OFF/disabled/paused. Do not begin Part 2C.

Hosted checkpoint here remains the owner's reported OFF/pending-0 state. Local
PASS establishes readiness for separately authorized hosted proof, not hosted
execution or a fresh hosted state attestation.
