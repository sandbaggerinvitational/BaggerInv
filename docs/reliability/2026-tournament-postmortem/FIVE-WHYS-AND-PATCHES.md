# Five Whys, counterfactuals, and patch versus prevention

These are blameless causal interpretations. Immediate technical causes are evidenced; process whys are STRONGLY SUPPORTED unless an exact report proves the missing gate.

## Native queue — `2026-INC-006`

1. The exact persisted `Date` differed by a binary tick.
2. Whole-record equality treated a serialization difference as concurrent authority.
3. Queue transitions returned noncanonical in-memory values and applied a sticky same-identity fail-closed latch after persistence failure.
4. Fixtures did not exercise deterministic fractional `Date` round trips through real SQLite across a physical multi-hole chronology.
5. Certification accepted component and simulator evidence without the required physical persistence proof.

**Immediate recovery:** full relaunch is a bounded exact-code path for a matching Official intent. It is not guaranteed, was not physically proven, and does not certify continued native scoring.

**Systemic prevention:** normalized persistence or an explicit durable revision, complete intent-state UX, `NA-2026-006`, chronological physical tests, and operation-scoped observability—not only the local fix.

## R3 preparation — `2026-INC-017`

1. Canonical contexts remained S1 and unprepared.
2. Pairing commit explicitly did not prepare; subsequent side-game bindings blocked the normal Prepare operation.
3. The workflow required hidden ordering and broad dependency guards.
4. No complete post-R2 → paired → prepared → configured rehearsal and readback gate existed.
5. Operational readiness was not represented as product-owned evidence state.

**Systemic prevention:** linked requirement proof chain, `NA-2026-017`, chronological test, self-certifying receipt, and operation-scoped observability—not only the local fix.

## Score timeout — `2026-INC-019`

1. The score transaction hit SQL `57014`.
2. Synchronous Calcutta compatibility evaluated costly historical fingerprints.
3. Derived side-game work shared the scoring transaction; cost scaled with history and query planning.
4. Fixtures were small and clean; no critical-path growth or plan budget was enforced.
5. Test-count and correctness certification omitted resource and performance proof.

**Systemic prevention:** linked requirement proof chain, `NA-2026-019`, chronological and accumulated-history tests, a bounded critical path, and operation-scoped observability—not only the local fix.

## R1 Open — `2026-INC-013`

1. The Access step was denied after the first Mark Live.
2. An audit trigger advanced activation inside the atomic transaction.
3. Release identity and ordinary audit state were coupled.
4. The first write and whole-round multistep sequence were not executed together in the gate.
5. Cross-domain chronological testing had no explicit owner or gate.

**Systemic prevention:** linked requirement proof chain, `NA-2026-013`, full atomic chronology, and operation-scoped observability—not only the local fix.

## Dual-client fallback — `2026-INC-014`

1. PWA Continue Scoring failed when native scoring was blocked.
2. The Production signing secret was missing.
3. Preview configuration proof did not establish Production capability.
4. The fallback had not been physically rehearsed through a hosted new-hole Save.
5. The fallback was listed as available without independent environment and physical evidence.

**Systemic prevention:** linked requirement proof chain, `NA-2026-014`, hosted capability validation, physical Save rehearsal, and operation-scoped observability—not only the local fix.

## Patch versus systemic prevention

| Incident | Necessary 2026 patch / recovery | Why it was insufficient | Long-term prevention |
|---|---|---|---|
| `2026-INC-010` Calcutta SQL | Remove invalid qualifier | Other unexecuted SQL branches can fail | Real SQL lifecycle plus static lint; `NA-2026-010` |
| `2026-INC-011` activation job | Exact carry-forward | A later compatible deployment could strand another job | Versioned job compatibility and supersession; `NA-2026-011` |
| `2026-INC-012` Net Skins SQL | Correct 7 qualifiers | Mixed lifecycle presentation was still missing | SQL plus native chronology; `NA-2026-012` and `NA-2026-009` |
| `2026-INC-013` R1 Open | Stop audit activation increment | Other cross-domain first-write hazards remain possible | Atomic sequence contract tests; `NA-2026-013` |
| `2026-INC-006` native queue | Bounded relaunch or use PWA | The same `Date` fault can recur; relaunch was not physically certified | Normalized persistence and formal intent state; `NA-2026-006` |
| `2026-INC-014` PWA | Install missing key | Future environment drift remains possible | Capability/configuration release gate; `NA-2026-014` |
| `2026-INC-016` Odds / R3 pair | Exact stale-job supersession and withdrawal | The owner still had to understand hidden state | Lifecycle engine and dependency UX; `NA-2026-016` |
| `2026-INC-017` R3 Prepare | Exact 12-or-0 recovery | One-off scope cannot become a generic exception | Ordinary semantic preparation workflow; `NA-2026-017` |
| `2026-INC-019` score timeout | Gate eligibility before historical predicates | Other derived hooks can regress | Outbox, current pointers, and history off the critical path; `NA-2026-019` |
| `2026-INC-022` through `024` database outage/capacity | Wait; owner selected a compute upgrade | Causality and headroom remain unknown; code cost was unchanged | Metrics, admission, and capacity rehearsal; `NA-2026-022` through `NA-2026-024` |
| `2026-INC-020` cards | Canonical manual entry | Engineering dependency remains | Director physical recovery; `NA-2026-020` |

Counterfactual: more compute might delay a costly query timeout. It cannot prove bounded cost or fix invalid SQL or `Date` precision. A complete SQL lifecycle would catch `42883`; a persistence-fault matrix would catch the `Date` defect; a chronological rehearsal would expose the R3 ordering dependency; correlation telemetry would improve outage diagnosis but would not guarantee prevention. An unknown provider trigger does not excuse untested restart behavior.

Defense in depth for high-impact failures: architecture isolation → exact regression → realistic fixture and plan budget → observability and admission → rehearsed PWA/card recovery → canonical reconciliation. No single control is expected to catch everything.

