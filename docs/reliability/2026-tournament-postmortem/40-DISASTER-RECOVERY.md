# Disaster recovery

## Scope and targets

Disaster recovery protects canonical score, authority, identity required for play, tournament configuration, and auditable operation receipts. It also covers the public current snapshot and derived side games, which can be rebuilt from canonical inputs.

Proposed targets, pending owner approval and rehearsal:

| Data/service | Proposed RPO | Proposed RTO | Notes |
|---|---:|---:|---|
| Canonical scores, authority, operation receipts | 0 accepted writes lost during normal operation; <= 5 min for regional disaster | <= 30 min to safe scoring or paper mode; <= 2 h to reconciled digital service | **PROVISIONAL**; feasibility must be proven by provider recovery points and exercises |
| Tournament configuration and current participant/match state | <= 5 min | <= 1 h | Restore must preserve authority generation and eligibility semantics |
| Public current snapshot | <= 5 min staleness | <= 15 min | Can serve clearly time-stamped last-known-good data |
| Derived side-game state | Rebuildable from canonical data/outbox | <= 4 h after canonical recovery | Never blocks canonical score recovery |
| History/archive/analytics | latest verified backup | <= 24 h | Isolated workload; may stay offline during active competition |

These are design goals, not claims about the 2026 account. Actual recovery retention, earliest/latest recovery point, failover capability, and cross-region posture are **UNKNOWN** until verified.

## Failure classes

1. **Application or dependency outage:** enter INCIDENT, preserve evidence, shed lower priorities, use last-known-good public snapshot, and keep score recovery by operation identity.
2. **Database performance/resource exhaustion:** stop P2-P5 load as authorized, keep bounded P0/P1, do not restart or resize without the emergency protocol, and preserve provider/query/pool evidence.
3. **Database instance/zone failure:** observe provider recovery, validate exact authority and canonical state, then run semantic checks before reopening writes.
4. **Logical corruption/operator error:** fence writers, record the corruption boundary, restore/PITR into isolation, compare semantics, and cut over only through an approved authority transition.
5. **Region/provider loss:** activate paper/offline scoring; provision the rehearsed recovery environment; restore, validate, and explicitly transfer authority. DNS/database failover alone is insufficient.
6. **Credential/control-plane compromise:** revoke through a clean control plane, fence automation, rotate in dependency order, validate immutable evidence, and rebuild from a trusted candidate/recovery point.

## Recovery command sequence

1. Declare incident and recovery authority; freeze releases and background work.
2. Decide whether writes are known, rolled back, or unknown. Resolve unknown operations with the same identity and authoritative readback.
3. Capture the evidence packet before destructive/provider actions when time permits.
4. Select the last verified recovery point and isolated target; record potential data-loss window.
5. Restore without attaching public traffic or tournament credentials.
6. Validate schema/migrations, grants, functions/triggers, authority generations, current tournament semantics, score/receipt/audit consistency, side-game rebuildability, and security configuration.
7. Reconcile paper/offline records with four-eyes approval and an immutable import receipt.
8. Activate one writer through the protected authority protocol. Run health and physical score/recovery journeys.
9. Reopen P0/P1, then P2, then derived/background work. Keep history/analytics isolated.
10. Preserve actual RPO/RTO, missing evidence, and follow-ups.

## Paper/offline continuity

Preprint or securely export the minimum current rosters, matches, holes, and scorecard identifiers needed for manual scoring. The Director declares paper authority and records its start/end time. Every manual score records golfer/match/hole, value, scorer, witness, event time, and correction chain. Digital reconciliation uses stable identities and never overwrites an unresolved canonical value silently.

## Database restart handling

Detect a restart from provider events and a changed postmaster start time; never infer its cause from that timestamp alone. On an unexpected restart:

1. enter INCIDENT and preserve all known request, release, authority and resource evidence;
2. stop lower-priority workers/diagnostics and prevent new blind mutation retries;
3. classify every in-flight mutation as receipt-confirmed, rollback-confirmed or unknown; recover unknowns with the same operation identity;
4. verify migrations, parameters, extensions, pool/login behavior, authority generations, current tournament pointers and backup/PITR state;
5. run bounded component health followed by a physical score/readback journey;
6. keep history/analytics isolated through the health window;
7. record whether the restart was scheduled, provider-initiated, operator-initiated or UNKNOWN and open provider escalation when appropriate.

A restart is not a recovery action to automate. If a resize or provider maintenance restarts the database, the same checks apply. The causes of the observed 2026 restarts remain **UNKNOWN**.

## Exercises and acceptance

Run quarterly and within 14 days before the tournament: backup restore, PITR to a specified time, logical-corruption boundary, lost-response/same-ID recovery, paper-to-digital reconciliation, worker rebuild, provider/region loss tabletop, and alert-path loss. Acceptance requires measured RPO/RTO, semantic parity, one writer, no duplicate score, complete receipts/audit, and an evidence packet. A provider job marked successful is not sufficient.

## Evidence confidence

High confidence: the September incidents demonstrate the need for separate authority/dependency, query, and restart evidence. High confidence: a later bounded recovery completed 72/72 physical holes with zero conflicts/errors/unknown outcomes, supporting sequential same-context recovery as a tested pattern. Unknown: Production backup/PITR configuration and actual regional recovery capability; no 2026 restore exercise was supplied.
