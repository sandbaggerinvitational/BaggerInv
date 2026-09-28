# Residual risk register

These risks remain after the proposed controls; there is no zero-risk promise. Likelihood cannot be calibrated from retained 2026 telemetry.

| ID | Risk | Likelihood | Impact | Mitigation | Detection | Fallback | Residual |
|---|---|---|---|---|---|---|---|
| RISK-001 | Provider database/API outage | Unquantified | Scoring unavailable | Capacity, restore and failure drills | Provider and domain health | Physical cards | Nonzero provider/common-dependency risk |
| RISK-002 | New scoring/SQL regression | Unquantified | Incorrect or blocked canonical operation | Exact SQL, property, plan and Never Again gates | Invariant and latency telemetry | Fail closed and use cards | Tests cannot cover every input |
| RISK-003 | Device/network intent edge case | Unquantified | Unknown or blocked score | Normalized state/persistence and physical matrix | Intent/error correlation | Safe PWA handoff and cards | OS and radio variation remain |
| RISK-004 | Semantic dependency regression | Unquantified | Future round blocked | Narrow declarations and chronology | GO and Next Safe Action | Supported audited clearance | A new lifecycle feature can expand the graph |
| RISK-005 | Human gross/ownership mistake | Unquantified | Wrong reviewed input | Before/after review and audits | Conflict and completeness checks | Owner correction from original record | Human judgment remains necessary |
| RISK-006 | Metrics/alerts blind spot | Unquantified | Late diagnosis | Independent telemetry retention and scrape health | Missing-data alert | Bounded manual health checks and cards | Provider data may still be incomplete |
| RISK-007 | Restore/cutover defect | Unquantified | Data loss or long outage | Regular isolated restore and reconciliation | Drill and RPO evidence | Physical records and durable receipts | No zero-loss claim without an infrastructure guarantee |
| RISK-008 | Automation unintended mutation | Unquantified | Competitive/financial corruption | Named operation class, approval, idempotency and RLS | Receipt and invariants | Stop or roll back if compatible | Implementation and security review required |
| RISK-009 | Premature freeze or overstated PASS | Unquantified | Known failure class ships | Proof generator and hard gates | Missing-layer dashboard | NO-GO | Owner pressure cannot remove residual uncertainty |
| RISK-010 | Single-owner operational overload | Observed in 2026; future unquantified | Delay and recovery burden | Mobile Director, runbooks and alerts | Manual intervention count | Delegated preapproved operations and cards | Owner judgment remains a bottleneck |

