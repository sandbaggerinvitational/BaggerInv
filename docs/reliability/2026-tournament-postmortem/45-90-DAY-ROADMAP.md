# 90-day dependency-driven roadmap

Dates are targets contingent on engineering capacity and evidence gates, not a promise. If a P0 prerequisite fails, downstream certification moves; do not waive it.

| ID | Days | Priority | Dependencies | Deliverable | Acceptance | Proof layer | Blocks work |
|---|---|---|---|---|---|---|---|
| D01 | 1–30 | P0 | PH0 | Evidence review, retention and incident fixtures | Artifacts checksummed; claims and gaps accepted | SOURCE / SQL / INTEGRATION | YES |
| D02 | 1–30 | P0 | D01 | Correlation and database/resource telemetry | Timeout traced; no PII; missing metrics visible | API / SQL / STAGING | YES |
| D03 | 1–30 | P0 | D01 | Historical benchmark and Never Again core | Exact old SQL, Date and 57014 cases; reproducible plan and sample | SQL / INTEGRATION / PERFORMANCE | YES |
| D04 | 1–30 | P0 | D02, D03 | Bounded score path, current pointers and admission | No historical critical scan; idempotency, rollback and security proven | SQL / API / PERFORMANCE | YES |
| D05 | 1–30 | P0 | D01 | Reviewed navigation, error and serialization contracts | State ownership, typed errors and canonical comparison explicit | SOURCE / DESIGN REVIEW | YES |
| D06 | 31–60 | P0 | D04 | Semantic dependencies and durable jobs | Post-R2/R3 and side-game chronology; no broad hash trap | SQL / API / FULL LIFECYCLE | YES |
| D07 | 31–60 | P0 | D05, D04 | Build 11 queue, navigation and telemetry | All P0 state and recovery fault tests; upgrade from Build 10 | SIMULATOR / INTEGRATION | YES |
| D08 | 31–60 | P0 | D06 | Director GO, Prepare, Open, status and closeout | Atomic receipt/readback; mobile operability | SQL / API / PHYSICAL | YES |
| D09 | 31–60 | P0 | D04, D08 | Director physical-card recovery | Match, skip, conflict, race and lost-ACK proof | SQL / API / OWNER | YES |
| D10 | 31–60 | P0 | D02, D03, D04 | Capacity, connection and restore proof | Matched-compute budgets and rehearsed restore | PERFORMANCE / FAILURE | YES |
| D11 | 31–60 | P1 | D01, D03 | Impact graph and claim orchestrator | Missing physical P0 proof cannot PASS; expiration tests | CI / INTEGRATION | YES |
| D12 | 61–90 | P0 | D06–D11 | Full synthetic tournament and failure injection | All critical checklists PASS; no engineering exceptions | FULL LIFECYCLE / PERFORMANCE | YES |
| D13 | 61–90 | P0 | D12 | Physical iPhone/PWA beta and owner rehearsal | 18 holes in all formats, radios, long-lived use and scorecards | PHYSICAL / OWNER | YES |
| D14 | 61–90 | P1 | D12, D13 | Runbooks, evidence and freeze readiness review | Remaining gaps measured; noncritical items accepted | EVIDENCE / REVIEW | NO |

Days 1–30 establish evidence, telemetry, baselines and a bounded critical path. Days 31–60 implement semantic lifecycle, Director, native and capacity controls. Days 61–90 integrate the synthetic and physical program and measure remaining work. Final 2027 certification must occur again near the actual frozen tournament candidate; an early 90-day rehearsal is not evidence for later changed code or configuration.

