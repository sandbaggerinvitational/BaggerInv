# Automated Round GO specification

**Audit boundary:** historical evidence and source review only. No Production/staging requests, mutations, builds, deployments or source changes in this audit. Proposed designs are not implemented or approved release evidence. Unknown measurements remain unknown.

Read only current pointers and the intended 6/6/12 matches. Bound joins to one tournament/round and indexed IDs. Cache display may use a fresh snapshot, but Open transaction revalidates exact authority under lock. A stale metrics snapshot is UNKNOWN, not green.

Checks: expected match/golfer counts; unique roster/team opponents; format/course/tee; approved handicap revision; prepared snapshot and pairing fingerprint; every context current and READY; all Upcoming; zero unintended Live/scores/results/access/leases; no unresolved critical operation; no incompatible release or release lock; current semantic side-game compatibility; DB connectivity and tested resource headroom; score subsystem health (non-mutating, not a Production test score).

Output contains each check result and evidence timestamp/revision, precise blocker and supported next action. R1/R2 expect six matches,24 golfers; R3 twelve Singles,24 golfers. Counts are format-sensitive. Runtime budget is seconds, calibrated in nonlive benchmark; any timeout yields NO-GO.

```text
ROUND 3 GO CHECK — illustrative, not current Production
PAIRINGS PASS 24/24; CONTEXTS PASS 12/12
HANDICAP PASS revision 13; COURSE/TEE PASS
LIFECYCLE PASS 12 Upcoming; ACCESS/LEASES/SCORES/RESULTS 0
DATABASE PASS [fresh measured headroom]; AUTHORITY PASS
SIDE-GAME DEPENDENCIES PASS; UNKNOWN OPERATIONS 0
VERDICT GO — owner confirmation still required
```

Test missing one context, duplicate golfer, changed HI/course, stale Odds, active lease, one independently Live match, DB restart, stale health and unknown Open. All must deny/explain without writes. Requirement DIR-OPS-001; AUTO-002; RUNBOOK-002.
