# Tournament Mode

Tournament Mode is an explicit operational state for the 2027 event. It narrows workload, freezes risky change, raises telemetry frequency, and prioritizes scoring and authority over historical and derived work. It does not bypass authorization, consistency, idempotency, or release controls.

## State machine

| State | Entry | Permitted work | Exit |
|---|---|---|---|
| NORMAL | Default outside the event window | Ordinary reviewed releases, maintenance, imports, analytics, and rehearsals | Enter PREPARE at the approved event checkpoint |
| PREPARE | T-14 days, exact tournament ID and release candidate recorded | Backups, restore rehearsal, full synthetic tournament, capacity test in isolation, final configuration; no speculative Production workload | GO evidence signed or return NORMAL |
| TOURNAMENT | T-48 hours through tournament closeout | Scoring, current authority/read paths, bounded operational reads, append-only receipts/outbox, approved Director operations | Incident transition or verified closeout |
| INCIDENT | Automated red condition or Incident Commander declaration | Fail closed where authority is uncertain; bounded diagnosis; paper-scorecard capture; emergency change protocol if required | RECOVERY after cause/containment and owner approval |
| RECOVERY | Known recovery plan, exact baseline and mutation identities preserved | Idempotent replay/readback, reconciliation, protected release, restore, or authority recovery | TOURNAMENT after acceptance window, or INCIDENT on failure |
| CLOSED | All rounds final, side games separately closed, exports and evidence complete | Backups, archival, post-event analysis | NORMAL after retention checks |

Every transition writes a durable receipt containing tournament ID, state, reason, actor, release/activation/deployment, authority generation, database start time, last successful backup/PITR point, and monitoring snapshot reference.

## Workload priority

1. **P0 scoring commit and same-ID result recovery.**
2. **P1 authority, participant identity, match authorization, current scorecard read, and Director emergency control.**
3. **P2 current tournament/public leaderboards and match center.**
4. **P3 outbox/mirror and small event-driven side-game invalidation.**
5. **P4 side-game calculations/publication, exports, notifications, and noncritical cron.**
6. **P5 historical pages, broad certification, reports, AI analysis, and bulk reconciliation.**

When database or API headroom enters yellow, pause P4 and P5 automatically. At red, allow only P0/P1 plus incident telemetry. Public views may serve a clearly time-stamped last-known-good snapshot. A cached page must never be represented as proof that scoring authority is healthy.

## Tournament technical policy

- Production historical aggregation is denied by role grants and route policy, not an operator reminder.
- A bounded diagnostic uses a dedicated read-only role, maximum one database connection and one query in flight, current-year allowlisted views, short timeouts, row limits, and no automatic retries.
- The application continues using the Data API/RPC path for user traffic. Any added database-client tool uses transaction pooling where compatible and pool size 1 in serverless execution.
- Scoring transactions append a small outbox event. They do not synchronously calculate or hash whole side-game histories.
- Background workers consume with bounded batch size, concurrency 1 initially, exponential backoff, a dead-letter state, and automatic pause on database yellow/red.
- Public/history traffic has independent cache policy and concurrency control. History cannot evict capacity needed by scoring.
- The scheduled account-deletion worker is paused or routed to an isolated window during active rounds after compliance review; failure must not affect health/scoring.
- No release, schema migration, compute change, restart, pool change, or backup restore occurs in TOURNAMENT except through `39-EMERGENCY-CHANGE-PROTOCOL.md`.

## Entry criteria

- exact release, activation, deployment, native build, database migration ledger, and authority generations match the approved manifest;
- two successful full lifecycle dress rehearsals exist for the frozen candidate;
- all scoring RPCs, roles, grants, triggers, views, and indexes match certified hashes;
- no long-running query, blocked transaction, unresolved mutation, active unexpected lease, failed derived job, or pending release intent exists;
- current tournament, roster, pairings, course/tee, handicap snapshots, access, side-game inputs, and publications are semantically ready;
- Supabase/Vercel region inventory, compute/storage/pool settings, metrics export, logs, alert routes, backups, PITR, and restore rehearsal are current;
- Disk I/O, CPU, memory, connections, pool, database latency, API latency, and scoring budgets are green for the required observation window;
- paper scorecards, scorer assignments, contact tree, and recovery workstation are ready;
- spectator concurrency target is measured and capacity-tested. Until measured, spectator load readiness is **BASELINE REQUIRED**.

## Round opening

Opening a round remains an owner-authorized, idempotent operation. Automation may assemble the evidence, show blockers in plain language, and prepare the exact request. It may not waive a blocker or invent a replacement identity after an uncertain result. The commit must bind the expected revision/fingerprint and return a durable receipt. A lost response is resolved with the same operation identity and authoritative readback.

## During-round automation

Allowed automatic actions:

- page on-call and open an incident record;
- pause low-priority workers and history traffic;
- reduce read refresh frequency and serve last-known-good public snapshots with age shown;
- preserve logs, traces, metric windows, query IDs, release state, and authority component results;
- switch the UI to paper-scorecard instructions after the Incident Commander declares scoring unavailable;
- retry idempotent background work within a bounded policy.

Human-gated actions:

- score submission, correction, finalization, reopen, pairing, handicap, side-game calculation/publication;
- release promotion/rebind, schema migration, compute/storage/pool change, restart, restore, failover, or authority switch;
- replay after unknown outcome unless the same mutation ID and canonical readback rule proves safety.

## Exit criteria

All scorecards and results are canonical and reviewed, active permissions/leases are zero, unresolved mutations are zero, side-game completion is separately certified, outbox/dead-letter queues are reconciled, an end-of-event backup is verified, evidence is exported, monitoring has returned to normal thresholds, and the owner signs the CLOSED transition.

## Evidence confidence

The need to prioritize scoring, forbid broad primary diagnostics, and preserve same-ID recovery is supported with **HIGH** confidence by the 2026 failures and successful bounded recovery. The exact automatic-shedding thresholds and spectator policy are **PROVISIONAL** because no event concurrency or saturation baseline was retained.
