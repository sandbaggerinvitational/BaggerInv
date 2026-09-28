# Consolidated automation catalog

**Audit boundary:** historical evidence and source review only. No Production/staging requests, mutations, builds, deployments or source changes in this audit. Proposed designs are not implemented or approved release evidence. Unknown measurements remain unknown.

All entries are proposed. Competitive approvals are never inferred from an alert.

| ID | Purpose / trigger | Reads | Writes | Owner confirmation | Failure | Receipt | Priority |
|---|---|---|---|---|---|---|---|
| AUTO-001 | Current health snapshot — Continuous / event + bounded heartbeat | Current pointers, health/resource metrics | Derived snapshot only | No | Stale/unknown → degraded, no GO | Observed revisions/time | P0 |
| AUTO-002 | Round GO check — Owner open review and morning | Exact round/pairings/context/HI/access/lease/release/health | None | No | NO-GO with exact reason | Read proof | P0 |
| AUTO-003 | Post-mutation reconciliation — Every critical mutation/response loss | Exact operation receipt and scoped authority | Receipt verification status only | No new competitive action | UNKNOWN retained; same ID only | Required | P0 |
| AUTO-004 | Round closeout check — Final match / owner refresh | Round holes/results/access/leases/pending keys | Derived completeness | No | INCOMPLETE; list exact missing | Required | P0 |
| AUTO-005 | Unknown-outcome resolver — Timeout/lost response | Exact operation ID/current bounded scope | Outcome classification only | Retry follows original authorization | Never infer failure from absent response | Required | P0 |
| AUTO-006 | Stale job detection — Canonical input change | Current job/input/publication references | Detection status | No | Do not supersede if publication/reference unknown | Required | P1 |
| AUTO-007 | Safe unpublished job supersession — Proven exact obsolete input | Current unstarted/terminal job and references | Superseded marker + receipt | No only certified eligible class | Race/stale input → deny | Required | P1 |
| AUTO-008 | Side-game lifecycle advisor — Round/config/publication event | Current config/job/result/publication pointers | Derived eligibility only | Publication always yes | Expose pending/stale reason | Required for action | P1 |
| AUTO-009 | Next safe action — Canonical state event | Operations graph, authority, blockers | Derived recommendation | Competitive action yes | No guessed bypass | Decision inputs | P1 |
| AUTO-010 | Current projections/outbox workers — Canonical event after commit | Event + exact semantic current inputs | Derived projection/result/job | Calculate may be allowed; publish yes | Retry bounded, DLQ visible, score remains Official | Required | P0 |
| AUTO-011 | Scorecard comparison — Director transcribes card | Exact match/hole Official rows | Draft comparison only | Submission/correction yes | Conflict blocks auto commit | Required | P0 |
| AUTO-012 | Readiness regression detection — Pairing/HI/context change | Current affected round only | Alert | No | Suppress duplicate alerts, NO-GO | Required | P0 |
| AUTO-013 | Resource protection — Sustained health degradation | Provider metrics and app pressure | Operational polling/worker throttles only | Preapproved bounded policy | Cannot change competitive facts or blind Lock | Incident record | P0 |
| AUTO-014 | Daily owner brief — Morning/round close/evening | Fresh small health snapshot | Brief artifact only | No | Clearly UNKNOWN if stale | Evidence timestamp | P1 |
| AUTO-015 | Certification orchestration — PR/candidate/freeze | Change graph, fixtures, tests | Isolated evidence/artifacts | Release approval separate | Missing required layer blocks PASS | Manifest | P0 |
| AUTO-016 | Query/static plan guards — PR/CI | Changed SQL and nonlive plans | CI outcome only | No | New scan/cost regression blocks | Artifact | P0 |
| AUTO-017 | Evidence packaging and claim generation — Certification completion | Ledger and freshness graph | Report/manifest | No | Cannot state PASS when proof absent | Artifact hash | P0 |
| AUTO-018 | Synthetic golfers/spectators — Nonlive rehearsal | Seed/fixtures/test role | Isolated mutations only | Environment approval | Fail closed on any Production target | Run receipt | P0 |
| AUTO-019 | Backup restore drill — Scheduled maintenance | Backup in isolated restore | Isolated restored database | Approved environment only | No verified restore → DR unproven | Restore evidence | P0 |
| AUTO-020 | Capacity forecast/scale checklist — T-7/T-3/T-1 | Metrics, benchmark workload, compute limits | Proposal/checklist | Compute change yes | No auto downscale during unfinished jobs | Change receipt | P1 |
| AUTO-021 | Final archive/postmortem/near-miss report — Owner closes tournament | Bounded current snapshot + offline logs | Immutable archive/report | Close yes | No silent waivers; retained unknowns | Required | P1 |
| AUTO-022 | Invariant monitor — Post-mutation / lightweight schedule | Affected current authority rows | Alert only | Correction yes | Integrity red → recommend stop/Lock as appropriate | Required | P0 |
| AUTO-023 | Capability degradation flags — Verified domain outage | Domain health not shared generic 503 | TTL health flags only | Operational policy approval | No auth/scoring implication from side-game flag | Change event | P1 |
| AUTO-024 | Physical acceptance checklist generation — Candidate change | Impact graph and evidence gaps | Checklist only | Owner performs checks | Physical proof never generated from simulator | Manifest | P1 |
| AUTO-025 | Freeze/release gate — Promotion request | Exact candidate/evidence/lock/config | Release only after authority | Owner under release policy | Fail closed; no force bypass | Immutable release receipt | P0 |
| AUTO-026 | Cache invalidation/coalescing — Canonical publication/event | Current public version pointers | Caches only | No | Serve labeled stale safe presentation, never stale score auth | Metrics/event | P1 |
| AUTO-027 | PWA handoff advisor — Native scoring degradation | Local intent class and canonical matching receipt | Handoff status only | Participant initiates | Unknown/conflict blocks duplicate input | Trace IDs no tokens | P0 |
| AUTO-028 | Retention/archive planner — Post-close maintenance | Hot history volumes and retention policy | Plan only until reviewed | Archive action yes | No required audit deletion | Manifest | P2 |
