# Director blueprint

This is a proposed Director workflow. Director authority is a read model of canonical tournament facts; it is not a separate scoring engine.

## Mobile operating view

One mobile screen should show service health, the current round, scoring completeness, matches, side games, blockers, and the next safe action. Technical identifiers and advanced evidence belong in drill-down views.

Every mutation follows one visible sequence:

1. Review the intended change.
2. Bind it to the exact key and dependency fingerprint.
3. Invoke the supported RPC.
4. Display the receipt.
5. Read back the bounded canonical state.

The result must be one of **COMMITTED AND VERIFIED**, **NOT COMMITTED**, or **UNKNOWN**. If the response is lost, the Director resubmits the same request identity rather than creating a new operation. A recent-operations list exposes receipts and unresolved outcomes. When a fingerprint is stale, the interface explains what changed and which safe step is now available.

## Lifecycle work

GO or NO-GO and Closeout use bounded reads of their declared dependencies. Prepare All is a proposed whole-round operation. Open Round should preserve the existing atomic server boundary while adding a complete review, receipt, and readback workflow around it.

Scorecard recovery starts from fresh Official holes, skips already committed matches, submits only missing gross scores, and blocks conflicting facts for owner review. The existing R139 recovery proves a bounded physical recovery path; it does not by itself provide the complete Director workflow proposed here.

Side games show configuration, job, result, publication, and history as distinct states. A financial correction preserves prices by default, enforces 100 percent ownership, keeps immutable history, and recalculates declared dependents. Public publication requires owner review.

Dangerous operations require a clear summary of the affected round, matches, financial facts, and dependent outputs before confirmation.

The acceptance target is an owner-run synthetic lifecycle that includes stale Odds, an Open response with unknown outcome, and recovery from a physical scorecard without SQL, Codex, or Terminal.

See [17-DIRECTOR-REDESIGN.md](17-DIRECTOR-REDESIGN.md), [48-DIRECTOR-ROADMAP.md](48-DIRECTOR-ROADMAP.md), and [OPERATION-READBACK-STANDARD.md](OPERATION-READBACK-STANDARD.md).
