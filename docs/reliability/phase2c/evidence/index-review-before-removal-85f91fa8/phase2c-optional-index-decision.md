# Optional delivery index decision — local PostgreSQL evidence

**Recommendation:** remove three optional indexes; retain five nonunique indexes and the two correctness indexes from migration124. This is a query-plan and schema-cost judgment, not a Production capacity claim.

The exact85f9 candidate was exercised with PostgreSQL17.11, default `enable_seqscan=on`, owned local socket-only databases,1× and10× synthetic history. The final22-case run passed; all counterfactual DDL and synthetic state changes rolled back, and the owned cluster was destroyed at2026-09-28T18:44:18.799Z. Result/plan evidence: `/private/tmp/phase2c-optional-index-exists-review-results.json`.

| Index | Decision | Actual evidence and rationale |
|---|---|---|
| `calcutta_v1_recalculation_jobs_delivery_due` | Remove | Both due and delayed actual full claim selectors use inherited `production_calcutta_v1_claim_queue` with or without the candidate. One-active-job-per-tournament bounds the relevant current row. No additional need demonstrated. |
| `net_skins_v1_recalculation_jobs_delivery_due` | Remove | Both actual full claim selectors use inherited `production_net_skins_v1_claim_queue` with or without the candidate. The fixture has two configured rounds; supported product has three. One active job per tournament/round prevents an unbounded current pending queue. |
| `competition_recalculation_jobs_delivery_due` | Retain | At10×, the exact shipped readiness `EXISTS` uses this index and examines no rejected row,2shared-hit blocks; dropping it gives a Seq Scan filtering200prior-year markers,7blocks. At1× both variants choose small sequential scans. In the delayed10× case the inherited primary key wins on blocks without the new index(3vs5), so this is a specific due-branch benefit rather than universal improvement. |
| `competition_recalculation_jobs_delivery_terminal` | Remove | At10× the candidate saves1block against the inherited primary-key path. The latter considers at most five current round0 markers, rejecting at most5rows. No accumulated current terminal history exists because the current marker key is unique. This small improvement does not justify another mutable index. |
| `score_derived_intents_terminal_v1` | Retain | With a realistic864current-intent backlog(432first-entry holes×two automatic families),0/1/101terminal cases use2/2/7blocks and reject0rows. Without it the actual bounded terminal selector rejects864/863/763nonterminal rows and uses50/99/149blocks. This is an applicable state that the earlier empty-current fixture did not cover. |
| Two financial terminal indexes | Retain | Previous actual tick counterfactuals demonstrate exclusion of accumulated terminal financial-job history. The active-job uniqueness constraint does not bound historical terminal jobs. Preserve the final full-RPC history rerun as the current candidate evidence. |
| `score_derived_delivery_attempts_work_v1` | Retain for explicit forensic lookup | Final annual evidence executes exact tournament/family/work/cycle audit lookup over5,184/51,840attempts. Indexed7/8hit blocks vs full scan126hits or295hits+916physicalreads; zero vs5,185/51,841rejected rows. This is a bounded privileged forensic query, not a currently shipped worker RPC. |

The final Competition check deliberately uses actual `EXISTS`, not a query returning both eligible engines. The earlier22-case SELECT-two-engines artifact is retained as a diagnostic predecessor and must not be cited as the readiness proof.

## Candidate patch and exact set

Apply only the reviewed `/private/tmp/phase2c-optional-index-remove-three.patch` against exact85f9. It preserves all function bodies and constraints. The final nonunique set is:

- `scoring_authority.calcutta_v1_recalculation_jobs_delivery_terminal`
- `scoring_authority.net_skins_v1_recalculation_jobs_delivery_terminal`
- `scoring_authority.competition_recalculation_jobs_delivery_due`
- `scoring_authority.score_derived_intents_terminal_v1`
- `production_control.score_derived_delivery_attempts_work_v1`

The two unique event/requeue indexes remain unchanged. No historical applied migration should be modified; migration124 is an undeployed candidate here.

## Permanent regression proposal

- Copy `/private/tmp/reliability-phase2c-delivery-index-review.test.mjs` to `test/reliability-phase2c-delivery-index-review.test.mjs`.
- Copy `/private/tmp/phase2c-delivery-indexes.json` to `tools/reliability/phase2c-delivery-indexes.json`.
- Register a `delivery-index-review` suite in the evidence runner. Expected node test count:23(parent+22branches).
- The test uses actual installed claim source, actual installed tick readiness/terminal predicates, current fixture authority, default planner, finite query timeout, realistic cardinality constraints, exact with/without semantic comparison, and rollback verification. Removed index definitions are installed only transaction-locally for historical comparison. The test requires the final exact retained/removed set.
- Update worker-history to read `retainedNonuniqueIndexes` from the same JSON; remove its generated eight-name list. Its full-RPC counterfactual drops only the final five indexes inside rollback.
- Update the certification gate and its negative tests to compare the exact five-name set, not merely a numeric count. Parent/A own this change.
- `phase2c-audit-index-plans.mjs` retains the intent-terminal and attempt-work names unchanged; no source correction is required.
- Preserve85f9 evidence under a historical candidate directory. Regenerate current installation/manifest/annual/full-RPC history evidence after the candidate DDL change; do not overwrite prior results as though they used the new definition.
- Update query, delivery, engineering, migration/source summary and evidence documents to distinguish three removed reference indexes from seven newly retained indexes(5nonunique+2unique).

## Costs and limits

The retained due index changes when Competition status/delivery time changes; terminal partial indexes change on entry/exit from dead-letter state; the attempt-work index grows with immutable audit events. These write costs are real. Removing three redundant indexes reduces avoidable maintenance; isolated write amplification and staged DDL duration remain unmeasured and must not be described as certified.

One plan execution per variant supports plan/row-scope findings, not percentiles or cache-neutral speedup ratios. Fixture setup uses an explicit180s isolated maintenance budget; measured selectors use5s statement and1s lock budgets. Synthetic states bypass triggers/FKs during fixture construction only; CHECK/unique constraints remain active and query execution restores normal trigger mode. The permanent test has been syntax-checked but must run against the newly reviewed candidate before it supplies certification evidence.
