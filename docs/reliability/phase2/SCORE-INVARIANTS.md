# Canonical score invariants

These are acceptance requirements, not blanket PASS claims. Source behavior is distinguished from runtime proof in [PROOF-MATRIX](PROOF-MATRIX.md).

| ID | Invariant | Existing mechanism and required proof |
|---|---|---|
| P2-INV-01 | Only current authorized golfer/Director may submit to the correct match | SQL actor re-resolves confirmed identity, active role/membership, entitlement where applicable; per-match permission/revision; cross-match, spectator, revoked and signed-out denial |
| P2-INV-02 | Release/current pointer/admission cannot change underneath an admitted mutation | Shared transaction advisory lock, current deployment and runtime tuple, opposite exclusive close lock; compatible release and closed-admission regression |
| P2-INV-03 | Gross belongs to this match, hole 1–18 and format’s side cardinality | Validate gross arrays, expected match/hole revisions, canonical participant side/slot; malformed/mismatched inputs reject |
| P2-INV-04 | Frozen course/tee/handicap/strokes are server authority | `match_holes`, `scoring_snapshots`, `match_participants` drive the unchanged calculations; no client stroke/net/result input |
| P2-INV-05 | Net, hole winner and running match state are deterministic | Unchanged Best Ball/Scramble/Singles formulas and bounded 18-hole `match_progress`; format/plus/high handicap/tie/clinching/final tests |
| P2-INV-06 | One mutation identity produces at most one canonical transition | `(match_id, mutation_key)` primary key, actor+gross+hole payload hash, match row lock; sequential/concurrent replay and changed payload tests |
| P2-INV-07 | Stale concurrent score cannot silently overwrite Official authority | Compare-and-swap match/hole revisions before change. A supported explicit revision-aware correction retains before/after evidence; do not silently remove that existing capability |
| P2-INV-08 | Locked/Final authority rejects illegal new score transitions | Unchanged lifecycle/permission checks; Lock/Finalize races may accept score first or reject, never half-final authority |
| P2-INV-09 | Score, match progress and required receipt/audit commit together | One PostgreSQL transaction; fail every write boundary and verify complete rollback |
| P2-INV-10 | Required durable derived demand exists for every relevant committed change | Minimal transactional intent; append failure aborts; worker failure never retroactively changes Official score |
| P2-INV-11 | Derived result cannot silently become financial truth on stale inputs | Preserve current source/configuration/publication predicates; workers read canonical current authority; stale delivery cannot publish old financial state |
| P2-INV-12 | Final annual handoff cannot strand undrained score-derived demand | Existing exclusive admission fence additionally observes pending/retry/dead-letter intent before final predecessor closure; certificate includes blocker. Emergency admission stop remains available and pauses materialization |
| P2-INV-13 | Independent matches avoid unnecessary shared derived-row locks | Per-match intent insertion; materialization outside score transaction; deterministic held-transaction test |
| P2-INV-14 | Unknown client response does not imply rollback | Bounded mutation receipt/current hole resolution; committed receipt, definitive not-committed or unresolved transport state stay distinct |
| P2-INV-15 | Operational telemetry is optional; canonical audit is required | Logger/export failure is contained; receipt/audit insert failure rolls back canonical transaction |

## Deliberate compatibility limits

The existing SQL does not reconstruct every handicap/setup authority from history on each hole; it uses the prepared frozen match context. Preparation validation and mutation revision checks protect that authority. This phase must not reintroduce whole-tournament preparation scans into a score transaction to make an invariant sound stronger.

New-ID/same-score behavior is the existing NO_CHANGE response when supplied revisions are current, without a new mutation receipt. Same-ID replay checks permissions before its stored receipt in the hole-save RPC; revocation can deny replay even though the original committed result remains canonically present. Those nuances belong in outcome/readback tests and future client recovery semantics, not an unversioned response change.

The intent guarantee is per relevant family and score transaction, not a claim that every existing lifecycle operation now emits one unified event. Standalone Lock/Finalize/round changes retain their original transactional derived queue work. BE-JOB-001's literal single-event/all-consumer-checkpoint architecture is not completed by three family invalidation rows plus the existing separate Google outbox; see the architecture decision and [target](TARGET-SCORE-ARCHITECTURE.md).

Retryability is also distinct from automatic liveness. A `40P01` materialization deadlock produces a retained RETRYABLE intent with SQLSTATE and backoff; a later fresh claim can process it successfully. No autonomous scheduling guarantee, dead-letter reset operation or hosted annual-runtime proof follows from that invariant. [Migration-safety evidence](evidence/migration-safety.json) records the exact counterexample and successful explicit retry.
