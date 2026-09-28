# Proposed P0/P1 implementation requirements

These are audit recommendations, **not owner-approved implementation authority**. No implementation was performed. Requirements overlap intentionally across layers; dependency IDs and linked acceptance define work packages. “PROVEN” in historical evidence does not mean the proposed fix has passed.

<a id="obs-core-001"></a>

## OBS-CORE-001 — Correlate score, operation, API, database and native outcome telemetry

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-006", "2026-INC-007", "2026-INC-018", "2026-INC-019", "2026-INC-022", "2026-INC-023", "2026-INC-024", "2026-INC-025", "2026-INC-026"]
- **Requirement:** Correlate score, operation, API, database and native outcome telemetry
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["One test mutation traces request ID → mutation ID → canonical receipt with no secrets", "Report latency, timeout and unknown outcome separately; preserve release/activation and proof layer"]
- **Test Ids:** ["TEST-OBS-CORE-001", "NA-2026-006", "NA-2026-007", "NA-2026-018", "NA-2026-019", "NA-2026-022", "NA-2026-023", "NA-2026-024", "NA-2026-025", "NA-2026-026"]
- **Physical Required:** false
- **Dependencies:** []
- **Automation Ids:** ["AUTO-003"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="cert-001"></a>

## CERT-001 — Require evidence by capability and proof layer before readiness claims

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-005", "2026-INC-006", "2026-INC-010", "2026-INC-012", "2026-INC-017", "2026-INC-019", "2026-INC-024"]
- **Requirement:** Require evidence by capability and proof layer before readiness claims
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Missing or stale P0 proof produces NO-GO", "Physical, SQL, chronological and performance gates cannot be substituted by unit counts"]
- **Test Ids:** ["TEST-CERT-001", "NA-2026-005", "NA-2026-006", "NA-2026-010", "NA-2026-012", "NA-2026-017", "NA-2026-019", "NA-2026-024"]
- **Physical Required:** true
- **Dependencies:** []
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="perf-001"></a>

## PERF-001 — Establish exact critical RPC performance baselines on accumulated synthetic history

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-019", "2026-INC-023"]
- **Requirement:** Establish exact critical RPC performance baselines on accumulated synthetic history
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Benchmarks record compute, seed, rows, plans, sample count, cold/warm state and distribution", "Current/2x/5x/10x history does not convert score path into history scan"]
- **Test Ids:** ["TEST-PERF-001", "NA-2026-019", "NA-2026-023"]
- **Physical Required:** false
- **Dependencies:** []
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="dir-ops-001"></a>

## DIR-OPS-001 — Evaluate bounded canonical Round GO and explain each blocker

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-013", "2026-INC-016", "2026-INC-017", "2026-INC-018"]
- **Requirement:** Evaluate bounded canonical Round GO and explain each blocker
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["All pairings/context/HI/course/tee/access/lease/health dependencies checked by current pointers", "Stale health or missing evidence yields NO-GO, never implicit GO"]
- **Test Ids:** ["TEST-DIR-OPS-001", "NA-2026-013", "NA-2026-016", "NA-2026-017", "NA-2026-018"]
- **Physical Required:** true
- **Dependencies:** ["OBS-CORE-001"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-009"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="dir-ops-002"></a>

## DIR-OPS-002 — Make Prepare/Open/Lock/Resume/Finalize self-certifying idempotent operations

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-013", "2026-INC-017", "2026-INC-018"]
- **Requirement:** Make Prepare/Open/Lock/Resume/Finalize self-certifying idempotent operations
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Whole-round 12-or-0 atomicity; immutable key/fingerprint and durable receipt", "Lost response resolves by exact receipt; changed fingerprint explained; no blind new request"]
- **Test Ids:** ["TEST-DIR-OPS-002", "NA-2026-013", "NA-2026-017", "NA-2026-018"]
- **Physical Required:** true
- **Dependencies:** ["DIR-OPS-001"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-009"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="dir-rec-001"></a>

## DIR-REC-001 — Provide audited physical scorecard recovery through canonical scoring authority

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-020"]
- **Requirement:** Provide audited physical scorecard recovery through canonical scoring authority
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Matching Official holes skipped; missing submitted once; differences require owner review", "Receipt binds physical source and resulting canonical revisions; 18-hole recovery rehearsed"]
- **Test Ids:** ["TEST-DIR-REC-001", "NA-2026-020"]
- **Physical Required:** true
- **Dependencies:** ["DIR-OPS-002"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-014"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="ops-safe-001"></a>

## OPS-SAFE-001 — Enforce tournament diagnostic admission and workload isolation

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-023", "2026-INC-024"]
- **Requirement:** Enforce tournament diagnostic admission and workload isolation
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Live diagnostic role cannot mutate; allowlisted indexed current reads only", "Timeout/row/payload/concurrency limits enforced server-side; heavy requests denied/routed to clone"]
- **Test Ids:** ["TEST-OPS-SAFE-001", "NA-2026-023", "NA-2026-024"]
- **Physical Required:** false
- **Dependencies:** []
- **Automation Ids:** ["AUTO-013"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="dir-close-001"></a>

## DIR-CLOSE-001 — Certify round and tournament completeness with canonical scoped readback

- **Priority:** P0
- **Origin:** OPERATIONS-DERIVED
- **Incident Ids:** ["2026-INC-017", "2026-INC-020"]
- **Requirement:** Certify round and tournament completeness with canonical scoped readback
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Expected Final/Official/result totals and zero access/leases verified", "Side games complete or explicitly waived separately; golf champion cannot be changed by financial publication"]
- **Test Ids:** ["TEST-DIR-CLOSE-001", "NA-2026-017", "NA-2026-020"]
- **Physical Required:** true
- **Dependencies:** ["DIR-OPS-001"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-009"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="be-contract-001"></a>

## BE-CONTRACT-001 — Freeze typed versioned errors, semantic lifecycle and scoring contracts

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-006", "2026-INC-007", "2026-INC-008", "2026-INC-009", "2026-INC-014", "2026-INC-022"]
- **Requirement:** Freeze typed versioned errors, semantic lifecycle and scoring contracts
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Feature/network/DB errors cannot claim invalid identity without evidence", "Installed supported native and PWA contract tests cover mixed lifecycle and degraded responses"]
- **Test Ids:** ["TEST-BE-CONTRACT-001", "NA-2026-006", "NA-2026-007", "NA-2026-008", "NA-2026-009", "NA-2026-014", "NA-2026-022"]
- **Physical Required:** true
- **Dependencies:** []
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="pwa-001"></a>

## PWA-001 — Maintain independently certified PWA scoring and safe client handoff

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-006", "2026-INC-014", "2026-INC-015", "2026-INC-019"]
- **Requirement:** Maintain independently certified PWA scoring and safe client handoff
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Signing configuration absence fails release gate", "No cross-client new mutation until pending native outcome resolved or exact Official hole skipped", "Physical 18-hole all-format Save/Next and fallback drill pass"]
- **Test Ids:** ["TEST-PWA-001", "NA-2026-006", "NA-2026-014", "NA-2026-015", "NA-2026-019"]
- **Physical Required:** true
- **Dependencies:** ["BE-CONTRACT-001"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="auto-job-001"></a>

## AUTO-JOB-001 — Expose and safely supersede provably stale unpublished side-game jobs

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-011", "2026-INC-016"]
- **Requirement:** Expose and safely supersede provably stale unpublished side-game jobs
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Only terminal/unstarted, unpublished, unreferenced obsolete inputs eligible", "Concurrent publication supersession race denies safely; immutable supersession receipt"]
- **Test Ids:** ["TEST-AUTO-JOB-001", "NA-2026-011", "NA-2026-016"]
- **Physical Required:** false
- **Dependencies:** ["BE-CONTRACT-001"]
- **Automation Ids:** ["AUTO-010"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="dir-next-001"></a>

## DIR-NEXT-001 — Compute next safe action from exact tournament phase

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-016", "2026-INC-017", "2026-INC-018"]
- **Requirement:** Compute next safe action from exact tournament phase
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["R3 night-before order completes without SQL/Codex", "Required, optional and blocked actions exposed with exact dependency and supported clearance"]
- **Test Ids:** ["TEST-DIR-NEXT-001", "NA-2026-016", "NA-2026-017", "NA-2026-018"]
- **Physical Required:** true
- **Dependencies:** ["DIR-OPS-001", "AUTO-JOB-001"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="dir-fin-001"></a>

## DIR-FIN-001 — Make ownership correction immutable, price-preserving and reviewable

- **Priority:** P1
- **Origin:** OPERATIONS-DERIVED
- **Incident Ids:** ["2026-INC-021"]
- **Requirement:** Make ownership correction immutable, price-preserving and reviewable
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Published edit denied; withdrawal consequences shown", "Exact fractions total 100%; all unchanged prices and $18,500 preserved in 2026 fixture", "New auction/publication/result revisions retained with reason and receipt", "Supported last-draft-entry removal preserves historical revisions and requires explicit owner review."]
- **Test Ids:** ["TEST-DIR-FIN-001", "NA-2026-021"]
- **Physical Required:** true
- **Dependencies:** []
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-012"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="cert-na-001"></a>

## CERT-NA-001 — Convert every material 2026 failure into a Never Again regression

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-001", "2026-INC-002", "2026-INC-003", "2026-INC-004", "2026-INC-005", "2026-INC-006", "2026-INC-007", "2026-INC-008", "2026-INC-009", "2026-INC-010", "2026-INC-011", "2026-INC-012", "2026-INC-013", "2026-INC-014", "2026-INC-015", "2026-INC-016", "2026-INC-017", "2026-INC-018", "2026-INC-019", "2026-INC-020", "2026-INC-021", "2026-INC-022", "2026-INC-023", "2026-INC-024"]
- **Requirement:** Convert every material 2026 failure into a Never Again regression
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Old behavior reproduced where evidence permits; proposed behavior asserted", "Missing historical root cause remains fault-scenario test, not fabricated causal reproduction"]
- **Test Ids:** ["TEST-CERT-NA-001", "NA-2026-001", "NA-2026-002", "NA-2026-003", "NA-2026-004", "NA-2026-005", "NA-2026-006", "NA-2026-007", "NA-2026-008", "NA-2026-009", "NA-2026-010", "NA-2026-011", "NA-2026-012", "NA-2026-013", "NA-2026-014", "NA-2026-015", "NA-2026-016", "NA-2026-017", "NA-2026-018", "NA-2026-019", "NA-2026-020", "NA-2026-021", "NA-2026-022", "NA-2026-023", "NA-2026-024"]
- **Physical Required:** true
- **Dependencies:** ["CERT-001"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="cert-syn-001"></a>

## CERT-SYN-001 — Generate deterministic chronological synthetic tournament with accumulated history

- **Priority:** P0
- **Origin:** ARCHITECTURE-DERIVED
- **Incident Ids:** ["2026-INC-010", "2026-INC-012", "2026-INC-016", "2026-INC-017", "2026-INC-019"]
- **Requirement:** Generate deterministic chronological synthetic tournament with accumulated history
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Seeded 24-player 54-hole flow incl. all side-game transitions, R3 pairing/preparation and financial correction", "Independent expected outputs; repeat reset yields identical authority and results"]
- **Test Ids:** ["TEST-CERT-SYN-001", "NA-2026-010", "NA-2026-012", "NA-2026-016", "NA-2026-017", "NA-2026-019"]
- **Physical Required:** false
- **Dependencies:** ["PERF-001"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="cert-phy-001"></a>

## CERT-PHY-001 — Certify multi-user physical iPhone, PWA and owner tournament rehearsal

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-005", "2026-INC-006", "2026-INC-007", "2026-INC-014", "2026-INC-017", "2026-INC-018", "2026-INC-020"]
- **Requirement:** Certify multi-user physical iPhone, PWA and owner tournament rehearsal
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Two physical iPhones and participant accounts across Wi-Fi/cellular, app kill and network switches", "All three formats for 18 holes; native/PWA handoff; Director recovery without engineering"]
- **Test Ids:** ["TEST-CERT-PHY-001", "NA-2026-005", "NA-2026-006", "NA-2026-007", "NA-2026-014", "NA-2026-017", "NA-2026-018", "NA-2026-020"]
- **Physical Required:** true
- **Dependencies:** ["CERT-SYN-001"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="ops-dr-001"></a>

## OPS-DR-001 — Test restore and physical-card disaster recovery before tournament

- **Priority:** P0
- **Origin:** OPERATIONS-DERIVED
- **Incident Ids:** ["2026-INC-019", "2026-INC-020", "2026-INC-022", "2026-INC-024"]
- **Requirement:** Test restore and physical-card disaster recovery before tournament
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Restore non-Production backup and verify score/result authority, identities excluded or secured", "Reconcile unsynced physical golf without duplicate Official holes"]
- **Test Ids:** ["TEST-OPS-DR-001", "NA-2026-019", "NA-2026-020", "NA-2026-022", "NA-2026-024"]
- **Physical Required:** true
- **Dependencies:** []
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="rel-001"></a>

## REL-001 — Enforce tournament freeze, compatible activation and complete release evidence

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-011", "2026-INC-013", "2026-INC-014"]
- **Requirement:** Enforce tournament freeze, compatible activation and complete release evidence
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Candidate cannot freeze with missing P0/physical/SQL/performance evidence", "Compatible release change cannot strand job or mutate activation during score transaction", "Rollback rehearsed with old clients and additive schema"]
- **Test Ids:** ["TEST-REL-001", "NA-2026-011", "NA-2026-013", "NA-2026-014"]
- **Physical Required:** false
- **Dependencies:** ["CERT-001"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="dir-mob-001"></a>

## DIR-MOB-001 — Make normal operations mobile-usable with receipts and human-readable blockers

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-016", "2026-INC-017", "2026-INC-018", "2026-INC-020"]
- **Requirement:** Make normal operations mobile-usable with receipts and human-readable blockers
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Owner on iPhone can review effects, confirm, inspect receipt and recover unknown status", "No routine Terminal/log/SQL dependency in rehearsal"]
- **Test Ids:** ["TEST-DIR-MOB-001", "NA-2026-016", "NA-2026-017", "NA-2026-018", "NA-2026-020"]
- **Physical Required:** true
- **Dependencies:** ["DIR-OPS-002"]
- **Automation Ids:** ["AUTO-003"]
- **Runbook Ids:** ["RUNBOOK-009"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="sec-001"></a>

## SEC-001 — Preserve participant, spectator, Director and service-role boundaries

- **Priority:** P0
- **Origin:** SECURITY-DERIVED
- **Incident Ids:** []
- **Requirement:** Preserve participant, spectator, Director and service-role boundaries
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["New recovery/automation operations retain RLS, authorization, idempotency and audit", "Spectators never receive money-game/private fields; secrets absent from telemetry/evidence"]
- **Test Ids:** ["TEST-SEC-001"]
- **Physical Required:** false
- **Dependencies:** []
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="hist-001"></a>

## HIST-001 — Archive completed operational payloads without weakening audit history

- **Priority:** P1
- **Origin:** ARCHITECTURE-DERIVED
- **Incident Ids:** ["2026-INC-019", "2026-INC-023"]
- **Requirement:** Archive completed operational payloads without weakening audit history
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Critical current reads never scan archive", "Historical reconstruction reproduces exact authority from immutable revisions; retention policy explicit"]
- **Test Ids:** ["TEST-HIST-001", "NA-2026-019", "NA-2026-023"]
- **Physical Required:** false
- **Dependencies:** ["PERF-001"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-009"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="auto-health-001"></a>

## AUTO-HEALTH-001 — Create bounded current-state snapshot with explicit freshness and invalidation

- **Priority:** P1
- **Origin:** ARCHITECTURE-DERIVED
- **Incident Ids:** ["2026-INC-017", "2026-INC-018", "2026-INC-022"]
- **Requirement:** Create bounded current-state snapshot with explicit freshness and invalidation
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Health snapshot exposes source revision and observedAt, not hidden stale truth", "Mutation admission rechecks canonical authority; cache cannot authorize scoring"]
- **Test Ids:** ["TEST-AUTO-HEALTH-001", "NA-2026-017", "NA-2026-018", "NA-2026-022"]
- **Physical Required:** false
- **Dependencies:** ["OBS-CORE-001"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="auto-deg-001"></a>

## AUTO-DEG-001 — Isolate capability health and reduce optional work during database degradation

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-007", "2026-INC-009", "2026-INC-022", "2026-INC-024"]
- **Requirement:** Isolate capability health and reduce optional work during database degradation
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Odds/NetSkins failure cannot disable identity/scoring", "Hysteresis prevents retry storm; DB outage preserves intents and offers physical cards"]
- **Test Ids:** ["TEST-AUTO-DEG-001", "NA-2026-007", "NA-2026-009", "NA-2026-022", "NA-2026-024"]
- **Physical Required:** true
- **Dependencies:** ["OBS-CORE-001", "BE-CONTRACT-001"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="cert-impact-001"></a>

## CERT-IMPACT-001 — Select and expire certification through dependency-aware change graph

- **Priority:** P1
- **Origin:** CERTIFICATION-DERIVED
- **Incident Ids:** ["2026-INC-006", "2026-INC-010", "2026-INC-012", "2026-INC-019"]
- **Requirement:** Select and expire certification through dependency-aware change graph
- **Rationale:** Prevent recurrence or make bounded recovery operable; see linked incident evidence.
- **Acceptance Criteria:** ["Score RPC change invalidates all-format client/recovery/finalization proof", "Odds copy-only edit does not discard unchanged scoring proof; changed lifecycle does"]
- **Test Ids:** ["TEST-CERT-IMPACT-001", "NA-2026-006", "NA-2026-010", "NA-2026-012", "NA-2026-019"]
- **Physical Required:** false
- **Dependencies:** ["CERT-001", "CERT-NA-001"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH CONFIDENCE in direction; acceptance not yet proven
- **Assumptions:** Private 24-player tournament; canonical server authority retained
- **Risks:** Contract/migration changes require staging, security and rollback proof
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-nav-001"></a>

## B11-NAV-001 — Feature-local failures preserve the authenticated shell

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-007", "2026-INC-008", "2026-INC-009"]
- **Requirement:** A feature read failure updates that repository/destination only. Session identity and the mounted participant shell remain alive while write authority may be independently fenced.
- **Rationale:** MOBILE_API_UNAVAILABLE from one feature replaces RootView's authenticated branch and destroys all shell-local navigation.
- **Acceptance Criteria:** ["Inject MOBILE_API_UNAVAILABLE from every generic read repository, scoring read, queue readback, reconnect, and finalization callback while each top-level tab is selected. Controller/shell identity, tab, subtab, and path remain unchanged; the failed feature shows typed local state; mutation transport stays fenced until authority is valid."]
- **Test Ids:** ["TEST-B11-NAV-001", "NA-2026-007", "NA-2026-008", "NA-2026-009"]
- **Physical Required:** true
- **Dependencies:** ["Typed error scope from B11-READ-003", "A navigation owner outside AppCoordinator's authority state"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Participant identity remains valid", "No explicit home deep link or user sign-out"]
- **Risks:** ["Preserving the shell must not accidentally preserve write authority", "Old private data must still obey visibility/revocation rules"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-nav-002"></a>

## B11-NAV-002 — Global identity failures remain explicitly fail-closed

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-007"]
- **Requirement:** Only explicit identity/certification/session revocation removes private UI and credentials. Resource authorization and feature availability are local; scoring match denial remains scoped.
- **Rationale:** Build 10 conflates some scoped 401/403/resource failures with true authentication or certification invalidation.
- **Acceptance Criteria:** ["A conformance matrix proves true missing/revoked identity, Auth UUID mismatch, rejected certification, deleted participant, and explicit sign-out remove the shell; bare/scoped 403 and feature 503 retain it. Unknown security states fail writes closed without falsely signing out."]
- **Test Ids:** ["TEST-B11-NAV-002", "NA-2026-007"]
- **Physical Required:** true
- **Dependencies:** ["Backend error codes distinguish identity, resource authorization, environment, and feature availability"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** STRONGLY SUPPORTED overbroad mapping; true-denial cases are source-proven
- **Assumptions:** ["Backend supplies trustworthy scope codes"]
- **Risks:** ["Under-classifying a true identity failure could expose stale private presentation", "Over-classifying recreates 2026 disruption"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-nav-003"></a>

## B11-NAV-003 — Navigation survives normal authority and lifecycle refresh

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-007"]
- **Requirement:** Healthy foreground, transient transport loss, compatible release/activation change, and successful reattestation retain selected destination. If an unavoidable security root replacement occurs, restoration is allowed only after the same authenticated identity is re-established and the destination remains authorized.
- **Rationale:** Tab/subtab/path exist only as BaggerAppShell instance state and cannot survive unavoidable reconstruction.
- **Acceptance Criteria:** ["For all five tabs plus nested Match, Passport, History, Odds, Net Skins, and Calcutta paths, healthy/transport/compatible-release transitions preserve context. Identity replacement or sign-out clears the saved private route. Cold launch follows an explicit documented policy."]
- **Test Ids:** ["TEST-B11-NAV-003", "NA-2026-007"]
- **Physical Required:** true
- **Dependencies:** ["B11-NAV-001", "Identity-bound route snapshot with allowlist validation"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Restored destination is still present/authorized"]
- **Risks:** ["Persisted routes can outlive authorization unless identity-bound and validated", "Restoring an obsolete route must use a local safe fallback"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-nav-004"></a>

## B11-NAV-004 — Preserve outcome context during scoring and finalization fences

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-006", "2026-INC-007"]
- **Requirement:** The current score/review/finalization destination remains visible with writes disabled and an explicit outcome state until canonical reconciliation or a true identity exit.
- **Rationale:** Queue/finalization authority checks can destroy the screen that explains an unknown or reviewable outcome.
- **Acceptance Criteria:** ["Inject unavailable, timeout, lost ACK, finalization unknown outcome, and reconnect revalidation. The user remains on the exact match/hole/review context, cannot double-submit, and sees whether the server outcome is known, unknown, accepted, or rejected."]
- **Test Ids:** ["TEST-B11-NAV-004", "NA-2026-006", "NA-2026-007"]
- **Physical Required:** true
- **Dependencies:** ["B11-SCORE-002", "B11-READ-003"]
- **Automation Ids:** ["AUTO-003"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Test environment can deterministically hold responses"]
- **Risks:** ["UI language could imply a commit before acknowledgement", "User retry must never mint a new mutation identity for the same durable intent"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-nav-005"></a>

## B11-NAV-005 — Spectator navigation remains round-scoped

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-002"]
- **Requirement:** Previous/next IDs, index, count, and visible label derive from one canonical round scope; unpaired placeholders do not fabricate detail routes.
- **Rationale:** Build 8 accepted tournament-wide links alongside round-local position/count until canonical response compatibility caught three endpoints.
- **Acceptance Criteria:** ["For every round with zero, one, partial, and complete pairings and mixed lifecycle states, traverse first/interior/last detail; links never cross rounds, endpoints are nil, opaque IDs work, and placeholder taps yield a local unavailable state."]
- **Test Ids:** ["TEST-B11-NAV-005", "NA-2026-002"]
- **Physical Required:** true
- **Dependencies:** ["Canonical round membership/order projection"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Release 132 server mapping or equivalent remains"]
- **Risks:** ["Regression if participant and spectator adapters diverge", "Fixture IDs can accidentally encode round and mask scope bugs"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-score-001"></a>

## B11-SCORE-001 — Canonicalize durable queue timestamps before compare-and-swap

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-006"]
- **Requirement:** A record written to SQLite and returned to the coordinator is byte/semantic canonical. Optimistic concurrency compares an explicit durable revision/token or canonical fields, never noncanonical in-memory Date bits.
- **Rationale:** Fractional Date encoding changes representation and exact record equality falsely reports concurrent modification.
- **Acceptance Criteria:** ["Generate fractional dates across every record transition and mutable Date field, persist/reload, and complete CAS without false conflict. Real concurrent writers still conflict. Migration/upgrade opens every supported Build 10 queue state without data loss or accidental resubmission."]
- **Test Ids:** ["TEST-B11-SCORE-001", "NA-2026-006"]
- **Physical Required:** true
- **Dependencies:** ["None on backend redesign; can be implemented and verified locally against exact Build 10 queue schema", "Upgrade/migration policy for existing records"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Queue schema can add/use a durable revision without weakening identity partitioning"]
- **Risks:** ["Migration of unresolved Build 10 rows", "Changing equality too broadly could hide genuine concurrent modification"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-score-002"></a>

## B11-SCORE-002 — Automatically reconcile exact matching Official intent

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-006"]
- **Requirement:** After fresh canonical proof of the same identity, match/hole, snapshot, mutation identity where available, nonregressed revisions, and exact gross arrays, mark the local intent resolved/receipt-backed without changing Official data. A matching stored ACK uses reads only; unknown outcome reuses the original mutation ID.
- **Rationale:** A committed matching score can remain syncing/acknowledged while a sticky latch blocks all new local entry and exposes no useful action.
- **Acceptance Criteria:** ["Reproduce both fractional failure positions, then reconcile. Matching Official data clears the record/latch and admits the next unscored hole. The server records one canonical commit. No new mutation ID or silent queue deletion occurs."]
- **Test Ids:** ["TEST-B11-SCORE-002", "NA-2026-006"]
- **Physical Required:** true
- **Dependencies:** ["B11-SCORE-001", "Existing idempotent server mutation contract; no broad backend redesign"]
- **Automation Ids:** ["AUTO-003"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Canonical read is fresh and context-bound"]
- **Risks:** ["Gross equality alone is insufficient without identity/context/revision proof", "Unknown outcome can rePOST the same ID and must remain idempotent"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-score-003"></a>

## B11-SCORE-003 — Every blocked queue state has truthful, actionable recovery

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-006"]
- **Requirement:** UI distinguishes syncing, accepted-awaiting-readback, unknown outcome, matching Official, differing Official, quarantined, and persistence fault. Only safe actions for that state appear; all destructive/local-evidence-loss actions are excluded.
- **Rationale:** Needs Review covers conflict, actionRequired, quarantine, hidden quarantine, and persistence failure, but stranded syncing/acknowledged records are absent from the action list.
- **Acceptance Criteria:** ["For each durable state, assert exact title/body/actions, enabled controls, mutation count, and canonical effect. Differing values never auto-resolve; matching values never offer Reapply; persistence failure offers bounded retry/reconciliation or a safe fallback instruction."]
- **Test Ids:** ["TEST-B11-SCORE-003", "NA-2026-006"]
- **Physical Required:** true
- **Dependencies:** ["B11-SCORE-002", "Stable diagnostic reason codes"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Internal reason codes can be safely mapped without exposing secrets"]
- **Risks:** ["An overly broad Keep Official action could discard legitimate differing intent", "Ambiguous copy can cause duplicate submissions"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-score-004"></a>

## B11-SCORE-004 — Crash/relaunch and same-ID replay are deterministic

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-006"]
- **Requirement:** Every process death boundary converges deterministically: stored ACK reads only; unknown accepted outcome replays exactly the original ID; retries never create a second commit; recurrence from local representation is eliminated.
- **Rationale:** Build 10 has bounded safe relaunch recovery, but the timestamp fault can recur during recovery and first relaunch success is not guaranteed.
- **Acceptance Criteria:** ["Enumerate process termination before durable intent, after intent, after lease, during POST, after server commit, before/after ACK persistence, before/after canonical readback, and before compaction. Relaunch converges to one commit or an explicit unresolved state and never loses evidence."]
- **Test Ids:** ["TEST-B11-SCORE-004", "NA-2026-006"]
- **Physical Required:** true
- **Dependencies:** ["B11-SCORE-001", "B11-SCORE-002"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Server idempotency remains stable"]
- **Risks:** ["OS termination timing is nondeterministic without a test hook", "Testing must never target Production"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-score-005"></a>

## B11-SCORE-005 — Recovery restores next-hole admission without guessing current hole

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-006"]
- **Requirement:** After reconciliation, new-entry admission returns only if server authority permits. UI identifies the next genuinely unscored hole from canonical data while preserving access to Official holes and never overwriting them.
- **Rationale:** A cleared matching intent may still leave selection on the last played hole; blocked admission and navigation were conflated during the incident.
- **Acceptance Criteria:** ["Recover a matching intent with zero, one, and multiple later holes already Official from another device. The app selects or clearly directs to the first canonical unscored hole, keeps Official inputs read-only, and blocks if round/match authority changed."]
- **Test Ids:** ["TEST-B11-SCORE-005", "NA-2026-006"]
- **Physical Required:** true
- **Dependencies:** ["B11-SCORE-002", "Fresh canonical scorecard"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** STRONGLY SUPPORTED
- **Assumptions:** ["Product chooses explicit auto-selection versus guided selector"]
- **Risks:** ["Auto-advance can surprise a scorer if another device progressed", "Must not equate progress.currentHole with next unscored"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-score-006"></a>

## B11-SCORE-006 — Certify multi-device and poor-connectivity scoring lifecycle

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-006"]
- **Requirement:** Authorized devices can progress different holes safely; same-hole contention resolves through canonical conflict/idempotency; offline/online transitions preserve intent and destination; all formats complete without queue residue.
- **Rationale:** 2026 tests lacked physical multi-device, carrier/network interruption, and full-round lifecycle coverage over real SQLite.
- **Acceptance Criteria:** ["Run Best Ball, Scramble, and Singles through 18 holes with two devices, response loss, timeout, 503, airplane mode, background, kill, and newer canonical revisions. One canonical score per hole, no hidden queue residue, clear conflicts, correct finalization."]
- **Test Ids:** ["TEST-B11-SCORE-006", "NA-2026-006"]
- **Physical Required:** true
- **Dependencies:** ["B11-SCORE-001 through B11-SCORE-005", "Isolated production-shaped tournament environment"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Test environment provides deterministic network fault controls"]
- **Risks:** ["Large matrix can create false confidence if it skips real SQLite or process death", "Never run as a Production load test"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-score-007"></a>

## B11-SCORE-007 — Show canonical pre-entry hole strokes

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-005"]
- **Requirement:** Before entry, each player row displays canonical hole-specific received/given strokes from server-owned context. The client never derives authoritative allocation from a displayed handicap.
- **Rationale:** Build 10 can show strokes only after an Official score row exists, too late for scorer awareness.
- **Acceptance Criteria:** ["For all 18 holes and Best Ball/Scramble/Singles, compare pre-entry badges with the canonical server allocation and with post-save applied strokes. Positive, zero, multiple, and negative/given policy cases follow an approved visual/semantic rule. Gross requests remain unchanged."]
- **Test Ids:** ["TEST-B11-SCORE-007", "NA-2026-005"]
- **Physical Required:** true
- **Dependencies:** ["Existing complete canonical allocation projection or a bounded read-contract expansion; no client calculation"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Server can expose canonical per-hole allocation safely"]
- **Risks:** ["Displayed strokes could be mistaken for values users should subtract", "Contract expansion must not expose private/admin fields"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-score-008"></a>

## B11-SCORE-008 — Separate canonical lifecycle from progress copy

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-005"]
- **Requirement:** Lifecycle label derives from canonical match status; progress copy describes scored-hole state separately. Official, local, pending, and unknown-outcome markers are visually and semantically distinct.
- **Rationale:** Build 10 could display Official · Scheduled before any score even when canonical match lifecycle was LIVE.
- **Acceptance Criteria:** ["For Upcoming, Live with zero holes, Live partial, locked, Final, and reopened fixtures, labels remain internally consistent and never imply Scheduled for a Live match. VoiceOver announces lifecycle and save state independently."]
- **Test Ids:** ["TEST-B11-SCORE-008", "NA-2026-005"]
- **Physical Required:** true
- **Dependencies:** ["Canonical status and progress fields already present"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Product approves terminology"]
- **Risks:** ["Changing copy without a state map can create new ambiguity"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-read-001"></a>

## B11-READ-001 — Align backend/native Odds representation with the legitimate output domain

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-008"]
- **Requirement:** One versioned contract represents every legitimate calculator output, including extreme finite values and signed infinity, without changing probability or clipping data. Unsupported/malformed values fail only Odds.
- **Rationale:** A valid seven-digit American odds value becomes backend 503 and also fails native semantic validation.
- **Acceptance Criteria:** ["Shared conformance fixtures cover both sign boundaries, 1- through at least 7-digit generated values, infinity, malformed strings, and all five phases. Exact backend serializer and native model/presenter agree on every fixture."]
- **Test Ids:** ["TEST-B11-READ-001", "NA-2026-008"]
- **Physical Required:** true
- **Dependencies:** ["Agreed versioned display contract", "Backend projector and native release deployed in a compatible sequence"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["American odds string remains product format"]
- **Risks:** ["Server-first change can still break Build 10", "Layout expansion and accessibility truncation"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-read-002"></a>

## B11-READ-002 — Model side-game lifecycle independently from published detail

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-009"]
- **Requirement:** Net Skins and Calcutta screens render explicit Configured, Awaiting calculation, Stale dependency, Published, Withdrawn, and Unavailable states. Historical published rounds may be shown only when contract authority declares them valid; no result is fabricated.
- **Rationale:** Valid configured/in-progress/stale/unpublished envelopes with presentation:null collapse to generic detailed-screen incompatibility.
- **Acceptance Criteria:** ["Chronologically run configure R1/R2, calculate/publish, add configured R3, withdraw/supersede, stale dependency, recalculate, and republish. Native retains the selected product, shows exact state/revision scope, and never displays stale detail as current."]
- **Test Ids:** ["TEST-B11-READ-002", "NA-2026-009"]
- **Physical Required:** true
- **Dependencies:** ["Versioned lifecycle envelope from backend", "Separate backend decisions for 009A Net Skins result currentness and 009B Calcutta dependency/read cost"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Product approves which historical results remain visible"]
- **Risks:** ["Displaying historical results as current", "A broad backend dependency redesign must not block the native state-model work"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-read-003"></a>

## B11-READ-003 — Carry typed failure scope end to end

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-004", "2026-INC-007", "2026-INC-008", "2026-INC-009"]
- **Requirement:** Transport and contract errors include stable scope: feature, match, write-authority, environment, or identity; plus retryability and outcome certainty. Navigation consumes scope, not raw HTTP status alone.
- **Rationale:** The same generic code can mean feature outage, global environment incompatibility, scoped denial, or true identity failure, and Build 10 couples it to global navigation.
- **Acceptance Criteria:** ["Run the complete 18-case Build 10 error matrix plus identity codes, scoped scoring denials, semantic 200, cancellation, timeout, offline, and coded synthetic 409. Each maps to one documented UI/security action and no unrelated shell mutation."]
- **Test Ids:** ["TEST-B11-READ-003", "NA-2026-004", "NA-2026-007", "NA-2026-008", "NA-2026-009"]
- **Physical Required:** true
- **Dependencies:** ["Backend error-code contract", "B11-NAV-001 and B11-NAV-002"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Legacy servers can be version-gated or safely mapped"]
- **Risks:** ["Fallback mapping for unknown errors", "Security codes must remain fail-closed"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-read-004"></a>

## B11-READ-004 — Retain Build 10 spectator Today state-machine correction

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-004"]
- **Requirement:** Initial/partial/retrying states show loading; a completed required failure shows unavailable; Try Again retries the full required set exactly once; usable content remains during ordinary refresh; mode exit cancels the attempt safely.
- **Rationale:** Build 9 rendered initial pending as unavailable and retried only Leaders.
- **Acceptance Criteria:** ["Exercise pending, partial success, each single failure, both failures, invalid model, timeout, 503, interruption, cancellation, repeated retry, mode exit, background, and relaunch. Assert requests and visible state at every transition."]
- **Test Ids:** ["TEST-B11-READ-004", "NA-2026-004"]
- **Physical Required:** true
- **Dependencies:** ["Existing Build 10 loadToday behavior", "Non-Production deterministic transport"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Build 11 may refactor but retains behavior"]
- **Risks:** ["Duplicate-read coalescing can skip required retry", "Cache clearing on background can lengthen recovery"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-read-005"></a>

## B11-READ-005 — Retain tournament-local time across mounted sessions

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-001"]
- **Requirement:** PWA and native use published tournament IANA timezone for day labels/schedule and refresh while mounted, on focus, and on foreground without changing competitive lifecycle.
- **Rationale:** PWA timezone correction and native mounted-midnight behavior were certified at different layers and physical long-lived proof remains incomplete.
- **Acceptance Criteria:** ["Across New York/Chicago/UTC devices, three tournament date boundaries and DST transitions yield identical tournament day/schedule. Mounted views update without recreation; no scoring/lifecycle mutation or identity change occurs."]
- **Test Ids:** ["TEST-B11-READ-005", "NA-2026-001"]
- **Physical Required:** true
- **Dependencies:** ["Published tournament timezone contract"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Injected clock is release-excluded"]
- **Risks:** ["Device clock change and DST ambiguity", "Test clock must never alter authority"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-read-006"></a>

## B11-READ-006 — Certify Release-root appearance, not only fixture appearance

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-003"]
- **Requirement:** Each product root owns a documented color-scheme policy. Shared adaptive controls and fixed palette colors remain legible in every supported system appearance and auth mode.
- **Rationale:** DEBUG outer-light gallery masked signed-out dark window behavior in spectator More.
- **Acceptance Criteria:** ["Capture signed-out chooser, spectator Today/Matches/Leaders/More and participant surfaces in light/dark on small/large devices from Release-equivalent roots. Assert semantic colors/contrast without masking app content."]
- **Test Ids:** ["TEST-B11-READ-006", "NA-2026-003"]
- **Physical Required:** true
- **Dependencies:** ["Documented appearance ownership"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Spectator remains intentionally light"]
- **Risks:** ["Nested overrides may not beat window preference", "System component behavior changes by iOS version"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="b11-read-007"></a>

## B11-READ-007 — Emit privacy-safe per-request native diagnostics

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-004", "2026-INC-006", "2026-INC-007", "2026-INC-008", "2026-INC-009"]
- **Requirement:** Native records a bounded, redacted diagnostic event with request correlation ID, resource, HTTP/error code, failure scope, duration bucket, app lifecycle, current destination category, queue state category, and resulting action. No token, gross score, phone, email, or private payload is logged.
- **Rationale:** Provider logs could not attribute physical resets or retries to resource, device session, client state, or navigation consequence.
- **Acceptance Criteria:** ["Every injected error yields one correlatable client/server event and the expected state transition. Privacy tests reject secrets and competitive payloads. Diagnostics survive long enough for incident export but obey a documented retention cap."]
- **Test Ids:** ["TEST-B11-READ-007", "NA-2026-004", "NA-2026-006", "NA-2026-007", "NA-2026-008", "NA-2026-009"]
- **Physical Required:** true
- **Dependencies:** ["Backend request ID propagation", "Privacy/retention review"]
- **Automation Ids:** ["AUTO-013"]
- **Runbook Ids:** ["RUNBOOK-007"]
- **Confidence:** HIGH CONFIDENCE direction
- **Assumptions:** ["Owner-controlled diagnostic export is acceptable"]
- **Risks:** ["Sensitive data leakage", "Logging overhead during tournament", "Correlation IDs must not become identity tokens"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="be-score-001"></a>

## BE-SCORE-001 — Keep every writable client gross-only

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-019", "2026-INC-020"]
- **Requirement:** Keep every writable client gross-only
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Native, PWA and Director score-submit schemas accept match, hole, mutation ID, expected revisions and gross values only.", "Server derives strokes, nets, hole winner and match progression from the canonical scoring snapshot in the same transaction.", "Attempts to submit client-computed strokes, net, winner or points are rejected or ignored by an explicit versioned contract test.", "Best Ball, Scramble and Singles exact fixtures produce the same canonical results."]
- **Test Ids:** ["TEST-BE-SCORE-001", "NA-2026-019", "NA-2026-020"]
- **Physical Required:** true
- **Dependencies:** ["BE-SCORE-002", "BE-JOB-001"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["Canonical prepared handicap and hole stroke-index snapshots remain server-owned."]
- **Risks:** ["A new client endpoint could accidentally reintroduce writable derived values without shared schema enforcement."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="be-score-002"></a>

## BE-SCORE-002 — Bound the synchronous scoring transaction

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-019"]
- **Requirement:** Bound the synchronous scoring transaction
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["A hole write performs admission, authorization, idempotency, revision checks, canonical scoring math, score/match mutation, receipt/history/audit, and minimal outbox inserts only.", "No synchronous scoring trigger scans historical side-game results, financial revisions, publication history, or full Net Skins history.", "A database plan/procedure inventory fails certification if an unbudgeted trigger is attached to score or match writes.", "Before a latency gate is adopted, benchmark the production-shaped database at certified peak history size and record the baseline, contention envelope and statement-timeout headroom.", "Use SQL/RPC transaction p95 at or below 1 second and p99 at or below 2 seconds, plus end-to-end score mutation p95 at or below 2 seconds and p99 at or below 4 seconds, as provisional targets aligned with the infrastructure-owned 2027 performance budget; they become release gates only after validation on matched tournament compute."]
- **Test Ids:** ["TEST-BE-SCORE-002", "NA-2026-019"]
- **Physical Required:** true
- **Dependencies:** ["BE-JOB-001", "DB-PERF-001"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["The provisional latency targets will be reconciled with the infrastructure-owned 2027 budget and measured on provisioned tournament compute, not a developer laptop."]
- **Risks:** ["Removing synchronous work without a durable transactional event would lose invalidations; the outbox insert is mandatory.", "Treating the provisional latency targets as already certified before matched-compute measurement would overstate the evidence."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="be-score-003"></a>

## BE-SCORE-003 — Reconcile unknown outcomes before retry

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-018", "2026-INC-020"]
- **Requirement:** Reconcile unknown outcomes before retry
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Every round, match and hole mutation has a durable operation ID and queryable receipt endpoint.", "After timeout or lost response, the client checks receipt and canonical state before enabling retry.", "Same-ID replay returns the original result only when payload and predecessor state remain compatible.", "If another actor changed the scope, the saved intent is marked stale and cannot be blindly resubmitted."]
- **Test Ids:** ["TEST-BE-SCORE-003", "NA-2026-018", "NA-2026-020"]
- **Physical Required:** true
- **Dependencies:** ["BE-JOB-003"]
- **Automation Ids:** ["AUTO-003"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["Operation receipts remain readable after client restart."]
- **Risks:** ["A generic Retry button can recreate the R3 stale-fingerprint hazard."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="be-score-004"></a>

## BE-SCORE-004 — Provide bounded physical-card reconciliation

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-020"]
- **Requirement:** Provide bounded physical-card reconciliation
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Recovery imports or enters gross values only and requires round, match, hole and canonical player identities.", "Each hole is freshly read; exact matches are skipped, differences stop for review, and absent holes use one durable mutation ID.", "Finalization is unavailable until all 18 holes and all expected gross values match the physical card.", "The final report counts written, skipped, conflicted, unknown and overwritten values; overwritten Official values must be zero unless a separately approved correction workflow is used."]
- **Test Ids:** ["TEST-BE-SCORE-004", "NA-2026-020"]
- **Physical Required:** true
- **Dependencies:** ["BE-SCORE-001", "BE-SCORE-003", "DIR-REC-001"]
- **Automation Ids:** ["AUTO-003"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["Paper cards identify the exact match and player order."]
- **Risks:** ["Batch writes or stale baselines can overwrite legitimate concurrent scoring."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="db-perf-001"></a>

## DB-PERF-001 — Forbid whole-history fingerprints on live write paths

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-017", "2026-INC-019"]
- **Requirement:** Forbid whole-history fingerprints on live write paths
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["No score/match transaction calls a function whose reachable plan aggregates unbounded historical revision or payload tables.", "Fingerprint inputs are enumerated by domain, scope and version; current correctness does not depend on unrelated history metadata.", "CI grows result/job history by at least 100x and fails on superlinear planning/execution growth or live-path budget breach.", "EXPLAIN plans and measured buffer/temp activity are retained as certification evidence."]
- **Test Ids:** ["TEST-DB-PERF-001", "NA-2026-017", "NA-2026-019"]
- **Physical Required:** false
- **Dependencies:** ["DB-PERF-002"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["Historical data remains immutable and queryable outside the scoring critical path."]
- **Risks:** ["A helper marked STABLE can still execute during planning; SQL volatility labels alone are not a guard."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="db-perf-002"></a>

## DB-PERF-002 — Add database-native migration and function execution certification

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-010", "2026-INC-012", "2026-INC-019"]
- **Requirement:** Add database-native migration and function execution certification
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Every created/replaced PostgreSQL function is parsed and invoked on every reachable branch in the supported PostgreSQL major version.", "Static analysis rejects pg_catalog.least, pg_catalog.greatest and any other schema-qualified special SQL expression.", "Read, claim, lease boundary, complete, fail, idempotency, concurrency and malformed-input cases execute in PostgreSQL, not only application mocks.", "Function owner, grants, security-definer flag, search_path and definition hash are compared before/after migration."]
- **Test Ids:** ["TEST-DB-PERF-002", "NA-2026-010", "NA-2026-012", "NA-2026-019"]
- **Physical Required:** false
- **Dependencies:** []
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["CI can run the same PostgreSQL major and required extensions as Production."]
- **Risks:** ["Source grep without actual invocation will miss initializer and branch-specific failures."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="db-perf-003"></a>

## DB-PERF-003 — Make current-pointer invariants database-enforced and reconcilable

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-017", "2026-INC-019"]
- **Requirement:** Make current-pointer invariants database-enforced and reconcilable
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Each domain has one authoritative current pointer referencing an immutable revision ID; duplicate scalar revision/is_current representations are removed or checked transactionally.", "A failed worker cannot leave pointer state inconsistent with its referenced result lifecycle.", "A read-only reconciliation query reports orphan pointers, multiple-current rows, scalar/reference mismatches, current result with incompatible state, and stale jobs that still block operations.", "Current transition and history insertion occur in one transaction with compare-and-swap on expected pointer revision."]
- **Test Ids:** ["TEST-DB-PERF-003", "NA-2026-017", "NA-2026-019"]
- **Physical Required:** true
- **Dependencies:** ["DB-PERF-002"]
- **Automation Ids:** ["AUTO-003"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["Immutable revision tables remain the source of history."]
- **Risks:** ["A view-only redesign without a foreign-key pointer can preserve dual truth."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="be-job-001"></a>

## BE-JOB-001 — Introduce a minimal transactional derived-state outbox

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-019"]
- **Requirement:** Introduce a minimal transactional derived-state outbox
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["The scoring transaction inserts one deduplicated event containing event ID, tournament, match, canonical match/hole revision, mutation ID, event type and occurred_at.", "The insert shares the score transaction: rollback removes both score and event; commit preserves both.", "The insert performs no source snapshot construction, side-game hash, historical scan or calculation.", "Separate workers consume the event for Calcutta, Net Skins, competition projections, intelligence and external mirrors with independent checkpoints."]
- **Test Ids:** ["TEST-BE-JOB-001", "NA-2026-019"]
- **Physical Required:** true
- **Dependencies:** ["DB-PERF-003", "BE-JOB-003"]
- **Automation Ids:** ["AUTO-010"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["This is a proposed unified side-game/event outbox; existing Google outbox and side-game job triggers are prior art, not proof it already exists."]
- **Risks:** ["Publishing this requirement as already implemented would overstate the current architecture."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="be-job-002"></a>

## BE-JOB-002 — Make derived workers durable, idempotent and observable

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-010", "2026-INC-011", "2026-INC-012", "2026-INC-016", "2026-INC-019"]
- **Requirement:** Make derived workers durable, idempotent and observable
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Claims use bounded leases, SKIP LOCKED, attempt limits and owner/token verification.", "Completion compare-and-swaps source, contract version, authority generation and expected result pointer before publication/current transition.", "Lost completion response, lease expiry, duplicate delivery and two-worker races have deterministic outcomes.", "Every terminal and blocking state has an operator-readable reason, timestamp, source revisions and a supported supersede/retry action when safe."]
- **Test Ids:** ["TEST-BE-JOB-002", "NA-2026-010", "NA-2026-011", "NA-2026-012", "NA-2026-016", "NA-2026-019"]
- **Physical Required:** true
- **Dependencies:** ["BE-JOB-001", "BE-DEP-001"]
- **Automation Ids:** ["AUTO-010"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["Workers may be at-least-once; completion must therefore be idempotent."]
- **Risks:** ["Retry without source revalidation can publish stale financial results."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="be-job-003"></a>

## BE-JOB-003 — Give every mutation and job an immutable receipt

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-016", "2026-INC-018", "2026-INC-020"]
- **Requirement:** Give every mutation and job an immutable receipt
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Receipts bind operation ID, actor, payload hash, predecessor revisions, resulting revisions, status and safe error.", "Failed and no-op operations are recorded when the transaction boundary permits; absence has a defined meaning.", "Retirement/supersession operations create immutable operation receipts in addition to mutating retained job state.", "Receipts are searchable in Director by operation ID and scope."]
- **Test Ids:** ["TEST-BE-JOB-003", "NA-2026-016", "NA-2026-018", "NA-2026-020"]
- **Physical Required:** true
- **Dependencies:** ["DB-PERF-003"]
- **Automation Ids:** ["AUTO-003"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["Security policy permits bounded safe metadata visibility to Directors."]
- **Risks:** ["Sensitive payloads or credentials must never be copied into receipts."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="be-job-004"></a>

## BE-JOB-004 — Define release-to-job compatibility as a versioned transition

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-011"]
- **Requirement:** Define release-to-job compatibility as a versioned transition
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Every release plan inventories PENDING/RUNNING jobs and declares retain, drain, supersede or exact carry-forward behavior.", "Activation advancement never silently makes a job invisible to claim while leaving it apparently actionable.", "Carry-forward requires an explicit compatible contract version, exact source/payload hashes, zero disallowed attempts/activity and an immutable receipt.", "Activation guards remain exact; compatibility is granted by audited transition, never by ignoring expected activation."]
- **Test Ids:** ["TEST-BE-JOB-004", "NA-2026-011"]
- **Physical Required:** true
- **Dependencies:** ["BE-DEP-001", "BE-JOB-003"]
- **Automation Ids:** ["AUTO-010"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["Some releases are semantically compatible with queued jobs and some are not."]
- **Risks:** ["A broad carry-forward rule can execute old code assumptions under a new release."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="be-dep-001"></a>

## BE-DEP-001 — Replace implicit dependency blocking with explicit contract-version compatibility

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-011", "2026-INC-016", "2026-INC-017"]
- **Requirement:** Replace implicit dependency blocking with explicit contract-version compatibility
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Every producer revision declares a schema/semantic contract version and immutable scope identity.", "Every consumer declares accepted contract versions and exact semantic fields consumed.", "A change is compatible only through a named, tested compatibility rule; no activation, revision or dependency guard is globally disabled.", "Incompatibility returns the blocking producer, exact changed fields, safe next action and whether history/public visibility will change."]
- **Test Ids:** ["TEST-BE-DEP-001", "NA-2026-011", "NA-2026-016", "NA-2026-017"]
- **Physical Required:** true
- **Dependencies:** ["BE-DEP-002"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["Compatibility is domain-specific and cannot be inferred from equal top-level revision numbers."]
- **Risks:** ["Treating a new contract version as automatically compatible would recreate guard bypass by another name."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="be-dep-002"></a>

## BE-DEP-002 — Fingerprint semantic inputs, not histories or control metadata

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-016", "2026-INC-017", "2026-INC-019"]
- **Requirement:** Fingerprint semantic inputs, not histories or control metadata
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Fingerprint manifests list field path, normalization, ordering, domain owner and reason for inclusion.", "Unrelated job attempts, supersession timestamps, is_current history flags and prior payload history do not alter a current semantic fingerprint.", "R1/R2 completed golf, financial auction facts and relevant side-game membership each have separate versioned fingerprints.", "A changed fingerprint can be decomposed into named changed components without recomputing or exposing full historical payloads."]
- **Test Ids:** ["TEST-BE-DEP-002", "NA-2026-016", "NA-2026-017", "NA-2026-019"]
- **Physical Required:** false
- **Dependencies:** ["DB-PERF-001"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["Canonical normalization can produce stable hashes across JSON/property ordering."]
- **Risks:** ["Omitting a consumed economic input is worse than over-inclusion; every exclusion needs a semantic proof test."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="be-dep-003"></a>

## BE-DEP-003 — Make round setup an orchestrated state machine

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-013", "2026-INC-016", "2026-INC-017", "2026-INC-018"]
- **Requirement:** Make round setup an orchestrated state machine
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Pair, prepare, validate side-game compatibility and Open are separate durable states with explicit receipts and prerequisites.", "Pairing success cannot be presented as ready when snapshotPrepared is false.", "The system can prepare all matches atomically or reports exactly which all-or-nothing boundary it guarantees.", "Changing dependencies after preparation immediately changes readiness and supplies a supported recovery plan."]
- **Test Ids:** ["TEST-BE-DEP-003", "NA-2026-013", "NA-2026-016", "NA-2026-017", "NA-2026-018"]
- **Physical Required:** true
- **Dependencies:** ["BE-DEP-001", "BE-JOB-003", "DB-PERF-003"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-009"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["Tournament setup remains guarded by canonical server authority."]
- **Risks:** ["Twelve independent preparation calls expose partial completion unless the UI and receipt model make it explicit."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="be-dep-004"></a>

## BE-DEP-004 — Model side-game publication and calculation separately

- **Priority:** P1
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-016", "2026-INC-017"]
- **Requirement:** Model side-game publication and calculation separately
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["A current publication, unpublished READY calculation, active worker and stale retained result are separate typed blockers.", "Every blocking type has a supported action or an explicit reason that no action is safe.", "Stale unpublished work is automatically marked nonblocking only when a tested policy proves it has no publication/current reference; otherwise Director receives an exact supersede action.", "Withdrawing visibility preserves immutable publication history and does not pretend to clear unrelated calculation/configuration dependencies."]
- **Test Ids:** ["TEST-BE-DEP-004", "NA-2026-016", "NA-2026-017"]
- **Physical Required:** true
- **Dependencies:** ["BE-JOB-002", "BE-JOB-003"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["Some side-game publications intentionally block setup changes."]
- **Risks:** ["Automatic supersession must never affect a published or referenced calculation."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="be-dep-005"></a>

## BE-DEP-005 — Certify post-completion financial corrections as revision replacement

- **Priority:** P1
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Certify post-completion financial corrections as revision replacement
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Starting from a published Official result, unpublish preserves auction/result history and hides participant visibility.", "Changing one ownership allocation writes a complete new auction revision, preserves all purchase prices and unaffected ownership, supersedes active jobs/current result, and creates an unpublished publication revision.", "Republish queues one calculation for the new auction and a successful worker creates a new current Official result without changing golf.", "The acceptance verifies 24 purchases, $18,500 total, 100% ownership per golfer, unchanged configuration, all final golf, and participant payout projection against the corrected owners."]
- **Test Ids:** ["TEST-BE-DEP-005"]
- **Physical Required:** true
- **Dependencies:** ["BE-JOB-002", "DB-PERF-003"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["The September 27 snapshot at revision 424 is historical evidence, not a claim about present live state."]
- **Risks:** ["Total-only checks can miss a changed purchase price; compare every purchase and ownership row."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="be-job-005"></a>

## BE-JOB-005 — Certify Production configuration dependencies before promotion

- **Priority:** P0
- **Origin:** INCIDENT-DERIVED
- **Incident Ids:** ["2026-INC-014", "2026-INC-015"]
- **Requirement:** Certify Production configuration dependencies before promotion
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Release manifests declare required secrets by target environment without exposing values.", "Staged candidate and Production rebind acceptance prove each required key is present, well-formed and usable through a nonmutating handshake.", "A missing scoring-session key blocks promotion before tournament traffic.", "PWA release evidence records service-worker version and exposes client-visible active/waiting state for support."]
- **Test Ids:** ["TEST-BE-JOB-005", "NA-2026-014", "NA-2026-015"]
- **Physical Required:** true
- **Dependencies:** ["BE-JOB-003"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-001"]
- **Confidence:** HIGH_CONFIDENCE_RECOMMENDATION
- **Assumptions:** ["Secret presence and format can be checked without logging secret material."]
- **Risks:** ["A server health 200 that omits route-specific configuration remains a false positive."]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="infra-001"></a>

## INFRA-001 — Export Supabase metrics to an independently retained Prometheus-compatible store before Tournament Mode.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Export Supabase metrics to an independently retained Prometheus-compatible store before Tournament Mode.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["CPU, memory, I/O, WAL, connection, query, restart, and scrape-health series retained across two rehearsals", "Alert evaluation remains available when the app is unavailable", "Metric name changes fail visibly"]
- **Test Ids:** ["TEST-INFRA-001"]
- **Physical Required:** false
- **Dependencies:** ["Verified Supabase project", "Metrics API credential", "Retention destination"]
- **Automation Ids:** ["AUTO-013"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Metrics API is available for the selected plan"]
- **Risks:** ["Metrics API is beta", "Credential leakage if collector configuration is mishandled"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="infra-002"></a>

## INFRA-002 — Technically isolate historical, certification, export, and analytical queries from the tournament primary by role and target database.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Technically isolate historical, certification, export, and analytical queries from the tournament primary by role and target database.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Production runtime role cannot select history schemas or execute broad history functions", "CI proves forbidden imports/routes", "Two rehearsals show zero history-offline query tags on primary"]
- **Test Ids:** ["TEST-INFRA-002"]
- **Physical Required:** false
- **Dependencies:** ["Restored copy or read replica", "History-offline credential", "Route inventory"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["A copy or replica can be provisioned before 2027"]
- **Risks:** ["Replica lag can make analytics stale", "Incomplete grant inventory could leave a bypass"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="infra-003"></a>

## INFRA-003 — Create a bounded diagnostic database role with read-only current-year views, one connection, one in-flight query, short timeouts, row limits, mandatory query tags, and no automatic retries.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Create a bounded diagnostic database role with read-only current-year views, one connection, one in-flight query, short timeouts, row limits, mandatory query tags, and no automatic retries.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["History access is denied", "A deliberately expensive query is canceled inside the approved budget", "Collector preserves the cancellation without retry", "No write privilege exists"]
- **Test Ids:** ["TEST-INFRA-003"]
- **Physical Required:** false
- **Dependencies:** ["Allowlisted diagnostic views", "Role/grant migration", "Diagnostic client change"]
- **Automation Ids:** ["AUTO-013"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Role-level settings are supported in the target Postgres service"]
- **Risks:** ["Timeout too low can hide necessary evidence", "Direct database tools may bypass application tags"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="infra-004"></a>

## INFRA-004 — Move side-game invalidation and derived calculations off the synchronous scoring transaction, retaining only a small idempotent outbox event after canonical writes.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Move side-game invalidation and derived calculations off the synchronous scoring transaction, retaining only a small idempotent outbox event after canonical writes.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Score commit correctness is unchanged", "No whole-history hash/calculation executes in the score transaction", "Worker failure cannot roll back a score", "Queue replay produces one canonical derived result"]
- **Test Ids:** ["TEST-INFRA-004"]
- **Physical Required:** false
- **Dependencies:** ["Event-driven derived-state design", "Worker queue", "Idempotent consumers", "Parity tests"]
- **Automation Ids:** ["AUTO-010"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Side games tolerate bounded eventual consistency with explicit freshness"]
- **Risks:** ["Derived state can lag", "Consumer idempotency defects can create duplicates"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="infra-005"></a>

## INFRA-005 — Record and codify Vercel Function and Supabase database regions, measure the network phase, and change placement only when rehearsal evidence justifies it.

- **Priority:** P1
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Record and codify Vercel Function and Supabase database regions, measure the network phase, and change placement only when rehearsal evidence justifies it.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Exact regions are recorded", "Staged and Production functions run in approved region", "Cross-region drift blocks release", "Network latency is measured in dress rehearsal"]
- **Test Ids:** ["TEST-INFRA-005"]
- **Physical Required:** false
- **Dependencies:** ["Provider account inventory", "Vercel region configuration", "Supabase region evidence"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["A suitable Vercel region exists close to the database"]
- **Risks:** ["Multi-region compute can multiply database connections", "Region failover may increase latency or require plan changes"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="infra-006"></a>

## INFRA-006 — Select compute and disk capacity from isolated event-shaped load results with no dependence on unmeasured burst credit during rounds.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Select compute and disk capacity from isolated event-shaped load results with no dependence on unmeasured burst credit during rounds.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Two rehearsals meet scoring/current-read budgets", "Disk budget and I/O wait remain within approved headroom", "Connection and memory headroom survive conflict and recovery cases", "Selection and rationale are recorded without relying on HTTP 200 alone"]
- **Test Ids:** ["TEST-INFRA-006"]
- **Physical Required:** false
- **Dependencies:** ["Metrics export", "Synthetic tournament", "Spectator baseline", "Query isolation"]
- **Automation Ids:** ["AUTO-013"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Tournament workload can be reproduced in isolation"]
- **Risks:** ["Unknown spectator demand", "Overprovisioning can hide inefficient queries"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="infra-007"></a>

## INFRA-007 — Use a read replica or restored copy for historical/public archive work only after replication-lag and stale-data behavior are explicit.

- **Priority:** P1
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Use a read replica or restored copy for historical/public archive work only after replication-lag and stale-data behavior are explicit.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Primary score writes never route to replica", "Historical reads do not load primary", "Replica lag is monitored and shown", "Failure falls back to a snapshot rather than primary history scan"]
- **Test Ids:** ["TEST-INFRA-007"]
- **Physical Required:** false
- **Dependencies:** ["Provider/account capability", "Read routing", "Freshness labels"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Read replica is available and cost-acceptable"]
- **Risks:** ["Replica lag", "Auth/Realtime services may remain primary-bound"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="infra-008"></a>

## INFRA-008 — Run an AWS RDS proof of concept only if documented Supabase hardening gates fail.

- **Priority:** P1
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Run an AWS RDS proof of concept only if documented Supabase hardening gates fail.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["POC uses identical schema/RPC/security/load/failure cases", "Correctness and RPO/RTO meet requirements", "Operational effort and cost categories are compared", "Cutover and rollback are rehearsed before migration decision"]
- **Test Ids:** ["TEST-INFRA-008"]
- **Physical Required:** false
- **Dependencies:** ["Two Supabase rehearsals", "Decision-gate evidence", "Cost-category inventory"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["No compliance mandate already requires AWS"]
- **Risks:** ["POC becomes premature migration", "Application SQL defects are mistaken for provider defects"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="obs-001"></a>

## OBS-001 — Instrument each internal authority-health component separately while preserving the generic public health response.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Instrument each internal authority-health component separately while preserving the generic public health response.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Read-control, admission, runtime, identity, and connection phases have independent result and latency", "Aggregate request links component spans", "Secrets and provider internals remain absent from public response"]
- **Test Ids:** ["TEST-OBS-001"]
- **Physical Required:** false
- **Dependencies:** ["Trace/log schema", "Health route instrumentation"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Internal telemetry sink is available"]
- **Risks:** ["High-cardinality labels", "Sensitive data leakage"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="obs-002"></a>

## OBS-002 — Propagate one request/trace/operation identity across Vercel, Supabase RPC, PostgreSQL logs, receipts, workers, and client confirmation.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Propagate one request/trace/operation identity across Vercel, Supabase RPC, PostgreSQL logs, receipts, workers, and client confirmation.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["A synthetic score is traceable end to end", "Same-ID replay links to original", "Unknown outcome can be resolved without a new identity"]
- **Test Ids:** ["TEST-OBS-002"]
- **Physical Required:** false
- **Dependencies:** ["W3C tracing", "Safe database session metadata", "Receipt schema"]
- **Automation Ids:** ["AUTO-003"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Provider logs retain safe correlation fields"]
- **Risks:** ["PII in trace attributes", "Unbounded cardinality"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="obs-003"></a>

## OBS-003 — Record per-phase scoring RPC duration, query fingerprint, trigger duration, timeout, lock wait, temp/block I/O, and commit/readback result.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Record per-phase scoring RPC duration, query fingerprint, trigger duration, timeout, lock wait, temp/block I/O, and commit/readback result.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Injected slow trigger identifies exact phase and query", "Rolled-back timeout differs from unknown outcome", "No score payload or credential is logged"]
- **Test Ids:** ["TEST-OBS-003"]
- **Physical Required:** false
- **Dependencies:** ["Scoring tracing", "pg_stat_statements deltas", "Database logs"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Required PostgreSQL counters are exposed"]
- **Risks:** ["Instrumentation overhead", "Nested function time may need explicit spans"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="obs-004"></a>

## OBS-004 — Maintain dashboards for tournament command, database capacity, query workload, side-game workers, release/authority, and recovery.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Maintain dashboards for tournament command, database capacity, query workload, side-game workers, release/authority, and recovery.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Each dashboard shows release and authority context", "2026 failure injections are diagnosable in under five minutes", "Missing data is visible"]
- **Test Ids:** ["TEST-OBS-004"]
- **Physical Required:** false
- **Dependencies:** ["Metrics/log/trace export", "Semantic event schema"]
- **Automation Ids:** ["AUTO-013"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Dashboard platform selected"]
- **Risks:** ["Dashboards without alerts create false confidence"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="obs-005"></a>

## OBS-005 — Capture an automatic read-only evidence packet for every SEV-1/SEV-2 incident.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Capture an automatic read-only evidence packet for every SEV-1/SEV-2 incident.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Packet spans pre/post incident metrics, logs, traces, query deltas, restart/change events, release/authority, backup, and queue state", "Collector never runs history aggregation or writes", "Packet is immutable and access-controlled"]
- **Test Ids:** ["TEST-OBS-005"]
- **Physical Required:** false
- **Dependencies:** ["Bounded diagnostic role", "Evidence store", "Incident ID"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Provider APIs support required read-only exports"]
- **Risks:** ["Collector could add load during incident", "Retention cost"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="obs-006"></a>

## OBS-006 — Monitor backup/PITR freshness, earliest/latest recovery point, replica lag, and last restore rehearsal as production signals.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Monitor backup/PITR freshness, earliest/latest recovery point, replica lag, and last restore rehearsal as production signals.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Stale/missing recovery point alerts", "Restore rehearsal age is visible", "Tournament entry gate fails when recovery evidence is stale"]
- **Test Ids:** ["TEST-OBS-006"]
- **Physical Required:** false
- **Dependencies:** ["Verified backup configuration", "Management API or provider export"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Backup status can be obtained programmatically"]
- **Risks:** ["Provider backup exists but semantic restore is invalid"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="obs-007"></a>

## OBS-007 — Instrument spectator cache, payload, TTFB, total latency, dependency timing, and concurrent demand without treating two samples as percentiles.

- **Priority:** P1
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Instrument spectator cache, payload, TTFB, total latency, dependency timing, and concurrent demand without treating two samples as percentiles.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Cold/warm/cache state is explicit", "Today dependencies are separately timed", "p50/p95/p99 come from statistically valid runs", "Physical-device time-to-usable is measured"]
- **Test Ids:** ["TEST-OBS-007"]
- **Physical Required:** false
- **Dependencies:** ["Server-Timing or tracing", "Synthetic and load clients"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Synthetic clients can run outside Production"]
- **Risks:** ["Synthetic traffic distorts capacity if misrouted"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="obs-008"></a>

## OBS-008 — Alert on observability pipeline failure as a Tournament Mode service degradation.

- **Priority:** P1
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Alert on observability pipeline failure as a Tournament Mode service degradation.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Two missing scrape intervals alert", "Log/trace drop is independently detected", "No green capacity claim is allowed with missing data"]
- **Test Ids:** ["TEST-OBS-008"]
- **Physical Required:** false
- **Dependencies:** ["Scrape health", "Log/trace ingestion health"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Out-of-band alert path exists"]
- **Risks:** ["Alert storms during provider outage"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="obs-009"></a>

## OBS-009 — Establish metric/log/trace retention and privacy policy that spans the full event and postmortem window.

- **Priority:** P1
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Establish metric/log/trace retention and privacy policy that spans the full event and postmortem window.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Retention duration is explicit", "PII/secret denylist tests pass", "UTC event and ingestion time are retained", "Authorized evidence export is reproducible"]
- **Test Ids:** ["TEST-OBS-009"]
- **Physical Required:** false
- **Dependencies:** ["Legal/privacy review", "Storage cost model"]
- **Automation Ids:** ["AUTO-013"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Retention can be funded"]
- **Risks:** ["Excess retention of personal data", "Insufficient retention for annual review"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="ops-001"></a>

## OPS-001 — Implement explicit NORMAL, PREPARE, TOURNAMENT, INCIDENT, RECOVERY, and CLOSED operational states with durable receipts.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Implement explicit NORMAL, PREPARE, TOURNAMENT, INCIDENT, RECOVERY, and CLOSED operational states with durable receipts.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Allowed workloads and transitions are enforced", "Every transition is idempotent and attributable", "Unknown transition outcome uses same-ID recovery"]
- **Test Ids:** ["TEST-OPS-001"]
- **Physical Required:** false
- **Dependencies:** ["Tournament state contract", "Director UX", "Receipt storage"]
- **Automation Ids:** ["AUTO-003"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Tournament state can be represented without conflicting with scoring lifecycle"]
- **Risks:** ["State machine can add operator friction if UX is unclear"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="ops-002"></a>

## OPS-002 — Define and test traffic shedding that preserves scoring/authority while pausing history, analytics, side-game workers, and noncritical cron at yellow/red capacity.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Define and test traffic shedding that preserves scoring/authority while pausing history, analytics, side-game workers, and noncritical cron at yellow/red capacity.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Yellow/red injection pauses only approved classes", "Scoring remains correct", "Public stale snapshot shows age", "Recovery resumes work without duplicate jobs"]
- **Test Ids:** ["TEST-OPS-002"]
- **Physical Required:** false
- **Dependencies:** ["Workload classes", "Worker controls", "Cached public snapshots"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Workloads can be independently controlled"]
- **Risks:** ["Incorrect classification pauses a critical dependency"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="ops-003"></a>

## OPS-003 — Enforce T-14 schema freeze, T-7 application freeze, T-48-hour Tournament freeze, and emergency-only changes during rounds.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Enforce T-14 schema freeze, T-7 application freeze, T-48-hour Tournament freeze, and emergency-only changes during rounds.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Release tooling rejects out-of-policy change", "Emergency exception records exact incident and rollback", "No unreviewed config drift exists at entry"]
- **Test Ids:** ["TEST-OPS-003"]
- **Physical Required:** false
- **Dependencies:** ["Release policy", "Change impact graph", "Owner/Incident Commander roles"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Calendar is known in advance"]
- **Risks:** ["Freeze too early delays necessary reliability fixes"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="ops-004"></a>

## OPS-004 — Use a protected emergency change protocol with exact candidate, baseline, rollback, owner authorization, health window, and post-change evidence.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Use a protected emergency change protocol with exact candidate, baseline, rollback, owner authorization, health window, and post-change evidence.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Lost response is recoverable", "No Force Promote path", "Competitive diff is classified", "Rollback trigger and abort criteria are explicit"]
- **Test Ids:** ["TEST-OPS-004"]
- **Physical Required:** false
- **Dependencies:** ["Release control", "Observability", "Rollback candidate"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Protected signer is available"]
- **Risks:** ["Emergency urgency can cause scope creep"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="ops-005"></a>

## OPS-005 — Approve explicit RPO/RTO targets and run quarterly plus pre-tournament restore-to-isolated-environment rehearsals.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Approve explicit RPO/RTO targets and run quarterly plus pre-tournament restore-to-isolated-environment rehearsals.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Restore completes within approved RTO", "Recovery point meets RPO", "Scores, receipts, authority, identities, side-game inputs, and migration ledger validate", "No Production write occurs"]
- **Test Ids:** ["TEST-OPS-005"]
- **Physical Required:** false
- **Dependencies:** ["Backup/PITR configuration", "Isolated restore environment", "Semantic validator"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Provider restore or duplicate-project workflow is available"]
- **Risks:** ["Provider restore downtime", "Backup may omit external Storage objects or secrets"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="ops-006"></a>

## OPS-006 — Maintain and rehearse paper-scorecard disaster mode with exact later reconciliation rules.

- **Priority:** P0
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Maintain and rehearse paper-scorecard disaster mode with exact later reconciliation rules.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["All 12 matches can continue offline", "Already-Official holes are never blindly replayed", "One fresh mutation ID per missing hole and canonical readback are used", "Discrepancies require human review"]
- **Test Ids:** ["TEST-OPS-006"]
- **Physical Required:** false
- **Dependencies:** ["Paper forms", "Scorer assignments", "Recovery tool", "Idempotency policy"]
- **Automation Ids:** ["AUTO-003"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Physical cards remain available"]
- **Risks:** ["Transcription error", "Independent concurrent recovery activity"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="ops-007"></a>

## OPS-007 — Establish named Incident Commander, database, application, owner, communications, and provider-support roles with an out-of-band contact tree.

- **Priority:** P1
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Establish named Incident Commander, database, application, owner, communications, and provider-support roles with an out-of-band contact tree.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["Acknowledgment drill meets target", "Every alert has one owner", "No production-changing action is assigned to AI or an unauthenticated operator"]
- **Test Ids:** ["TEST-OPS-007"]
- **Physical Required:** false
- **Dependencies:** ["Staffing", "Pager/communications tools", "Provider support plan"]
- **Automation Ids:** ["AUTO-022"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["At least primary and backup responders are available"]
- **Risks:** ["Small team concentration risk"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED

<a id="ops-008"></a>

## OPS-008 — Restrict AI automation to evidence collection, classification, drafting, and recommendation; require human authorization for mutations and dangerous operations.

- **Priority:** P1
- **Origin:** PROSPECTIVE
- **Incident Ids:** []
- **Requirement:** Restrict AI automation to evidence collection, classification, drafting, and recommendation; require human authorization for mutations and dangerous operations.
- **Rationale:** Evidence-derived prevention or explicitly prospective control.
- **Acceptance Criteria:** ["AI cannot deploy, migrate, resize, restart, restore, switch authority, submit/replay scores, finalize/reopen, or publish side games without the established human gate", "All AI queries use bounded roles", "Prompt/data injection tests pass"]
- **Test Ids:** ["TEST-OPS-008"]
- **Physical Required:** false
- **Dependencies:** ["AI tool policy", "Protected production credentials", "Audit logs"]
- **Automation Ids:** ["AUTO-015", "AUTO-017"]
- **Runbook Ids:** ["RUNBOOK-004"]
- **Confidence:** MODERATE CONFIDENCE
- **Assumptions:** ["Credentials can be separated by role"]
- **Risks:** ["Tool overprivilege", "AI summary mistaken for authoritative state"]
- **Status:** PROPOSED — NOT IMPLEMENTED / NOT OWNER-APPROVED
