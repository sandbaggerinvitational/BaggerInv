# Executive postmortem

**Audit boundary:** historical evidence and source review only. No Production or staging requests, mutations, builds, deployments, or source changes occurred in this audit. Proposed designs are not implemented or approved release evidence. Unknown measurements remain unknown.

The 2026 software failed at an unacceptable operational rate, while the examined canonical competitive records were preserved. The retained final recovery readback records all 24 matches Final and 432 of 432 Official match-hole records: 108 in R1, 108 in R2, and 216 in R3. Four physical cards were reconciled using canonical authority: 34 missing-hole writes, 38 matching Official skips, 72 holes and 144 gross values verified, and zero conflicts. This is strong bounded evidence of preserved golf, not a fresh or exhaustive whole-database audit.

Failures were multifactor: local native persistence and global error handling, unexecuted PostgreSQL paths, missing hosted configuration, release/activation coupling, broad side-game dependencies, historical work in score transactions, weak workflow visibility and unproven capacity. The Sep 27 score timeout has a deterministic SQL/query-path cause. The Sep 26 authority outages do not yet have a proven infrastructure root cause; the Disk I/O warning is important evidence for a primary hypothesis, not proof of causation.

Certification tested many components thoroughly but did not establish the full combination of exact SQL/RPC execution, real SQLite timestamps, Production-shaped history, physical multi-hole sessions, compatible releases and chronological tournament operations. Some reports accurately stated those limits; broad readiness confidence exceeded the evidence. A thousand passing tests cannot substitute for one missing critical layer.

What saved the tournament: server-owned scoring and handicap snapshots, gross-only entry, atomic rollback, stable idempotency, exact receipts/readback, fail-closed authority, protected releases, the PWA after its configuration repair, physical cards and careful reconciliation. Keep those controls. Make them operable without engineering intervention.

Build 11 is required to permanently address native reliability, but unchanged Build 10 has a bounded relaunch recovery for an exact matching Official intent. That recovery is not guaranteed: the retained matrix recovered 47 of 50 syncing placements, re-triggered the timestamp defect in 3 of 50, and recovered 25 of 25 acknowledged placements. No physical-native recovery was claimed, and continued native scoring was not certified. Build 11 must separate feature health from session and navigation, normalize durable intents, reconcile acknowledgement, readback, and lost responses, and preserve context across network state changes. Backend work must remove history from score transactions, narrow dependencies, and make operations self-certifying. Director must expose GO, exact blockers, receipts, closeout, and physical recovery.

Retain and harden Supabase+Vercel first. Measure optimized workloads, isolate diagnostics, retain metrics, certify resource headroom and test restore. Evaluate an AWS POC only if explicit cost/availability/I/O/connection requirements remain unmet after hardening. Migration is not justified by the current causal evidence alone.

Do not declare 2027 Tournament Ready until all required fresh SQL/API/physical/full-lifecycle/performance/security/fallback/owner evidence exists, with zero unresolved or unproven P0. Nothing was repaired by this audit. Residual provider, network, device and human risks remain and must have rehearsed containment.

Evidence: [FINAL evidence](/private/tmp/bagger-r3-physical-recovery139/REPORT.md), [QUEUE evidence](/private/tmp/bagger-native-recovery-audit/REPORT.md), [R139 evidence](/private/tmp/bagger-r3-write-timeout/REPORT.md), [IO evidence](/private/tmp/bagger-r3-continuous-recovery/DISK-IO-INCIDENT-ADDENDUM.md).

Start with [owner decision package](OWNER-DECISION-PACKAGE.md), [first five actions](77-FIRST-FIVE-ACTIONS.md), [requirements](REQUIREMENTS.md) and [unresolved questions](68-UNRESOLVED-QUESTIONS.md).
