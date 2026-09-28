# Protected physical scorecard recovery

**Audit boundary:** historical evidence and source review only. No Production/staging requests, mutations, builds, deployments or source changes in this audit. Proposed designs are not implemented or approved release evidence. Unknown measurements remain unknown.

2026 evidence: four cards, 72 holes/144 gross values verified; 34 missing holes submitted, 38 matching Official holes skipped, zero conflicts; one match filled independently before its recovery turn. This is why preflight must be fresh, per-hole and race-safe. See [final recovery](../bagger-r3-physical-recovery139/REPORT.md) (absolute evidence link in the incident register).

Proposed workflow: Director selects round/match → roster and hole order shown → transcribes gross values and physical source note → bounded canonical comparison → review missing/matching/different rows → approve eligible missing rows → submit through installed canonical authority with persistent operation/mutation IDs → exact readback → receipt → supported Finalize after complete golf.

A matching Official row is never resubmitted. A differing Official row becomes an explicit audited correction, outside ordinary recovery. A missing row that becomes Official concurrently is compared again; matching means skip, different means stop conflict. Batch orchestration may be bounded per-hole; do not promise batch atomicity if underlying contract only makes each hole atomic. The UI reports per-hole committed/unknown/not-attempted status and preserves IDs after interruption.

Player contribution: gross only. Server owns strokes, net, winner, running state and final allocations. Preserve round, match, hole, golfer IDs/names, gross values, source and operator. Do not ask golfers to calculate net/handicaps. For formats with fewer submitted gross entries, use the canonical format contract rather than inventing four inputs for Singles.

Security: Director-only, explicit reason, scoped match, short-lived reviewed authority; no reusable service credential in browser. No direct score-table writes. Audit receipts include before/after hashes/revisions and original physical note; do not store unnecessary personal images in public artifacts.

Acceptance: seeded missing/matching/conflicting 18-hole cards, concurrent participant fill, timeout after commit, retry with same ID, Finalize access revocation, wrong role denial, owner physical rehearsal. Requirement DIR-REC-001; RUNBOOK-014.
