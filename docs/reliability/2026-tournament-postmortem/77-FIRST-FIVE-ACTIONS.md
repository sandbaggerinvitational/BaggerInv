# Exactly five next actions

These are the authoritative first five throughout this package. Review and approval precede implementation. No action was executed by this audit.

## 1. Review the incident register and preserve the approved evidence and requirements durably.

- **Why:** Prevents losing temporary proof or implementing against an overstated root cause.
- **Owner:** Owner + engineering
- **Dependencies:** This audit review; approval before repository/artifact-store copy
- **Deliverable:** Reviewed incident/requirement baseline, sanitized evidence manifest and retained artifacts
- **Done:** Known/unknown causes, P0 scope and proof gaps are accepted; checksums and locations verified
- **Delay:** Evidence expires and conclusions become harder to reproduce

## 2. Implement correlation and domain-specific operational telemetry in an isolated environment.

- **Why:** Database outages and individual native resets lacked causal traces.
- **Owner:** Backend + infrastructure + native telemetry contract
- **Dependencies:** Approved redaction/event contract from FIRST-1
- **Deliverable:** Request/operation/mutation chain, score phases, typed health and retained provider metrics
- **Done:** An injected timeout is traceable end-to-end without secrets; missing metrics appear unknown
- **Delay:** Later optimization remains unmeasurable and future incidents remain opaque

## 3. Build the Production-shaped benchmark and initial 2026 Never Again fixtures.

- **Why:** Real SQL, SQLite persistence and history scale exposed failures clean fixtures missed.
- **Owner:** Database + certification + native QA
- **Dependencies:** Sanitized isolated dataset/seed and exact retained source; no live queries
- **Deliverable:** Exact RPC/SQL/persistence reproductions with plans, timings and evidence ledger
- **Done:** Old claim/queue/score-timeout failures reproduce; baseline includes accumulated history and fixed seed
- **Delay:** New patches may repeat wrong-layer certification

## 4. Approve the score-path, error/navigation and semantic-dependency contracts before implementation.

- **Why:** The largest recurring classes cross component boundaries.
- **Owner:** Backend/native/Director engineering with owner scope review
- **Dependencies:** Audited incidents and initial observations; no need to wait for every benchmark
- **Deliverable:** ADRs, state machines, exact semantic inputs, P0 acceptance tests and impact graph
- **Done:** Feature failure cannot invalidate identity; score transaction scope and queue serialization are explicit
- **Delay:** Native and backend changes could diverge or add another special-case exception

## 5. Establish enforced diagnostic isolation, measured capacity gates and a non-Production restore drill.

- **Why:** Live historical diagnostics and unverified resource headroom endangered availability.
- **Owner:** Infrastructure + database
- **Dependencies:** Approved roles/target environments; metrics and representative workload
- **Deliverable:** Bounded read role/admission policy, resource baseline, restore evidence and scale runbook
- **Done:** Heavy diagnostics cannot reach scoring primary; representative load/restore proves the chosen limits
- **Delay:** An otherwise correct release can still fail under resource pressure
