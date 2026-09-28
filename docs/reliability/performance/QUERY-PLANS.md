# Critical SQL query-plan evidence

## Method and boundary

All 34 invocations passed semantic validation: 17 actual operation paths at 1x and 10x. This was a separate owned local PostgreSQL 17 run with `auto_explain` nested statements, analyze and buffers enabled; no Production query ran. Setup/reset is excluded from logging. These durations include plan instrumentation and must not be compared with baseline latency.

[QUERY-PLAN-RESULTS.json](QUERY-PLAN-RESULTS.json) retains query-text hashes, every distinct query/plan shape, invocation counts, per-node numeric ranges and the highest-duration representative for each group. Raw SQL text is omitted. Repeated observations were compacted from the 123,090,749-byte task-created capture; its SHA-256 is retained in `compaction`. No observation count or distinct index/scan shape was dropped. `test/reliability-query-plan-evidence.test.mjs` proves grouping preserves scan changes and work ranges.

There are 21,572 nested logged executions at each scale. These include SQL inside helper functions and repeated statements; they are **not** 21,572 network requests or unique SQL families. Parent and child work overlaps: do not add node rows/buffers/durations and call the sum unique rows or total request time.

## Observed statement and shape counts

Counts were equal across 1x/10x; each operation succeeded at both scales.

| Operation | Nested logged executions per invocation | Distinct query / plan shapes |
|---|---:|---:|
| score-write | 595 | 78 |
| score-readback | 6 | 6 |
| participant-today | 9 | 9 |
| matches | 6 | 6 |
| leaders | 8 | 8 |
| prepare-match | 818 | 146 |
| round-open | 9490 | 125 |
| round-lock | 1985 | 122 |
| round-resume | 6424 | 132 |
| finalize | 380 | 94 |
| net-skins-read | 649 | 37 |
| net-skins-calculation | 398 | 12 |
| calcutta-read | 254 | 36 |
| calcutta-calculation | 233 | 15 |
| odds-read | 18 | 18 |
| odds-calculation | 26 | 23 |
| director-current | 273 | 53 |

## Material observations

| Path | 1x node observation | 10x node observation | Interpretation / next work |
|---|---|---|---|
| Score write | 595 nested executions; 78 query/shape groups | Same counts; sampled history shortcut protected | Statement-count stability plus local latency supports this branch. No claim about eligible receipts, durable commit or every trigger distribution. |
| Net Skins read | Jobs sequential scan: up to 285 returned + 285 removed by filter | Up to 2,845 returned + 2,845 removed; setup-audit bitmap branch removed up to 480 rows per observed loop | Exact current-job/status lookup and setup-audit dependency scope deserve review. No index has been added. |
| Calcutta read | Jobs scan: 1 returned, 744 filtered | 1 returned, 7,449 filtered | Strong current-pointer/index opportunity even though absolute local latency remains modest. Inspect exact filter/order and existing indexes before designing a change. |
| Director current state | Jobs scans return 745 Calcutta / 569 Net Skins rows | 7,450 / 5,690 rows | Current summary still visits growing job history. Design bounded current/active-job authority separately. |
| Lock Round | Small match-history lookup | Score-mutation bitmap node up to 158 returned + 17 filtered; revision-history node up to 158 | Consistent with observed growth, but not proof of a single cause. Review match-scoped receipt/revision history and source construction. |
| Matches | Small current snapshot lookup | Snapshot sequential node returns 24 and filters 240 | An unrelated-year sensitivity candidate; measured latency remained roughly bounded at this size. |
| Odds read | Small published snapshot lookup | Index scan returns 5, filters 65 | Indexed access can still filter history. Review current publication predicates and intentional historical display scope. |
| Prepare/Open/Resume | Current course-hole bitmap lookup returns 54 | Same 54 | Current tournament facts are bounded here; 12 repeated match transitions explain substantial nested work but do not by themselves prove pathological history dependence. |

Node counts above are observed maxima, not unique rows for the whole operation. One group may invoke a node repeatedly; the artifact retains Actual Loops and per-node metric ranges. The root operation remains the unit of correctness.

## Sort, aggregate and spill findings

Observed sorting includes quicksort and top-N heapsort; some nodes lack a runtime sort method. **No temporary written blocks were observed** in the captured executions. This does not guarantee no spill under different payload sizes, settings, concurrency or eligible-history branches. Current-tournament JSON construction and hashing remain in the synchronous Calcutta trigger chain; source and latency evidence must be read alongside plan observations.

A sequential scan over a tiny fixed table is not a release defect. Plan regression gates should compare cardinality growth, rows filtered, selectivity, relevant indexes, temporary work and latency under matched fixtures. Do not require byte-identical plans, and do not declare every sequential scan wrong.

## Proposed plan gate

- Preserve the query-family/shape inventory, fixture/source identity and local resource settings.
- Fail an eligible future test if known irrelevant historical work executes on a score path, using the deterministic NA019 spy as well as plan evidence.
- Flag current-pointer reads that begin touching growing cross-year/job history, index-to-scan changes on material tables, larger filtered ranges or new external sorts/temp blocks. Require review against measured latency and semantic needs.
- Establish thresholds from repeated matched-environment runs. These are proposed gates, not a deployed tournament-release system.

Reproduce using `node tools/reliability/capture-query-plans.mjs`. The entrypoint accepts no target arguments and creates/destroys its own socket-only cluster. Running expensive `EXPLAIN ANALYZE` against live Production is prohibited.
