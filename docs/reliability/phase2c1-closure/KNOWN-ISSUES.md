# Issues discovered during closure

| ID | Severity / scope | Evidence | Action |
|---|---|---|---|
| P2C1CL-ANNUAL-READ-001 | P0 annual canonical readback | Actual future-year CREATE succeeds, then `read_production_future_runtime_v2` raises SQLSTATE42703 on nonexistent participant.team_id | Minimal tournament-scoped canonical projection correction; actual readback/SQL regression required |
| P2C1CL-PREVIEW-GOOGLE-001 | P0 isolated capability / retirement proof | Separate Preview score/Finalize/Reopen and snapshot functions still enqueue Google delivery; the prior432-hole Production-shaped SQL fixture did not exercise them | Separate Preview retirement migration and actual client/API/SQL proof; preserve receipts/snapshots/historical jobs |
| P2C1CL-ODDS-METADATA-001 | P2 intermediate input hygiene | Caller Google destination metadata survives `productionOddsCalculationScope`; final dispatch already strips it | Strip obsolete delivery fields at intermediate boundary as defense in depth; unchanged5caseannualOdds contract passes |
| P2C1CL-ROUTING-ADMISSION-001 | P0 compatibility/security proof | Requested invalid diagnostic lane can select otherwise valid ordinaryPreview resource in generic selector; exact read-only lane also fails valid canonical selector | Proposed no-fallback/read-only correction is blocked pending explicit approval after automatic review rejection |

Additional findings:

- **P2C1CL-ANNUAL-HASH-001 / P0 compatibility:** v2 annual commands hashed compact JavaScript JSON while PostgreSQL checked canonical JSONB text. The provider-neutral exact wire hash now has actual PostgreSQL equivalence and API/runtime/replay tests; legacy v1 CREATE receipt hashing is unchanged.
- **P2C1CL-PROOF-OUTPUT-001 / P2 harness:** the copied SQL retirement test accepted only the old evidence directory and could skip cleanup when artifact writing failed. Its seven SQL subtests passed but the wrapper failed. The failed receipt is preserved under `evidence/before/evidence-output-guard/`; the closure-only path guard and `finally` cleanup were corrected, the one owned orphan cluster was verified/stopped, and the full8/8 rerun passed. No database authority was changed by this harness repair.
- **P2C1CL-ISOLATED-CONTEXT-001 / P0 required capability:** Preview importers do not preserve the same immutable entry/auction/setup/readiness semantics as canonical Director commands. See the exact rejected substitutions and required context design in `CANONICAL-ADAPTER-DESIGN-REVIEW.md`. Missing capability remains explicit.

These are candidate/source findings, not claims of Production incidents. No broader infrastructure, backup, native or round-lifecycle P0 is closed by this table.

- **P2C1CL-PREVIEW-ODDS-001 / P0 retirement/capability:** the independent Preview publisher still inserted Google mirror jobs and a supersession trigger rewrote historical mirror rows. The closure adds an explicit canonical owner publication path and retires that sink/worker access while preserving its history. Actual before/after publication, failure/rollback/readback and bounded-current-read proof is required; see the final Odds evidence. Production-shaped scoring proof alone did not cover this branch.
