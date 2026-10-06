# Certification Queue Calcutta engine scope

Local-only remediation from `efdf52bed12cb5be1490d9284c840d38ed0ecd80`.
No hosted resource, credential, deployment, schedule, queue, or financial fact is
created or accessed by this proof. Part 2C remains outside scope.

## Finding and bounded correction

Calcutta was intentionally outside the four-engine Part 2B-1 scope. It was denied
both by `worker_supervisor_scope_v1()` and the bounded Node supervisor at discovery
and processing. The existing common worker already registers `CALCUTTA`, and the
Certification adapter already admits the fixed claim/complete/fail operations.

The closed supervisor registry now contains, in canonical order:

`TEAM_MOMENTUM`, `TOURNAMENT_STORYLINES`, `TOURNAMENT_INTELLIGENCE`,
`PROJECTION_EDITORIAL`, `CALCUTTA`.

The canonical BEGIN receipt returns the installed scope contract and engines.
The server checks that exact registry before using the existing processor.
Queue payload remains exactly `{version, invocation_id}`. A message or client
cannot select an engine, module, function, SQL statement, resource, or destination.
Legacy BEGIN receipts without the new scope continue denying Calcutta.

The forward artifact
`supabase/production_incremental/certification-queue-calcutta-scope-v1.sql`
corrects five supervisor bodies: counts, scope, status, reconciliation, and the
private Queue RPC. It updates the single OFF control row to the closed registry.
It adds a private installation receipt, never execution authority. Installation
is atomic, guarded by the exact V7 image and function predecessor hashes, and
replay verifies the current image and metadata. Function ownership, ACLs,
security mode, search path, volatility, language and strictness are preserved.
Historical supervisor receipts, attempt-cycle correction, Net Skins configuration
correction, bootstrap and migrations are retained.

## Existing canonical path

1. Director `REPLACE_CALCUTTA_AUCTION` commits immutable synthetic purchase and
   ownership facts and an UNPUBLISHED successor. It does not itself promise an
   immediate calculation job.
2. A genuine canonical match/score source transition creates durable Calcutta
   demand when the current valid auction is nonempty. A valid empty auction
   creates no Calcutta demand.
3. The existing Queue tick materializes pending intents, checks current
   configuration/auction/source, due time, generation and attempt budget.
4. `processProductionCalcuttaV1Job()` uses the fixed Certification worker adapter
   and `canonical_claim_calcutta_v1_recalculation_core_v2()`.
5. The existing full-net calculator (`calcutta-full-net-v3`) consumes the canonical
   claim's frozen inputs. `canonical_complete_calcutta_v1_recalculation_core_v2()`
   validates token, worker, live lease, activation, configuration, auction and
   current source before committing immutable result/history/current pointer.
6. The fail core and common delivery trigger preserve retry/backoff, five attempts
   per delivery cycle, terminal/dead-letter evidence and Director-only recovery.

**Lease distinction:** the installed Calcutta processor requests a **60-second**
claim lease. The Competition/Intelligence **90-second** leases are unchanged.
Neither lease is reconfigured by this remediation. Bounded invocation remains
one worker cycle, a 45-second soft cutoff and 60-second provider ceiling.
Completion after expired/lost ownership is rejected by the existing canonical
core. No claim is created without current lawful demand.

## Financial and publication boundary

The worker adapter contains only tick, preclaim failure, and fixed
claim/complete/fail operations. Purchases, ownership, pot/configuration, clearing,
publication and Director recovery are not worker operations. Calculation writes
the canonical result/current pointer with `publication_changed: false`; the
publication state remains UNPUBLISHED until its separate authorized domain path.
Status and reconciliation expose sanitized counts and claim identity evidence,
never claim tokens, auction payloads or participant financial facts.

## Local proof and limitations

The runner removes real credentials, blocks remote sockets, creates owned
PostgreSQL 17 clusters, and loads the actual vendored pg-safeupdate extension.
Director route, adapter, canonical SQL, common worker, Calcutta calculator and
installed Queue SDK 0.7.0 are real. Provider HTTP delivery/acknowledgement and
external session verification are synthetic. No local proof claims new hosted
provider acceptance or recertifies the preserved Part 2B-1 infrastructure matrix.

Independent owned counterparts give retry, terminal/recovery and supersession
cases their own genuine match-lock source transitions; they never overwrite
auction history or bypass preparation/readiness guards to manufacture demand.
All source changes use shipping Director operations. Local transport seams inject
one bounded connection failure or deterministic completion failure, without
adding a shipping Calcutta fault selector or arbitrary error injection interface.

Run from the repository root:

```
node tools/reliability/certify-calcutta-engine-scope.mjs focused
node tools/reliability/certify-calcutta-engine-scope.mjs application
node tools/reliability/certify-calcutta-engine-scope.mjs build
```

Results, source hashes and sanitized synthetic compatibility evidence are in
`evidence/`. The application selection is the frozen 4,077-pass/20-established-
failure baseline. No 864-hole rerun or scoring/domain calculation change.

The focused certificate passed **44/44**, including the real durable UNKNOWN
reconciliation deadline. The valid nonempty tick took **509.9 ms** in the owned
fixture; the largest measured compatibility tick was **647.4 ms**. These timings
exclude scheduled delivery waits and prove local compatibility, not hosted
latency. The result is PROVISIONAL: synthetic pot 1, one purchase and one 100%
owner, canonical current value 0.4 from the installed first-place overall payout.
Calculation remains UNPUBLISHED. Final local pending work, claims, leases,
expired claims, pending intents and dead letters are all zero, with supervisor OFF.
The production build passed. The final stable-manifest broad regression returned
**4,077 pass / 20 established failures / 0 skips / 0 new failures**. Its known
nonzero child-test exit is retained truthfully in `application.json`; the local
certificate verifies the complete established failure-name set.

Source supersession invalidates the old Calcutta claim. Its existing lease-denial
error can latch the supervisor's terminal halt; the local proof explicitly uses
owner RESUME after the authoritative new source is verified. This correction
does not change that established classification or permit ordinary delivery to
clear the latch.

## Odds planning note

`processCertificationOddsCalculationJob()` delegates to the existing checkpointed
Odds simulation job path. It is not an Intelligence processor and is not in this
Queue worker registry. The existing published-Odds/FinalRecap scope denials remain.
Odds needs a separate bounded delivery assessment before claiming autonomous
Odds coverage; this Calcutta correction does not add Odds authority.

## Separately authorized hosted continuation — not executed

1. Read back the exact Certification checkpoint and candidate/predecessor hashes;
   require OFF, disabled admissions, PAUSED ingress and no active work/authority.
2. Push the exact locally certified candidate only under hosted authorization.
3. Install only the Calcutta-scope forward artifact on Certification. Verify
   atomic/replay behavior, closed five-engine registry, unchanged canonical
   financial cores/metadata/RLS and preserved v1–v7 history.
4. Deploy that exact application candidate to the isolated Certification Preview;
   verify native consumer registration and immutable runtime identity.
5. Safely rebind the release while OFF/disabled/paused. Preserve Net Skins
   configuration revision 1 and entry revision 1.
6. Activate only already-certified authority. Commit one lawful synthetic
   nonempty Calcutta successor through the Director path, preserving empty
   revision 2. Verify purchase/ownership, immutable history and privacy.
7. Verify genuine canonical financial demand. If the auction operation alone
   creates none, use only a reviewed lawful source transition; do not manually
   insert jobs or assume a repeated/no-op lock advances source.
8. Owner START with the minimum finite tick budget; Preview-native publication
   derives only committed reservations. No local publisher or direct processor.
9. Observe native Queue -> reservation -> common worker -> Calcutta claim ->
   existing calculator -> completion; verify current source/result, receipts,
   no duplicate result, financial privacy and separate publication authority.
10. Continue only outstanding Net Skins result work, then separately assessed
    Odds calculation/publication and the FinalRecap negative prerequisite gate.
11. Drain/reconcile all current work and operations; owner STOP; invalidate
    unused authority and return OFF/disabled/paused with coherent fixtures.

No new fixed-cost resource or provider integration. The same finite message
batch is used; incremental cost is function time for lawful Calcutta work and
ordinary Queue operations if additional ticks are needed. Hosted metering remains
unmeasured here. Current provider transport semantics are documented at
[Vercel Queues](https://vercel.com/docs/queues); existing retention/visibility
contracts are unchanged.
