# Prioritized reliability backlog

Every item is proposed and unimplemented. P0 is a release/readiness gate, P1 is required robustness, P2/P3 are deferred quality; see [priority policy](75-FINAL-P0-P1-P2-P3.md). Full fields in [JSON](reliability-backlog.json), requirements and source evidence.

| ID | Priority | Domain / owner | Deliverable | Complexity | Tests / physical |
|---|---|---|---|---|---|
| BL-B11-NAV-001 | P0 | B11 / Native | Feature-local failures preserve the authenticated shell | L | TEST-B11-NAV-001 / True |
| BL-B11-NAV-002 | P0 | B11 / Native | Global identity failures remain explicitly fail-closed | L | TEST-B11-NAV-002 / True |
| BL-B11-NAV-003 | P0 | B11 / Native | Navigation survives normal authority and lifecycle refresh | L | TEST-B11-NAV-003 / True |
| BL-B11-READ-001 | P0 | B11 / Native | Align backend/native Odds representation with the legitimate output domain | L | TEST-B11-READ-001 / True |
| BL-B11-READ-002 | P0 | B11 / Native | Model side-game lifecycle independently from published detail | L | TEST-B11-READ-002 / True |
| BL-B11-READ-003 | P0 | B11 / Native | Carry typed failure scope end to end | L | TEST-B11-READ-003 / True |
| BL-B11-SCORE-001 | P0 | B11 / Native | Canonicalize durable queue timestamps before compare-and-swap | L | TEST-B11-SCORE-001 / True |
| BL-B11-SCORE-002 | P0 | B11 / Native | Automatically reconcile exact matching Official intent | L | TEST-B11-SCORE-002 / True |
| BL-B11-SCORE-003 | P0 | B11 / Native | Every blocked queue state has truthful, actionable recovery | L | TEST-B11-SCORE-003 / True |
| BL-B11-SCORE-004 | P0 | B11 / Native | Crash/relaunch and same-ID replay are deterministic | L | TEST-B11-SCORE-004 / True |
| BL-B11-SCORE-005 | P0 | B11 / Native | Recovery restores next-hole admission without guessing current hole | L | TEST-B11-SCORE-005 / True |
| BL-BE-CONTRACT-001 | P0 | BE / Backend/Native/PWA | Freeze typed versioned errors, semantic lifecycle and scoring contracts | M | TEST-BE-CONTRACT-001 / True |
| BL-BE-DEP-001 | P0 | BE / Backend | Replace implicit dependency blocking with explicit contract-version compatibility | M | TEST-BE-DEP-001 / True |
| BL-BE-DEP-002 | P0 | BE / Backend | Fingerprint semantic inputs, not histories or control metadata | M | TEST-BE-DEP-002 / False |
| BL-BE-DEP-003 | P0 | BE / Backend | Make round setup an orchestrated state machine | M | TEST-BE-DEP-003 / True |
| BL-BE-JOB-001 | P0 | BE / Backend | Introduce a minimal transactional derived-state outbox | M | TEST-BE-JOB-001 / True |
| BL-BE-JOB-002 | P0 | BE / Backend | Make derived workers durable, idempotent and observable | M | TEST-BE-JOB-002 / True |
| BL-BE-JOB-003 | P0 | BE / Backend | Give every mutation and job an immutable receipt | M | TEST-BE-JOB-003 / True |
| BL-BE-JOB-005 | P0 | BE / Backend | Certify Production configuration dependencies before promotion | M | TEST-BE-JOB-005 / True |
| BL-BE-SCORE-001 | P0 | BE / Backend | Keep every writable client gross-only | M | TEST-BE-SCORE-001 / True |
| BL-BE-SCORE-002 | P0 | BE / Backend | Bound the synchronous scoring transaction | M | TEST-BE-SCORE-002 / True |
| BL-BE-SCORE-003 | P0 | BE / Backend | Reconcile unknown outcomes before retry | M | TEST-BE-SCORE-003 / True |
| BL-BE-SCORE-004 | P0 | BE / Backend | Provide bounded physical-card reconciliation | M | TEST-BE-SCORE-004 / True |
| BL-CERT-001 | P0 | CERT / Certification | Require evidence by capability and proof layer before readiness claims | M | TEST-CERT-001 / True |
| BL-CERT-NA-001 | P0 | CERT / Certification | Convert every material 2026 failure into a Never Again regression | L | TEST-CERT-NA-001 / True |
| BL-CERT-PHY-001 | P0 | CERT / Owner/QA | Certify multi-user physical iPhone, PWA and owner tournament rehearsal | L | TEST-CERT-PHY-001 / True |
| BL-CERT-SYN-001 | P0 | CERT / Certification | Generate deterministic chronological synthetic tournament with accumulated history | XL | TEST-CERT-SYN-001 / False |
| BL-DB-PERF-001 | P0 | DB / Backend | Forbid whole-history fingerprints on live write paths | M | TEST-DB-PERF-001 / False |
| BL-DB-PERF-002 | P0 | DB / Backend | Add database-native migration and function execution certification | M | TEST-DB-PERF-002 / False |
| BL-DIR-CLOSE-001 | P0 | DIR / Director | Certify round and tournament completeness with canonical scoped readback | M | TEST-DIR-CLOSE-001 / True |
| BL-DIR-OPS-001 | P0 | DIR / Director | Evaluate bounded canonical Round GO and explain each blocker | M | TEST-DIR-OPS-001 / True |
| BL-DIR-OPS-002 | P0 | DIR / Backend/Director | Make Prepare/Open/Lock/Resume/Finalize self-certifying idempotent operations | L | TEST-DIR-OPS-002 / True |
| BL-DIR-REC-001 | P0 | DIR / Director | Provide audited physical scorecard recovery through canonical scoring authority | L | TEST-DIR-REC-001 / True |
| BL-INFRA-001 | P0 | INFRA / INFRA | Export Supabase metrics to an independently retained Prometheus-compatible store before Tournament Mode. | M | TEST-INFRA-001 / False |
| BL-INFRA-002 | P0 | INFRA / INFRA | Technically isolate historical, certification, export, and analytical queries from the tournament primary by role and target database. | M | TEST-INFRA-002 / False |
| BL-INFRA-003 | P0 | INFRA / INFRA | Create a bounded diagnostic database role with read-only current-year views, one connection, one in-flight query, short timeouts, row limits, mandatory query tags, and no automatic retries. | M | TEST-INFRA-003 / False |
| BL-INFRA-004 | P0 | INFRA / INFRA | Move side-game invalidation and derived calculations off the synchronous scoring transaction, retaining only a small idempotent outbox event after canonical writes. | M | TEST-INFRA-004 / False |
| BL-INFRA-006 | P0 | INFRA / INFRA | Select compute and disk capacity from isolated event-shaped load results with no dependence on unmeasured burst credit during rounds. | M | TEST-INFRA-006 / False |
| BL-OBS-001 | P0 | OBS / OBS | Instrument each internal authority-health component separately while preserving the generic public health response. | M | TEST-OBS-001 / False |
| BL-OBS-002 | P0 | OBS / OBS | Propagate one request/trace/operation identity across Vercel, Supabase RPC, PostgreSQL logs, receipts, workers, and client confirmation. | M | TEST-OBS-002 / False |
| BL-OBS-003 | P0 | OBS / OBS | Record per-phase scoring RPC duration, query fingerprint, trigger duration, timeout, lock wait, temp/block I/O, and commit/readback result. | M | TEST-OBS-003 / False |
| BL-OBS-004 | P0 | OBS / OBS | Maintain dashboards for tournament command, database capacity, query workload, side-game workers, release/authority, and recovery. | M | TEST-OBS-004 / False |
| BL-OBS-005 | P0 | OBS / OBS | Capture an automatic read-only evidence packet for every SEV-1/SEV-2 incident. | M | TEST-OBS-005 / False |
| BL-OBS-006 | P0 | OBS / OBS | Monitor backup/PITR freshness, earliest/latest recovery point, replica lag, and last restore rehearsal as production signals. | M | TEST-OBS-006 / False |
| BL-OBS-CORE-001 | P0 | OBS / Backend/Infrastructure | Correlate score, operation, API, database and native outcome telemetry | M | TEST-OBS-CORE-001 / False |
| BL-OPS-001 | P0 | OPS / OPS | Implement explicit NORMAL, PREPARE, TOURNAMENT, INCIDENT, RECOVERY, and CLOSED operational states with durable receipts. | M | TEST-OPS-001 / False |
| BL-OPS-002 | P0 | OPS / OPS | Define and test traffic shedding that preserves scoring/authority while pausing history, analytics, side-game workers, and noncritical cron at yellow/red capacity. | M | TEST-OPS-002 / False |
| BL-OPS-003 | P0 | OPS / OPS | Enforce T-14 schema freeze, T-7 application freeze, T-48-hour Tournament freeze, and emergency-only changes during rounds. | M | TEST-OPS-003 / False |
| BL-OPS-004 | P0 | OPS / OPS | Use a protected emergency change protocol with exact candidate, baseline, rollback, owner authorization, health window, and post-change evidence. | M | TEST-OPS-004 / False |
| BL-OPS-005 | P0 | OPS / OPS | Approve explicit RPO/RTO targets and run quarterly plus pre-tournament restore-to-isolated-environment rehearsals. | M | TEST-OPS-005 / False |
| BL-OPS-006 | P0 | OPS / OPS | Maintain and rehearse paper-scorecard disaster mode with exact later reconciliation rules. | M | TEST-OPS-006 / False |
| BL-OPS-DR-001 | P0 | OPS / Infrastructure/Owner | Test restore and physical-card disaster recovery before tournament | M | TEST-OPS-DR-001 / True |
| BL-OPS-SAFE-001 | P0 | OPS / Infrastructure/Backend | Enforce tournament diagnostic admission and workload isolation | M | TEST-OPS-SAFE-001 / False |
| BL-PERF-001 | P0 | PERF / Database | Establish exact critical RPC performance baselines on accumulated synthetic history | L | TEST-PERF-001 / False |
| BL-PWA-001 | P0 | PWA / PWA/Native | Maintain independently certified PWA scoring and safe client handoff | L | TEST-PWA-001 / True |
| BL-REL-001 | P0 | REL / Release control | Enforce tournament freeze, compatible activation and complete release evidence | L | TEST-REL-001 / False |
| BL-SEC-001 | P0 | SEC / Security | Preserve participant, spectator, Director and service-role boundaries | M | TEST-SEC-001 / False |
| BL-AUTO-DEG-001 | P1 | AUTO / Backend/Clients | Isolate capability health and reduce optional work during database degradation | M | TEST-AUTO-DEG-001 / True |
| BL-AUTO-HEALTH-001 | P1 | AUTO / Backend | Create bounded current-state snapshot with explicit freshness and invalidation | M | TEST-AUTO-HEALTH-001 / False |
| BL-AUTO-JOB-001 | P1 | AUTO / Backend/Director | Expose and safely supersede provably stale unpublished side-game jobs | M | TEST-AUTO-JOB-001 / False |
| BL-B11-NAV-004 | P1 | B11 / Native | Preserve outcome context during scoring and finalization fences | L | TEST-B11-NAV-004 / True |
| BL-B11-NAV-005 | P1 | B11 / Native | Spectator navigation remains round-scoped | L | TEST-B11-NAV-005 / True |
| BL-B11-READ-004 | P1 | B11 / Native | Retain Build 10 spectator Today state-machine correction | L | TEST-B11-READ-004 / True |
| BL-B11-READ-005 | P1 | B11 / Native | Retain tournament-local time across mounted sessions | L | TEST-B11-READ-005 / True |
| BL-B11-READ-006 | P1 | B11 / Native | Certify Release-root appearance, not only fixture appearance | L | TEST-B11-READ-006 / True |
| BL-B11-READ-007 | P1 | B11 / Native | Emit privacy-safe per-request native diagnostics | L | TEST-B11-READ-007 / True |
| BL-B11-SCORE-006 | P1 | B11 / Native | Certify multi-device and poor-connectivity scoring lifecycle | L | TEST-B11-SCORE-006 / True |
| BL-B11-SCORE-007 | P1 | B11 / Native | Show canonical pre-entry hole strokes | L | TEST-B11-SCORE-007 / True |
| BL-B11-SCORE-008 | P1 | B11 / Native | Separate canonical lifecycle from progress copy | L | TEST-B11-SCORE-008 / True |
| BL-BE-DEP-004 | P1 | BE / Backend | Model side-game publication and calculation separately | M | TEST-BE-DEP-004 / True |
| BL-BE-DEP-005 | P1 | BE / Backend | Certify post-completion financial corrections as revision replacement | M | TEST-BE-DEP-005 / True |
| BL-BE-JOB-004 | P1 | BE / Backend | Define release-to-job compatibility as a versioned transition | M | TEST-BE-JOB-004 / True |
| BL-CERT-IMPACT-001 | P1 | CERT / Certification | Select and expire certification through dependency-aware change graph | M | TEST-CERT-IMPACT-001 / False |
| BL-DB-PERF-003 | P1 | DB / Backend | Make current-pointer invariants database-enforced and reconcilable | M | TEST-DB-PERF-003 / True |
| BL-DIR-FIN-001 | P1 | DIR / Director/Side games | Make ownership correction immutable, price-preserving and reviewable | M | TEST-DIR-FIN-001 / True |
| BL-DIR-MOB-001 | P1 | DIR / Director | Make normal operations mobile-usable with receipts and human-readable blockers | M | TEST-DIR-MOB-001 / True |
| BL-DIR-NEXT-001 | P1 | DIR / Director | Compute next safe action from exact tournament phase | L | TEST-DIR-NEXT-001 / True |
| BL-HIST-001 | P1 | HIST / Database | Archive completed operational payloads without weakening audit history | M | TEST-HIST-001 / False |
| BL-INFRA-005 | P1 | INFRA / INFRA | Record and codify Vercel Function and Supabase database regions, measure the network phase, and change placement only when rehearsal evidence justifies it. | M | TEST-INFRA-005 / False |
| BL-INFRA-007 | P1 | INFRA / INFRA | Use a read replica or restored copy for historical/public archive work only after replication-lag and stale-data behavior are explicit. | M | TEST-INFRA-007 / False |
| BL-INFRA-008 | P1 | INFRA / INFRA | Run an AWS RDS proof of concept only if documented Supabase hardening gates fail. | M | TEST-INFRA-008 / False |
| BL-OBS-007 | P1 | OBS / OBS | Instrument spectator cache, payload, TTFB, total latency, dependency timing, and concurrent demand without treating two samples as percentiles. | M | TEST-OBS-007 / False |
| BL-OBS-008 | P1 | OBS / OBS | Alert on observability pipeline failure as a Tournament Mode service degradation. | M | TEST-OBS-008 / False |
| BL-OBS-009 | P1 | OBS / OBS | Establish metric/log/trace retention and privacy policy that spans the full event and postmortem window. | M | TEST-OBS-009 / False |
| BL-OPS-007 | P1 | OPS / OPS | Establish named Incident Commander, database, application, owner, communications, and provider-support roles with an out-of-band contact tree. | M | TEST-OPS-007 / False |
| BL-OPS-008 | P1 | OPS / OPS | Restrict AI automation to evidence collection, classification, drafting, and recommendation; require human authorization for mutations and dangerous operations. | M | TEST-OPS-008 / False |
