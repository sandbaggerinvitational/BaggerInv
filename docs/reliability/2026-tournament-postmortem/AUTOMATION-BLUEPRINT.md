# Automation target blueprint

Everything in this blueprint is proposed. It is not installed automation.

## Continuous automation

Run low-cost checks for current authority invariants, domain health, latency and resources, job heartbeats, aging unknown operations, and scrape health. Use change events, coalesced refresh, and bounded current pointers. Missing data is `UNKNOWN`. Do not scan history every minute.

## Tournament-phase automation

**Before a round:** collect fresh GO and readiness evidence, measured resource headroom, the release-lock state, and unknown-operation status. The owner confirms Open.

**After a mutation:** verify the exact receipt and an operation-scoped canonical readback. Status checks and retries use the same operation ID.

**After a round:** verify completeness, results, points, and access. Report each eligible side-game state and its required next action.

**Morning and evening briefs:** use one current snapshot. Do not aggregate historical data on the live system.

## Approval boundary

Owner confirmation remains required for competitive inputs, round controls, physical recovery and corrections, financial or public publication, and tournament close.

Fully automatic writes are limited to certified operation classes: bounded derived projections, safe supersession of stale unpublished jobs, caches, and evidence. Automation never alters competitive facts to clear an alert.

## Maintenance-only work

Run historical audits, full comparisons, performance, load, chaos, deep query plans, retention and archive work, and restore drills only in isolated targets.

Prohibited on the live primary:

- synthetic golf;
- unbounded aggregation;
- historical diagnostic scans;
- whole-database diffs;
- expensive `EXPLAIN ANALYZE`;
- parallel heavy probes.

## Safety contract

Test wrong triggers, stale authority, races, duplicates, partial failure, cancellation, lost responses, receipt recovery, and security denial. TTL flags and hysteresis prevent retry storms.

Do not automate provider scale-down before tournament close and job completion. Compute changes require a recorded plan and health acceptance.

Implementation order and the complete trigger, read, write, approval, failure, and receipt fields are in [15-AUTOMATION](15-AUTOMATION.md) and [52-AUTOMATION-MASTER-LIST](52-AUTOMATION-MASTER-LIST.md).
