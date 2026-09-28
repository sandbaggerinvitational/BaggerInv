# Emergency change protocol

## When it applies

Use this protocol only for a change required to contain or recover an active incident during the freeze. Create the incident first. The Incident Commander owns the operational decision; the change owner owns technical execution; a second qualified reviewer verifies the exact candidate and rollback.

## Prepare a reviewable change

Before approval, record:

- incident, user impact, violated invariant, and evidence;
- exact release/config/database/provider state and last-known-good candidate;
- smallest proposed diff and why it addresses the observed mechanism;
- dependencies, competitive-data impact, database lock/write behavior, and client compatibility;
- validation performed in the isolated/staged environment;
- rollback or forward-recovery procedure and abort thresholds;
- expected health signals, observation window, and named operators.

Do not use Force Promote, floating branches, unreviewed dashboard edits, ad-hoc Production SQL, or a lost-response retry with a new operation identity.

## Execute

1. Stop or shed approved low-priority work and preserve a pre-change evidence packet.
2. Verify backup/recovery state when the change can affect persisted data.
3. Obtain the Incident Commander and second-reviewer authorization on the exact artifact.
4. Apply one bounded change through the protected path with a durable intent/receipt.
5. Observe authority components, score correctness, error/latency/resource metrics, queue state, and competitive diff for the stated window.
6. Close only after authoritative readback. If the response is lost, recover by the same change/operation identity before acting again.

Automated systems and AI may collect evidence, run preapproved read-only checks, and recommend actions. They may automatically pause a designated background worker or serve a last-known-good public snapshot when policy already permits it. They may not deploy, migrate, resize, restart, restore, fail over, switch authority, replay an unknown score, Finalize/Reopen, or publish a side-game result.

## Abort and rollback

Abort immediately on a canonical integrity mismatch, unknown mutation outcome, authority split/drift, new scoring regression, database lock/resource red state, migration mismatch, or inability to observe the change. Roll back only when the rollback is known safe for the current schema/data state. Otherwise contain, enter RECOVERY, and use the rehearsed forward-recovery path.

## Closeout

Preserve before/after evidence, authorization, exact artifact, timestamps, receipts, health-window samples, physical journey result, rollback status, and remaining UNKNOWNs. Keep the freeze until reconciliation is complete. Schedule a review within one business day and convert any temporary control into a tracked permanent change or remove it.

