# Queue timing evidence and hosted acceptance

Base: `51d5193087a3426ec2d6f22de6325c699666d435`. Local implementation only.
No hosted read/write, Queue publication, START, demand, deployment or secret
provisioning. Retained hosted checkpoint: `dpl_DZT8JdMShhfKxYPCabawEWLvYuBZ`,
supervisor OFF, scoring/Director admission DISABLED, ingress PAUSED, required
work/claims/leases/UNKNOWN/dead letters 0. This is retained evidence, not a new
hosted inspection. Corrected-retention hosted proof remains UNPROVEN.

## Provider contract reviewed 2026-10-05

**Provider documented:** [JS SDK](https://vercel.com/docs/queues/sdk) exposes
`messageId`, `deliveryCount`, `createdAt`, `expiresAt` in the handler metadata.
[Queues API](https://vercel.com/docs/queues/api) returns a publication message
ID, and receive metadata includes provider `Vqs-Timestamp` / `Vqs-Expires-At`.
Publication 202 may be accepted/deferred without an ID; it is not full schedule
installation. Delay consumes TTL. Visibility PATCH cannot exceed expiration.
ACK success is HTTP 204; visibility success is HTTP 200.

**Exact installed source/types:** `@vercel/queue` 0.7.0 `SendResult` has only
`messageId: string|null`; no accepted TTL, publication time or expiration. Its
native v2 small-body parser reads `ce-vqscreatedat`, `ce-vqsexpiresat` and
`ce-vqsvisibilitydeadline`. Missing expiration can become `createdAt+24h` inside
the SDK handler. Bagger's existing pre-SDK guard rejects missing actual metadata;
the evidence retains the raw provider timestamps, never the fallback.

**Observed hosted, retained:** actual v2 deliveries passed the existing raw
creation/expiry guard, but no receipt exposed those fields in operator readback.
This was an application observability gap, not proof that the provider lacks
expiration. There is no need to scrape undocumented APIs or recreate receive
logic. Read-only management/dashboard inspection previously did not provide
individual creation/expiry timestamps. [Observability](https://vercel.com/docs/queues/observability)
documents aggregates, not an individual expiration audit API.

**Provider/runtime documented:** [Undici diagnostics](https://github.com/nodejs/undici/blob/main/docs/docs/api/DiagnosticsChannel.md)
exposes request lifecycle, body chunks, response status and completion through
Node diagnostics channels. Use the installed SDK unchanged. Body-chunk channels
require a runtime with Undici >=7.11; actual native runtime availability remains
a hosted check. If unavailable, requested visibility is explicitly null; a
successful response is not mislabeled as observation of a missing request field.

## Unchanged contract

| Item | Value |
| --- | ---: |
| Post-schedule transport horizon | 540 seconds |
| Requested TTL | remaining delay +540 seconds |
| Visibility | 90 seconds |
| Function ceiling / worker soft cutoff | 60 /45 seconds |
| Canonical job lease | 90 seconds |
| Reservation authority after schedule | at most30 seconds |
| Maximum one-slot finite batch | 120 ticks /1-minute cadence /2 hours |

No new SQL, dependency, Queue manifest, bootstrap, role, RLS, authority,
calculation, retry, lease or job attempt behavior. STOP/HALT and canonical
reservations/claims remain execution authority. Physical retention is not it.

## Receipt surface and provenance

`certification-queue-timing-evidence-v1` emits small JSON records in server logs
inside the already-private Certification publisher/consumer. No new endpoint or
client-visible storage. Existing private invocation/job ledgers remain durable
authority; logs are evidence, not a distributed transaction or job ledger.
Export sanitized records promptly in the later owner-run evidence collection.
No schema needed. No receipt failure changes Queue ACK/retry or worker outcome.

Each field has `{value, provenance}`; contract/event/sequence are fixed format.

| Fields | Category / meaning |
| --- | --- |
| Delay, TTL, configured/requested visibility | BAGGER_REQUEST |
| Message-ID-returned flag, HTTP response status | PROVIDER_RESPONSE |
| Raw callback creation, actual expiry, initial visibility deadline, delivery count | PROVIDER_DELIVERY |
| Publish calculation, send/delivery/request/response observation times; monotonic duration | SERVER_CLOCK_OBSERVATION |
| Invocation/message SHA256 digest, trusted bound deployment, schedule/authority timestamps from committed state | DERIVED |
| Requested expiration, relative visibility deadlines, remaining horizon, response-success classification | DERIVED |

There is no raw message ID in logs; its SHA256 digest correlates publisher and
consumer. The real ID stays in the existing private publication ledger. No
payload, receipt handle, claim/run token, authentication header, credential,
participant identity, financial payload or raw exception. Builders have fixed
fields; offline schema validation rejects additional fields and wrong labels.

Events: PUBLICATION_REQUEST, PUBLICATION_RESPONSE/UNKNOWN, PROVIDER_CALLBACK,
HANDLER_ENTERED, CANONICAL_BEGIN_RESPONSE, CLAIM_ACCOUNTING_RESPONSE,
CANONICAL_FINISH_RESPONSE, HANDLER_REJECTED, VISIBILITY_RESPONSE, ACK_RESPONSE.
Publication TRY/send/ACK retain independent commits. Partial publication and
lost ACK retain UNKNOWN; no receipt converts uncertainty into success.

## Passive visibility / ACK observation

AsyncLocalStorage scopes each concurrent delivery's observer. Diagnostics match
only HTTPS `iad1.vercel-queue.com`, the fixed topic and PATCH/DELETE lease paths.
They never read headers or response bodies. At most128 transient bytes of a
visibility request are parsed into its sole numeric timeout; no body or path is
emitted. Nonmatching URLs, topics, methods and database calls are ignored.
No global fetch patch, SDK-private replacement or second Queue/worker engine.

The initial absolute visibility deadline is **provider delivery metadata**.
Renewal relative timeout is **requested**. Send-time plus timeout is a derived
deadline, not a provider-returned deadline. Response-completion time plus timeout
is a conservative derived upper bound. Accepted HTTP status is recorded only
after completed response; network failure remains unacknowledged. A provider
ACK alone does not prove worker execution: deterministic authority denial also
lawfully ACKs. Canonical BEGIN/FINISH and job ledger evidence prove execution.

Receipts are bounded (512 events per observer). Tests verify failure of the log
sink is passive and overlaps do not mix evidence. Real provider termination can
prevent a final log/ACK: absence is not rollback. Existing reconciliation owns
the result. SDK default debug logging must remain OFF; it is not this sanitized
receipt surface and can expose request credentials/handles.

## Clock and acceptance model

Prefer the **difference of provider expiry and provider creation**, both on the
same provider clock, to prove accepted TTL. Compare it with the logged requested
TTL with a conservative2-second timestamp/rounding tolerance. Verify the actual
provider expiry covers the canonical scheduled timestamp +540 seconds, using
the same2-second tolerance. Publisher TRY/control/provider network time may
lengthen the horizon; do not require an unjustified upper equality bound.

Publisher and consumer clocks are separate observations. Record monotonic
durations within each invocation; do not subtract monotonic values across
invocations or claim sub-second cross-runtime accuracy. Existing30-second clock/
network margin is unchanged. A provider/canonical clock difference that puts
the post-schedule horizon below538 seconds but within the30-second skew bound
is CLOCK_REVIEW_REQUIRED, **not PASS**. A larger shortage is HORIZON_SHORT.
Missing actual fields are EVIDENCE_UNAVAILABLE. TTL mismatch, wrong deployment,
wrong invocation, missing publication ID/ACK or message digest mismatch cannot
certify retention. No derived expiration can substitute for actual expiry.

The offline checker accepts an array or JSON-lines of sanitized receipts:

```text
node tools/reliability/check-queue-timing-evidence.mjs /absolute/path/receipts.json
```

PASS means only matched receipt pairs confirm retention; it does not certify
leases, termination, publication completeness or the entire Part2B-1 phase.
Behavioral renewal/termination/reclaim proof is still required. Since supported
delivery metadata exposes expiry, the weaker metadata-free fallback is **not**
the selected acceptance standard. If the future runtime lacks that metadata,
STOP and review the contradiction; do not silently downgrade.

## Old/new discriminating case

Exact predecessor `44784e8b` publisher requested
`max(60, ceil((authority_expires_at-publication_now)/1000))`.
For publication at P and a scheduled message at P+70:

| Contract | Physical expiry |
| --- | --- |
| Old | P+100 = S+30 |
| New | P+610 = S+540 |

A90-second renewal at delivery+18 necessarily requests S+108, past the old
expiry but before the new expiry. The old message cannot survive termination
at delivery+60; the new horizon also covers the canonical90-second lease and
later recovery. Actual provider metadata plus accepted native renewal and real
termination/reclaim distinguish these behaviors. No old defective candidate
needs deploying, nor does any lease timestamp need editing.

The first standard reservation also discriminates: delay10, old TTL60, new550;
old expiry S+50 precedes termination S+60 and the first90-second renewal's end.
For a practical70-second delay, use the existing bounded two-tick owner START,
not arbitrary delayed input. Never publish120 messages just to inspect timing.

| Tick | Delay from immediate publication | Requested TTL |
| --- | ---: | ---: |
| 1 | 10 seconds | 550 seconds |
| 60 | 3550 seconds | 4090 seconds |
| 120 | 7150 seconds | 7690 seconds |

The last value remains under provider604800-second maximum. Each publication
recalculates remaining delay immediately through the unchanged certified code.

## Transport ↔ database timeline

Join log invocation digest to SHA256 of the existing private invocation ID,
message digest to the private publication ID, and exact bound deployment.
Record actual callback creation/expiry/delivery, BEGIN response, claim-accounting
response and renewals before disappearance. CLAIM_ACCOUNTING_RESPONSE proves
bookkeeping returned, not that a job was claimed: the existing canonical
`claim_evidence`/job ledger supplies engine, cycle, source and `started_at`.
Use its real lease deadline plus provider runtime termination evidence.
Then record early-denial ledger evidence, natural expiry, owner reconciliation,
fresh reservation/delivery, attempt2 and one current output. Do not export tokens,
payloads or financial data. Local receipt tests bridge to the retained real PG17
90-second lease/60-second child/reclaim evidence; they do not claim hosted proof.

## Exact later hosted plan — not executed

1. Separately authorize push/deploy of the final candidate; validate preserved
   checkpoint and safely rebind while OFF/disabled/paused. No SQL/config change.
2. Collect publisher REQUEST/RESPONSE and native CALLBACK/HANDLER receipts for
   a minimal canonical no-work reservation. If a fresh practical delayed case is
   needed, use two reviewed ticks (10/70 seconds), no eligible work; STOP/reconcile.
3. Require real expiry, matched ID/invocation/deployment, accepted TTL and full
   post-schedule horizon. Read actual runtime visibility evidence. Missing or
   contradictory evidence is a gate failure, not a reason to weaken timing.
4. Activate only certified worker prerequisites, create minimal genuine demand
   and use existing one-use disappearance control in a finite owner window.
   Native Queue only: no direct worker/processor. Capture accepted90-second
   renewals below actual expiry, real60-second termination and remaining lease.
5. Prove early denial, natural90-second expiry, reconciliation and fresh lawful
   invocation reclaim; preserve attempts1→2 and exactly one current output.
   No `visibility beyond expiration` error; no old-reservation reexecution.
6. If retention PASS, finish only remaining Part2B-1 gates; retained autonomous
   cycle29, HALT/RESUME, lost ACK and Part2A results are not repeated needlessly.
7. STOP/reconcile/drain; OFF, admission disabled, ingress paused, required work/
   claims/leases/UNKNOWN/dead letters/reservations/handoffs/faults0. Preserve
   coherent fixture, empty Calcutta2, Odds0, FinalRecap ineligible/unprocessed.

No Part2B-2, Production/old Preview, Google or real messaging authorization.
