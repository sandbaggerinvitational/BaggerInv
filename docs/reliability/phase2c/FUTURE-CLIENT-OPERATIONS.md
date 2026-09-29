# Inputs to later native, Director and operations work

These are design requirements, not implemented UI.

## Native/PWA recovery

Keep the original mutation ID and local gross intent after an ambiguous response. Ask the additive mutation-status endpoint using the current authenticated account. COMMITTED means the original accepted receipt is durable; reconcile that exact intent, then read current hole authority separately before presenting a subsequent correction. UNKNOWN means keep the intent unresolved and check status; it does not permit a new independent mutation or a claim that the score failed. This contract does not currently emit NOT_COMMITTED. Lock/Finalize may revoke writes while leaving owned receipt recovery available. Account revocation/deletion may deny recovery, intentionally.

Do not clear mismatching intent merely because a receipt exists, infer another device's mutation ownership, or use the client clock to decide commitment. Build10 does not automatically gain this behavior. Its queue/navigation defects and physical acceptance remain open. Backend timestamps must remain compatible with the unchanged decoder's UTC requirement until separately versioned work proves otherwise.

## Director derived-work view

Show PENDING, RUNNING, RETRYABLE (attempt/due time), DEAD_LETTER, SUPERSEDED and SUCCEEDED distinctly. Materialized intent is not completed derived calculation. Show current authoritative input/result pointers and blocked/incomplete health. NetSkins WAITING_OWNER and final-recap/publication gates are legitimate pending decisions, not automatic-worker success. Requeue must show exact work/cycle/attempt, original failure, corrected cause, actor, reason and receipt; same request replay is safe and a changed request conflicts.

## Operations

Lost score acknowledgement after Lock: retain original ID, use owned status read, compare the stored receipt and current hole, keep writes closed. Worker degraded: preserve Official scoring, inspect bounded job status/attempts, let transient backoff and leases recover. Dead-letter: identify cause, correct it in an authorized task, then owner-confirm the exact supported requeue; never reset rows or erase attempts. A worker timeout/40P01 is not a scoring failure. Provider outage or unknown authority still fails scoring closed; physical cards remain the recovery source for uncommitted golf.

Hosted process supervision, alerts, dashboard UI, financial publication controls and a complete owner rehearsal are later work. This document does not install an automation or authorize a release.

## Work-class boundary

The retry, DEAD_LETTER and exact authenticated requeue controls above describe only the new Calcutta, Competition and Intelligence delivery policy. Google reporting/export and external scorecard archive use separate legacy queues. Their autonomous lifecycle, finite attempts and supported terminal recovery remain NOT PROVEN; do not offer the new runner's requeue button for those queues or imply they are SUCCEEDED because the managed runner is idle. The Director must show that separate admission/backlog state and the missing recovery capability honestly. See [Google/archive gap](GOOGLE-OUTBOX-GAP.md).

Net Skins materialization can report WAITING_OWNER; a retrying Net Skins owner-authorized calculation must remain distinct from ordinary automatic derived work. Preserve its job/lease and error evidence, use bounded status checks, and escalate a terminal/unresolved state rather than auto-process or publish to clear it. These are future UI/runbook requirements, not installed controls.
