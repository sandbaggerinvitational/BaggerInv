# Director operations design

**Audit boundary:** historical evidence and source review only. No Production/staging requests, mutations, builds, deployments or source changes in this audit. Proposed designs are not implemented or approved release evidence. Unknown measurements remain unknown.

**Fact:** 2026 guards often prevented unsafe writes; generic errors and invisible jobs forced engineering interpretation. Existing owner observations/reports prove Terminal signing, stale-job recovery, missing preparation recovery, unknown Open investigation and physical-card entry. Full counts/minutes of all owner interventions are unknown.

## Mobile operations screen

Top row: SYSTEM (green/yellow/red/unknown), CURRENT ROUND, SCORING HEALTH. Round card: paired, prepared/READY, Upcoming/Live/Final, Official holes, unresolved scores. Next action panel: one required next action, optional actions and blockers. Side games: current state, through-round, pending job age, publication/result relationship. Recent operations: action/time/operator/status/scope and receipt. Advanced detail: release/activation, IDs, fingerprint differences, latency and error chain.

A review screen shows exact effect, affected matches, before/after authority revisions, reversibility and dependencies. Use large mobile controls and semantic status text; avoid relying solely on color. Financial values/ownership require readable comparisons. No routine operation should require a desktop.

## Blocker/error contract

Replace generic dependency denial with exact active blocker list, e.g. “R3 pairings unchanged. Odds publication X protects current pairings; obsolete unpublished calculation Y is also READY. Review withdrawal and supported supersession.” Do not assume the example numbers are current. Show safe action, retryability, operation ID and mutation guarantee.

For unknown Open: retain original key; CHECK STATUS first; show COMMITTED AND VERIFIED, NOT COMMITTED, or OUTCOME UNKNOWN. If review fingerprint changed, show which lifecycle/access facts changed and require supported reconciliation. Never offer “try again” that silently creates a new key.

## Missing controls to productize

| 2026 engineering work | Proposed Director control | Approval boundary |
|---|---|---|
| Inspect canonical readiness | GO Check / whole-round Prepare | Preparation authority reviewed |
| Resolve stale Odds | Job state and guarded supersession preview | Publication withdrawal owner-confirmed |
| Reconstruct Open outcome | Exact operation status/receipt | Same original authority only |
| Enter physical missing holes | Scorecard Recovery | Owner approves missing batch/conflicts separately |
| Track side-game phases | Lifecycle / next safe action | Calculations may queue; publication reviewed |
| Diagnose DB health | Operational health summary | Provider change remains maintenance action |
| Verify tournament completion | Closeout / Close Tournament | Owner confirms final authority |

Emergency signing can remain a local security-sensitive operation. Normal tournament controls must need zero Terminal/Codex actions. Source/release changes remain engineering workflows, not a universal Director override.
