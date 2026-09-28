# Unresolved questions and follow-up requirements

| Question | Why unknown / missing evidence | Safe way to answer | Priority |
|---|---|---|---|
| What were the exact cause, start, and end of the Sep 26 outages? | No retained provider resource-wait or restart-cause trace | Request retained provider incident metrics and logs offline; do not run a history query on the primary | P0 capacity foundation |
| Was the I/O budget exhausted or did it only warn? | Owner saw a warning, but numerical time-series data is unavailable | Retain the original provider-warning timestamp and export the relevant metrics | P0 |
| What compute, region, pool, and headroom are current? | This audit uses historical metadata only | Conduct a separate, authorized, safe metadata review before implementation and capacity testing | P0 |
| Is backup and point-in-time restore effective? | No actual restore-drill proof was located | Restore into non-Production and verify canonical invariants | P0 |
| What was the exact physical-native failure rate and session count? | No phone queue extraction or request/trace correlation exists | Add privacy-safe future telemetry; retain historical owner observations only as observations | P1 |
| Why did the phone service-worker Update button do nothing? | The affected phone's active/waiting worker state is absent | Reproduce the version/controller flow in physical QA without deleting authentication data | P1 |
| What triggered each reported return to Today? | The architecture is proven, but individual physical requests are unattributed | Correlate preserved logs if available and add future typed telemetry; do not infer a request from the final screen | P1 |
| Were final Net Skins, Odds, champion/archive, and Close Tournament steps completed? | The last recovery report proves only bounded eligibility and current publication state; no formal closeout receipt exists | Perform a later read-only current-pointer review if the owner needs historical closure; do not invent completion here | P1 historical closure |
| Are all historical scores and revisions free of loss or duplication? | No exhaustive full-history comparison was run because of the safety constraint | Restore sanitized data offline and verify invariants | P0 for future integrity certification; not evidence of current corruption |
| What were actual traffic peak, SLO percentiles, and owner intervention hours? | No event metrics or complete intervention inventory exists | Collect metrics and tag operations; benchmark instead of fabricating | P1 |
| Is every fingerprint, index, and cache path covered? | The audit prioritized incident-reachable paths rather than an exhaustive call graph | Complete an offline source and plan inventory before changes | P1 |

Unknown does not authorize speculative fixes. The infrastructure hypothesis remains open even though current symptoms recovered. Proposed thresholds, an AWS decision, and the final freeze depend on missing measurements.

