# R3 score transaction timeout repair

The installed scoring transaction invokes Calcutta invalidation on both the hole
write and match progress update. The late-R3 compatibility predicate is a SQL
STABLE function whose financial/consumed fingerprints read historical revisions.
PostgreSQL can evaluate these expressions during selectivity estimation, before
executing the receipt filter. Both reported Production timeouts occurred inside
this predicate's consumed fingerprint. The current Calcutta result has no matching
compatibility receipt.

Migration 120 adds a procedural eligibility gate to that one predicate. A result
without an eligible receipt returns false before the fingerprint statement is
planned. For eligible results, the original existential predicate is unchanged,
including all source, financial, consumed-input, policy and current-result checks.
Multiple receipts remain existential; no arbitrary first receipt is chosen.

The migration does not change scores, scoring RPCs, triggers, timeouts, grants,
side-game calculations, publication, native or PWA code. CREATE OR REPLACE retains
the function's existing owner and ACL; fixed search_path and SECURITY DEFINER are
preserved. It creates no jobs and performs no competitive-data writes.

Certification includes original late-R3 receipt/financial/security/concurrency
regressions, ineligible-result planning canaries, superseded-result denial,
multiple-receipt semantics, exact current Singles replay with all installed
triggers, all-format scoring, duplicate/retry/concurrency/rollback and finalization
eligibility. Local profile timings are not hosted capacity guarantees.

Production acceptance must be bounded/read-only. Do not submit missing physical
scores during installation or certification. Resume physical recovery only after
separate canonical preflight, one hole at a time with same-ID outcome recovery.
