# Owner decision package — 2026 postmortem / 2027 reliability

## What happened and how bad was it?

The tournament completed, but operating it required unacceptable engineering intervention. The failures crossed native, PWA, SQL, side games, round lifecycle, release control and database availability. They were not one bad device or one provider problem. Six incident-driven backend releases 134–139 were required after the pre-event work, and four physical cards needed supported reconciliation and finalization.

## Did the results remain correct?

The strongest retained closeout evidence shows all 24 matches Final and 432 Official match-holes, with R1 and R2 at 108 each and R3 at 216. The recovered cards verified 72 holes and 144 gross values; 34 missing holes were entered and 38 already-Official holes were skipped. No conflicts, unknown outcomes, or direct score-table writes were reported in that recovery. One card was filled independently while recovery continued, and fresh readback prevented duplicate entry.

This supports preserved competitive golf in the examined evidence. It does not claim this audit rechecked every historical revision or current Production. No Production query was made here. Final financial publications and formal archive completeness are separate from golf completion; later Calcutta 424 OFFICIAL is a dated snapshot, not a fresh read.

## Why did testing miss this?

The tests often proved a narrower thing than the tournament required. The JavaScript financial calculator did not execute its PostgreSQL claim function. Native queue tests did not reproduce the fractional timestamp after real SQLite persistence. A Preview PWA secret did not prove Production configuration. A local 12 READY fixture did not prove actual R3 preparation. Clean history did not reveal expensive historical predicates in a score transaction. Simulator captures and thousands of test executions did not prove long-lived physical multi-hole golf across all rounds.

Some reports explicitly called those limits out. The process still allowed confidence to expand beyond them. The repair is a capability-by-layer evidence system and a chronological rehearsal, not simply a larger test count.

## Five biggest fixes

First, make the score transaction small and bounded, with history and nonessential side-game work outside it. Second, make native feature errors stay local and make durable score reconciliation independent of lossy timestamps. Third, make round/side-game dependencies semantic and visible instead of broad revision traps. Fourth, let Director verify and recover operations, including physical cards, without Codex. Fifth, require measured capacity and complete SQL/physical/lifecycle evidence before freeze.

## What Build 11 must do

Preserve a valid participant shell/tab when an optional feature fails; distinguish true auth failure from DB/network/feature errors; normalize persisted score intent; recover lost acknowledgement with the same mutation ID; confirm canonical readback; keep genuine conflicts reviewable; allow next-hole scoring after confirmed intent; show correct Live/Official/pending states; support mixed side-game lifecycle and safe PWA handoff. Canonical strokes/net/results remain server-owned. Pre-entry stroke display needs verified server allocations, not client reinvention.

Existing Build 10 can recover an exact matching Official intent through a bounded full termination/relaunch path, but success on the first relaunch is not guaranteed. The retained matrix recovered 47 of 50 syncing placements, re-triggered the timestamp defect in 3 of 50, and recovered 25 of 25 acknowledged placements. This does not remove the bug, prove physical recovery, or certify continued native scoring. Build 11 is required for permanent correction. Do not turn it into a visual rewrite or feature expansion.

## What backend, database and Director must do

The backend needs bounded current-pointer validation, exact mutation receipts/status, a minimal durable post-commit event seam for derived systems, narrower fingerprints and version-compatible jobs. SQL needs actual function execution tests, grants/rollback/concurrency checks and measured query plans at accumulated history scale.

Director needs one mobile operations screen: health, current round, scoring availability, completeness, exact blockers, next safe action, side-game pending states and recent operation receipts. It needs GO/NO-GO, self-certifying Prepare/Open, closeout, unknown-outcome resolution and Physical Scorecard Recovery. The owner should approve competitive facts, not infer database state from generic errors.

## What infrastructure must do

Keep Supabase and Vercel while hardening them. Export resource/connection/query metrics, isolate diagnostics, certify compute/pool headroom against realistic load, rehearse provider restart and verify backup restore. The owner-reported Disk I/O warning supports resource pressure as a primary hypothesis for Sep 26; missing metric history prevents proven causality. The later score timeout has independent deterministic application evidence.

AWS migration is not currently required. A non-Production RDS/Aurora comparison becomes reasonable only if optimized Supabase cannot meet measured sustained I/O, connection, availability, recovery or cost requirements. A provider switch would not fix SQL syntax, Date precision, hidden dependencies or weak certification.

## What should be automated, and what remains yours?

Automate bounded health, GO/closeout, canonical readback, exact outcome resolution, safe stale-job detection, derived projection refresh, evidence capture and release gates. Only auto-supersede unpublished jobs after proving no publication or running job depends on them. Keep ownership changes, pairings/handicaps, conflicting gross scores, public financial publication, Open/Lock/Resume/Finalize and final tournament close under explicit owner authority.

## What 2027 testing looks like

Use deterministic 24-player fixtures with all 54 holes, multiple years of history, real SQL, real persistence and all side-game revisions. Run normal and burst/soak traffic, lost responses, DB restart, worker failure and mixed clients. Complete the whole tournament chronologically, especially post-R2 → R3 pairings → preparation → side games. Then repeat critical scoring/navigation/fallback on multiple physical iPhones/accounts/radios, and have the owner run Director with recoverable incidents and no engineering help.

No P0 PASS by proxy. No missing physical proof buried in overall green. Freeze exact native/backend/schema/contracts and retain evidence durably.

## First five actions

1. Review the incident register and preserve the approved evidence and requirements durably.
2. Implement correlation and domain-specific operational telemetry in an isolated environment.
3. Build the Production-shaped benchmark and initial 2026 Never Again fixtures.
4. Approve the score-path, error/navigation and semantic-dependency contracts before implementation.
5. Establish enforced diagnostic isolation, measured capacity gates and a non-Production restore drill.

## Roadmap and decision gates

The first 30 days establish evidence, observability, a realistic benchmark, diagnostic isolation, and approved architecture; bounded fixes can begin with exact tests. Days 31–60 integrate backend lifecycle, native reliability, Director status/recovery, and capacity controls. Days 61–90 run synthetic, physical, and owner rehearsals, measure remaining gaps, and refine runbooks. Timing depends on staffing and evidence; this is not a 90-day guarantee.

Before native implementation, approve the error/navigation/serialization contracts; the isolated queue correction can proceed without waiting for all Director work. Before shipping, prove engineering exit criteria and physical acceptance. Before 2027 Tournament Ready, complete every mandatory lifecycle/capacity/security/fallback/restore/owner proof against the final frozen candidate.

## What makes 2027 NO-GO?

Unresolved or unproven P0; native physical scoring untested; score critical path still unbounded; R3 chronology or unknown-outcome recovery fails; database capacity/restore unproven; fallback not rehearsed; security/integrity defect; Director requires routine SQL/Codex to finish rounds. Cosmetic limitations can be explicitly accepted; these cannot be casually waived.

## Decisions requested after review

Approve the bounded incident conclusions and unresolved questions; accept the proposed P0 scope and first foundation phase; designate durable private evidence storage and safe non-Production environments. No source, infrastructure, or competitive change is authorized merely by this report. The single next Codex task is the observability and non-Production benchmark foundation described in [78-NEXT-STEPS.md](78-NEXT-STEPS.md).


Evidence anchors: [FINAL evidence](/private/tmp/bagger-r3-physical-recovery139/REPORT.md), [QUEUE evidence](/private/tmp/bagger-native-recovery-audit/REPORT.md), [R139 evidence](/private/tmp/bagger-r3-write-timeout/REPORT.md), [IO evidence](/private/tmp/bagger-r3-continuous-recovery/DISK-IO-INCIDENT-ADDENDUM.md). Full traceability: [INDEX](INDEX.md).
