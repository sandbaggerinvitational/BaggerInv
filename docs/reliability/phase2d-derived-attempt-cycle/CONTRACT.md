# Same-source demand and the five-attempt ceiling

Local remediation based on V7 `6518709089816c0497fdc78ea6a81d67dd6323a4`.
Hosted Certification remains untouched. The supplied admission-revision-75
checkpoint is preserved evidence, not a new hosted verification in this task.

## Authoritative contract and root cause

`202609280124_score_derived_delivery_v1.sql` introduces `delivery_cycle` and the
constrained `delivery_attempts` counter (0–5). `capture_derived_delivery_transition_v1`
increments the counter when a canonical claim enters RUNNING, persists classified
failure/backoff, and appends attempt events. Worker eligibility and bundle readiness
exclude exhausted current work. Legacy `attempts` is not the authoritative ceiling.

A cycle is the bounded delivery generation for a canonical source. Distinct source
demand advances it. Authorized Director cause-corrected recovery advances it even
when the source itself is unchanged. The existing successful Intelligence sibling
rejoin rule remains: readiness must first prove distinct pending bundle demand.
This exception does not reopen failed/exhausted work by ordinary enqueue.

Three existing source/transition defects explain the finding:

1. Enqueue upserts unconditionally assign PENDING and clear completion, errors,
   ownership and timestamps. Same-source demand therefore overwrote SUCCESS,
   retry backoff, live claims and terminal state without advancing a cycle.
2. Competition completion replaced the requested demand identity with an output
   fingerprint. Intelligence already preserved demand identity. Repeating one
   Competition demand consequently looked like new work.
3. The legacy match trigger omitted `scorecardComplete`; canonical match triggers
   included it. Reasons, transaction flags and intent IDs are provenance, not a
   distinct source. These differences must not create retry budgets.

The correction is shared by TEAM_MOMENTUM, TOURNAMENT_STORYLINES,
TOURNAMENT_INTELLIGENCE and PROJECTION_EDITORIAL (and their existing guarded
FinalRecap sibling). Financial queue transitions are outside the new branches.
The shared trigger retains JSON field access where financial row shapes differ;
a separate owned fixture creates one real Calcutta job through supported synthetic
owner operations and proves a qualified rollback-only job no-op remains valid.

## Correct state transitions

| Input/state | Result | Budget/history |
|---|---|---|
| Same canonical source, SUCCEEDED/current | Exact job no-op; output remains satisfied | Existing cycle/attempt/history preserved |
| Same source, PENDING retry | Exact no-op | Backoff and attempts preserved |
| Same source, RUNNING | Exact no-op | Claim, lease, timestamps and ownership preserved |
| Same source, FAILED/dead-letter | Exact terminal no-op | Recovery still required; no new budget |
| Unexpected ordinary PENDING at ceiling | `55000 DERIVED_DELIVERY_RECOVERY_REQUIRED` | No successful stranded enqueue |
| Distinct canonical source | PENDING, next cycle, attempt 0 | Prior events retained; held old claim gets SUPERSEDED event |
| Director cause-corrected requeue | Existing authorized operation creates next cycle | REQUEUED evidence, actor, reason and request id retained |
| Poll, duplicate demand, restart | No attempt reset | Claim is the attempt boundary |

Canonical demand identity excludes only the provenance keys `reason`,
`transactional`, `derivedIntentId`, `priorRevision`. Revision/dependency fields remain significant.
The legacy MATCH_CHANGE/OFFICIAL_RESULT_CHANGE adapter reads the omitted scorecard
fact from the canonical match at the supplied revision. Output fingerprints remain
in snapshots/runs; completion retains the original job demand identity.

No historical job/attempt/receipt rows are rewritten during installation. Legacy
Competition successes whose job marker already contains only an output fingerprint
retain that marker. Their prior canonical demand cannot be reconstructed from it.
The canonical match trigger therefore supplies trusted OLD/NEW revision provenance:
an unchanged match revision is a no-op, while a genuine revision change creates a
new cycle; a canonical INSERT records trusted prior absence. Legacy match
notifications defer to this canonical trigger. Unproven
match demand fails with `55000 DERIVED_DELIVERY_SOURCE_IDENTITY_REQUIRED` rather
than guessing a new budget. Future completion retains demand identity. The hosted
attempt-5 Intelligence markers retain their original identity and need no data repair.

## Fresh-source producer (separate from the shipping correction)

The existing tee-time producer remains supported but is **not** a source-cycle
advance. Its setup revision changes while canonical match revision stays fixed.
Repeated tee-time requests cannot be used to replenish exhausted budgets.

The new owner provisioning tool plans one fixed `DIRECTOR.MATCH_CONTROL` /
`scoring-lock` operation on unscored UPCOMING secondary match `2026-R3-11`:

* derives resource/project/release/deployment from the existing server environment;
* reads canonical Director setup revisions;
* requires the secondary match to be unlocked, with access already revoked;
* persists a bounded original-request checkpoint before dispatch;
* increments actual match/permission revisions through the existing supported core;
* closes access, retains UPCOMING, requires no scoring preparation;
* creates genuine four-family demand through existing triggers;
* never calls a worker, inserts jobs, supplies revisions, resets attempts, changes
  an auction, or changes calculator/scoring semantics;
* resolves COMMITTED / NOT_COMMITTED / UNKNOWN through existing authoritative replay.

This producer is intentionally one-shot for an unlocked fixture. Once locked, its
replay is idempotent and a fresh plan is rejected. It is not an infinite synthetic
budget generator. Later fresh source must come from an independently lawful operation.
For the remaining hosted supersession tests, a separately authorized bounded
Reopen/re-finalize of the preserved complete primary match can provide further real
lifecycle revisions while restoring FINAL; this is work production, not a repeat of
the Part 2A scoring certification. No 18-hole score chronology is required. Do not
unlock an unprepared secondary match or weaken its Calcutta preparation guard.

## Forward installation

Artifact: `supabase/production_incremental/certification-derived-attempt-cycle-v1.sql`.

Atomic install requires the fixed registered Certification project/resource,
disabled admission, paused ingress, OFF supervisor, no live invocation or claim,
and installed V7 history. Exact three function predecessor hashes are checked;
replacement body hashes and owner/ACL/security/search_path metadata are checked.
The new private installation receipt preserves v1–v7 history. Replay converges.
Mismatch rolls back the whole install. Historical migrations/bootstrap remain intact.
No provider configuration, role, existing RLS policy or worker authority changes.

## Local proof and provider boundary

The integration proof uses actual PostgreSQL 17 with actual pg-safeupdate enabled,
synthetic credentials, existing canonical RPCs and processors. Cycle 29 is reached
through 28 real terminal/recovery cycles; four genuine transient failures plus the
fifth successful claim establish the exact attempt-5 success state. No job insert
or direct attempt reset is used. Old-function reproduction is rollback-only.
Both fixture ledgers are retained in local evidence. The terminal/recovery fixture
checks that every original ledger entry remains unchanged as new events are appended.
Separate real consumer child processes prove a runtime restart cannot replenish
the succeeded attempt-5 budget; database restarts also preserve active backoff.

Concurrent tests use independent PostgreSQL sessions, not simulated locks. The
consumer proof uses the unchanged bounded worker and canonical outputs. Remote
network access is denied. Hosted queue/recovery passes are retained, not rerun.
The broad certificate uses the established application selection and established
failure list; the focused selection installs the actual forward correction.

PostgreSQL documents that BEFORE UPDATE may return the old row and that an UPSERT
can run both INSERT and UPDATE triggers; the proof exercises those actual semantics:
[PostgreSQL 17 trigger behavior](https://www.postgresql.org/docs/17/trigger-definition.html).

## Next separately authorized hosted sequence

1. Read back the exact current bound resource/deployment/release and safe checkpoint.
   Verify four SUCCEEDED/current rows, Intelligence cycle29/attempt5, no stranded work.
2. With supervisor OFF/admission disabled/ingress paused, install only the reviewed
   forward artifact over verified TLS; verify all three exact bodies, metadata, history,
   safeupdate, replay, private ACLs and unchanged fixture/attempt rows.
3. No application runtime code changed: retain the current V7 deployment/binding.
   Do not deploy/rebind solely for SQL or owner provisioning tools.
4. Activate through certified controls, verify one identical source demand remains
   truthful and cannot strand attempt-5 Intelligence success. Do not replace history.
5. Create a real fresh source using the reviewed secondary lock producer. If further
   source revisions are necessary, use only the explicitly authorized lifecycle
   sequence above. Do not use tee-time changes as source advancement.
6. Resume only transient/backoff, terminal/Director recovery, stale supersession,
   same-reservation/two-slot/out-of-order concurrency, claim/expiry race and remaining
   authority negatives. Use native Queue supervision, never direct processors.
7. Preserve PASS for V7 STOP closure/BUSY retry, autonomous delivery, HALT/RESUME,
   lost ACK, retention/visibility, termination and natural lease reclaim.
8. Drain/reconcile, STOP, and disable/pause. Require zero required work, claims,
   leases, UNKNOWN, unexpected dead letters, stranded work, live reservations,
   handoffs and armed faults. Do not begin Part 2B-2.
