# Canonical score critical-path hardening — Phase 2

**PARTIAL — non-Production candidate only. NOT READY for staging approval.** No Production query, mutation, or deployment occurred, and Build 11 was not implemented. Start with the [owner review](OWNER-REVIEW.md), [engineering review](ENGINEERING-REVIEW.md), and [certification](CERTIFICATION.md).

Phase 1 showed that Release 139 protected the common path but left eligible history, concurrency, and outcome recovery unproven. Phase 2 reproduced the remaining Calcutta eligible-history cost and blocking between independent matches on shared derived jobs. It also found a scan of restored rehearsal history in a required safety guard.

Candidate 121 retains canonical authentication/context/gross/strokes/net/hole/match/receipt/audit/Google outbox behavior. Only score-origin Calcutta/Net Skins/projection materialization moves after commit, through compact durable family intents and existing worker claims. Required intent insertion remains atomic. A precise partial index bounds the safety guard's lookup. Standalone controls retain their previous synchronous behavior. No formulas, participant permissions, RLS, client response shapes, or native shipping code changed.

Actual SQL proof completed 432 holes/24 Final matches plus 72 edge holes. The common benchmark's 4000 samples and eligible-branch benchmark's 960 samples cover 1×/2×/5×/10×. [Performance](PERFORMANCE.md) separates local RPC measurements, transaction bounds, committed round tests, and Production unknowns. Candidate score history behavior is bounded in the tested frozen 2026 fixtures; **the complete annual/hosted architecture is NOT PROVEN**.

Remaining P0s: supported participant unknown-outcome resolution after revocation; autonomous derived retry/dead-letter operations; future annual initializer SQL/attestation; and complete hosted client/control/resource-pressure proof. Worker 40P01 is contained and explicitly retryable, not eliminated. These gaps prevent an overall PASS. Local results do not prove Supabase capacity, restore capability, physical native behavior, or Tournament Ready status.

## Review index

- [Before-state](BEFORE.md), [invariants](SCORE-INVARIANTS.md), [synchronous inventory](SYNCHRONOUS-DEPENDENCIES.md), [transaction boundary](TRANSACTION-BOUNDARY.md), [target architecture](TARGET-SCORE-ARCHITECTURE.md), [resulting score path](SCORE-CRITICAL-PATH-AFTER.md).
- [Side games](SIDE-GAME-COUPLING.md), [post-commit work](POST-COMMIT-WORK.md), [idempotency contract](SCORE-IDEMPOTENCY.md), [failure semantics](SCORE-FAILURE-SEMANTICS.md), [ADR](../../architecture/ADR-score-critical-path-hardening.md).
- [Proof matrix](PROOF-MATRIX.md), [performance](PERFORMANCE.md), [concurrency](CONCURRENCY.md), [idempotency](IDEMPOTENCY.md), [failure injection](FAILURE-INJECTION.md), [query plans](QUERY-PLANS.md).
- [Traceability](TRACEABILITY.md), [evidence](EVIDENCE.md), [changes](CHANGE-SUMMARY.md), [reproduction](REPRODUCTION.md), [quality review](QUALITY-REVIEW.md), [open P0s](P0-REGISTER.md).
- [Deployment plan — documentation only](DEPLOYMENT-PLAN.md), [next single phase](NEXT-PHASE.md).

Authoritative base: 184b5c65a8e63784e1af8d38121fa2e16a015628. Final migration hash: cd9f6a784741d9e41c7f2e267bf4135549aeeb61333a22e4a31d9a174a3651a8. Phase 1 history is preserved; candidate-v1 evidence is retained separately. The [source receipt](SOURCE-RECEIPT.md) records the committed implementation. Pushing this isolated branch is not deployment authorization.
