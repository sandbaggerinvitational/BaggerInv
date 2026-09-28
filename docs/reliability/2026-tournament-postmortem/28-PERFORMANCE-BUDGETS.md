# Performance budgets

## Interpretation

These are proposed service objectives and test gates for the 2027 design. They are not reconstructed 2026 percentiles. The 2026 evidence does not contain enough controlled samples to calculate a defensible p50, p95, p99, concurrency limit, or saturation point.

All latency budgets are end-to-end unless a narrower phase is named. A successful HTTP status without the correct authority, canonical data, or durable receipt is a failure.

## What 2026 measured

The Build 9 physical-device probe made only two sequential requests to each resource. Examples were Tournament `1830/364 ms`, Leaders `686/275 ms`, My Matches `660/279 ms`, Match `589/422 ms`, Passport `3162/1343 ms`, Guide `381/363 ms`, Archive `425/226 ms`, History `366/261 ms`, and Odds `359/348 ms`. The two Today dependency sums were `2516 ms` and `639 ms` for about `258,400` response bytes. These are individual observations, not cold/warm proof or percentiles.

On September 27, the original side-game-related query shape planned in `696.747 ms` in one case and `1327.255 ms` in the 407-row growth case, with temp and physical I/O in the latter. The corrected shape completed in `2.633 ms` in that growth case, and local full-RPC measurements fell from about `2.3 s` to about `0.24 s`. Those results prove a large query-shape cost difference under the test conditions. They do not establish hosted Production latency after the correction.

## Proposed budgets

| Journey or phase | Proposed green | Proposed yellow | Proposed red | Measurement rule |
|---|---:|---:|---:|---|
| Score mutation, end to end | p95 <= 2 s; p99 <= 4 s | p95 > 2 s or p99 > 4 s | any unknown outcome, or p95 > 4 s for 5 min | Valid event-shaped load plus physical-device probes; correct receipt and canonical readback required |
| Score database transaction | p95 <= 1 s; p99 <= 2 s | p95 > 1 s | timeout, lock-budget breach, or p99 > 2 s | Server span from begin through commit/rollback |
| Authority/admission check | p95 <= 500 ms | p95 500-1000 ms | failed or p95 > 1 s for 2 min | Each component plus aggregate |
| Current scorecard/read | p95 <= 1 s | p95 1-2 s | p95 > 2 s for 5 min | Cache state and database time separated |
| Public current leaderboard | p95 <= 1.5 s | p95 1.5-3 s | p95 > 3 s for 5 min or stale beyond policy | Edge/client end to end with snapshot age |
| Native current-round time to usable | p95 <= 3 s | p95 3-5 s | p95 > 5 s | Physical devices, launch state recorded |
| Side-game calculated/current eligible projection availability | <= 30 s | 30-120 s | > 120 s during active play | From canonical score commit to calculated/current eligible projection. Owner-reviewed publication is excluded; publication state and age are shown separately. |
| Background job execution | p95 <= 5 s | p95 5-15 s | repeated failure or > 15 s | Queue wait measured separately |
| Database pool acquisition | p95 <= 100 ms | p95 100-500 ms | rejection/login failure or p95 > 500 ms | Pool mode and role labeled |
| Bounded diagnostic query | <= 3 s | canceled at 3 s | any execution beyond role timeout | One connection, one in flight, no retry |
| Historical/export query on primary | zero executions | any attempted execution | any successful execution | Enforced by grants and route tests |

The numeric values are **PROVISIONAL**. Rationale: scoring must finish comfortably below the observed eight-second statement timeout and leave time for client/network handling; diagnostics must fail quickly enough to protect play; public reads may be looser because a time-stamped snapshot is safe. Ratify or replace each value after two isolated dress rehearsals with statistically adequate samples.

## Resource and correctness budgets

- Zero **unresolved** unknown score outcomes after bounded same-ID recovery. Qualification deliberately injects transient unknown outcomes and must prove they resolve without duplicate or changed-identity replay.
- Zero duplicate physical hole rows and zero canonical/receipt disagreement.
- Zero history/offline queries on the tournament primary.
- Zero unbounded automatic retries. Interactive mutations get no blind retry; same-ID recovery is an explicit path.
- One diagnostic database connection and one in-flight diagnostic query.
- Connection, CPU, memory, Disk I/O budget, IOPS, throughput, temp I/O, WAL, and lock-wait headroom are **BASELINE REQUIRED**. Green/yellow/red values require isolated saturation tests on the selected provider configuration.
- Spectator concurrency, cache hit rate, payload targets, and maximum sustainable request rate are **BASELINE REQUIRED** because 2026 spectator demand was not measured.

## Test protocol

Run a 24-golfer event shape with the real match/hole cadence, score corrections, conflicts, Finalize/Reopen, reconnects, side-game jobs, cron, spectators, and fail-closed authority probes. Increase spectator demand until a measured knee appears, then set the admitted/event target below that point with documented headroom. Run history/export/certification only on the isolated target. Preserve raw histograms and sample counts; never derive a percentile from two requests.

Evidence confidence is **HIGH** for the recorded individual timings and the original-versus-corrected query cost under their test conditions. Confidence is **LOW/UNKNOWN** for Production percentiles, cold/warm classification, hosted post-fix score latency, concurrency and saturation. All proposed budgets therefore remain gates to validate rather than historical claims.

## Operational SLOs

Latency targets above are only one part of the service objective. Adopt the following SLO definitions after the isolated baseline supplies valid denominators and the owner approves the targets:

| Service indicator | Eligible population and window | Objective |
|---|---|---|
| Canonical score correctness | Every accepted mutation and bounded recovery, per round and full event | Zero duplicate commit, receipt/canonical mismatch, unauthorized change or unresolved unknown outcome; safety invariant |
| Score availability | Eligible authorized score attempts, per round and full event | Successful authoritative receipt/readback inside the ratified latency budget; percentage target **BASELINE REQUIRED** |
| Authority availability | Scheduled component probes plus every scoring admission, per round | All required components compatible inside the ratified budget; percentage target **BASELINE REQUIRED** |
| Participant current read | Eligible authenticated current-round reads, rolling 15 minutes and per round | Correct revision inside the ratified latency budget; percentage target **BASELINE REQUIRED** |
| Public current projection | Eligible public requests, rolling 15 minutes and per round | Fresh or explicitly age-labeled last-known-good response inside the public budget; target **BASELINE REQUIRED** |
| Side-game calculated projection | Eligible canonical input changes, per active round | Calculated/current eligible projection inside the ratified worker budget with matching fingerprint; owner publication time excluded |
| Observability | Expected scrapes, logs, traces and alert evaluations, continuous | No unreported gap beyond the approved ingestion interval; target **BASELINE REQUIRED** |

Provider, network and external-dependency failures remain in the SLO denominator when they affect the user journey. Planned maintenance may be excluded only when approved outside Tournament Mode and recorded in the evidence ledger. A short tournament window is evaluated separately; strong off-season availability cannot erase a tournament failure.

## Error budget policy

Correctness and authority invariants have no spendable error budget. A duplicate score, canonical mismatch, split authority or unresolved unknown outcome is an immediate blocker regardless of monthly availability.

For percentage SLOs, the error budget is `eligible population × (1 − approved SLO)`. Exact SLO percentages and therefore exact 2027 budgets are **UNKNOWN / BASELINE REQUIRED**. Until ratified, reports show raw eligible, good, failed, excluded and missing-telemetry counts and cannot claim “within budget.”

Proposed governance after ratification:

- at 25% of a window's budget consumed, stop discretionary feature work and assign the dominant failure class;
- at 50%, require a reviewed containment/hardening plan before further relevant releases;
- at 100%, block Tournament entry or new feature release until the owner accepts a dated recovery plan and fresh proof;
- any safety invariant breach bypasses the percentage thresholds and enters incident/recovery immediately.

The 25/50/100% action points are **PROVISIONAL governance thresholds**, not measured 2026 behavior. Missing telemetry never counts as good service and invalidates a green error-budget claim.
