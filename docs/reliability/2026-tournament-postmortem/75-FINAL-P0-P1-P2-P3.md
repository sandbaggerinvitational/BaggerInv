# Final priority policy and nonnegotiable gates

A P0 historical incident made canonical scoring or round completion unavailable, threatened integrity, made core authority unavailable, or removed all scoring fallbacks. A native navigation annoyance with a safe PWA is not automatically P0. A P0 future requirement blocks responsible primary tournament use when missing. P1 covers important robustness and product operability; P2 covers quality; P3 covers optional future features. Do not inflate every bug into P0.

## P0 — do not use as primary 2027 tournament software without these control groups

| Gate | Required outcome | Requirements | Acceptance |
|---|---|---|---|
| P0-CORE | Bounded canonical scoring and recovery | BE-SCORE-001/002/003/004; DB-PERF-001/002; DIR-REC-001 | Exact all-format SQL/API, history scale, idempotency, rollback, security and owner card drill |
| P0-NATIVE | Contain feature failures and repair persistent intent state | B11-NAV-*; B11-SCORE-* critical requirements | Physical multi-hole, lost-ACK, relaunch, network and multi-device tests with server authority unchanged |
| P0-ROUND | Self-certifying preparation, round controls, GO and closeout | DIR-OPS-001/002; DIR-CLOSE-001 | Full R3 chronology and atomic 12-or-0 behavior with unknown-outcome recovery |
| P0-LIFECYCLE | Real SQL side-game lifecycle and semantically compatible dependencies | BE-JOB-*; BE-DEP-* critical requirements | Installed SQL claim/process/complete/read; stale-job and publication sequence; no hidden blocker |
| P0-INFRA | Measured capacity, diagnostic isolation and restore | INFRA/OPS critical requirements; OPS-SAFE-001; OPS-DR-001 | Matched-compute soak, headroom and restore; heavy primary reads denied |
| P0-PROOF | Required proof layers and freeze enforcement | CERT-001/NA/SYN/PHY; REL-001 | Never Again, full synthetic, physical and owner PASS; no P0 NOT PROVEN |
| P0-OBS | Diagnosable typed health, operations and scoring | OBS-CORE-001; core OBS requirements | Trace a known failure end to end; alerts and unknown status are accurate |
| P0-FALLBACK | First-class PWA fallback, safe handoff and physical recovery | PWA-001; DIR-REC-001 | Hosted configuration, physical fallback and pending-intent duplication prevention |
| P0-SEC | Security and competitive-authority invariants | SEC-001 | RLS, role, idempotency, private-data and canonical-result tests |

These groups are overlapping implementation, test and security dimensions, not nine independent rewrites. Every P0 requires implementation, automated tests, integration and performance proof where applicable, required physical proof, a runbook, observability and retained acceptance. In this audit, all implementation dimensions are NOT PROVEN and were not performed.

## P1

Pre-entry canonical strokes and Live copy; mixed side-game history and presentation; job visibility and safe unpublished supersession; mobile Director clarity and Next Safe Action; detailed ownership-correction UX; retention and current-pointer cleanup; client telemetry coverage; impact-selected testing and capability health. A P1 that blocks a mandatory rehearsal cannot be accepted merely because its label is P1.

## P2/P3

P2: cosmetic More polish and accessibility refinements beyond required readability, optional dashboard layout, and advanced near-miss report presentation. P3: new side games or analytics, a major visual redesign, unproven microservices, or an unjustified AWS migration. Accepted limitations require an ID, impact, competitive impact, workaround, owner acceptance and expiry. Canonical scoring, round completion, security and capacity cannot be casually waived.

## Nonnegotiable before 2027

Actual SQL and physical proof; a full chronological R3/side-game flow; history off the critical scoring path; measured resource headroom; recoverable unknown outcomes; an owner physical-card workflow; no engineering required for normal golf; and zero P0 unproven. These follow directly from INC-006, INC-010 through INC-020, and INC-022 through INC-025.

