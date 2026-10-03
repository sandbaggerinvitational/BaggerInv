# Annual transition checkpoint 08 — incomplete

Environment: owned disposable PostgreSQL 17, synthetic authority only. No hosted resource, Production, Google, real participant messaging or native source was used. The owned cluster was destroyed after the run.

Evidence: [source-bound results](annual-transition-2026-09-30T20-13-27-891Z.json). Start and end hashes agree for every recorded migration and helper. Four child tests passed; the parent failed. This is counterevidence, not annual-transition certification.

The run actually completed:

- Supported future2097 CREATE, roster, course assignment, promotion, handicap preparation, pairings, prepared scoring contexts, Guide, Draft and Prediction authoring.
- Required current published-Odds read with an unpublished empty result, wrong-target/resource/stale-context denial, direct private-core denial and unchanged Production reader rejection.
- Canonical2026 scoring: R1 108, R2 108, R3 216; 432 holes and24 actual Final results, with durable admission before every score.
- A deliberately discarded committed response recovered through exact-origin status, a domain-rejected NOT_COMMITTED ingress operation and an unresolved UNKNOWN ingress operation. The unresolved operation intentionally remained for the annual drain test.
- Shipping automatic worker drain:21 cycles, no remaining required automatic work or active leases. FinalRecap remained waiting for owner-controlled publication. No publication was automated.
- Annual PREPARE; no successful annual CLOSE, DRAIN or ACTIVATE.

## First failure

`PRODUCTION_ANNUAL_PREDECESSOR_DERIVED_WORK_PENDING` originated in `production_control.close_annual_scoring_predecessor_v1(jsonb,text)`, the derived-work wrapper introduced by migration077. Its Intelligence count requires every FinalRecap job to be SUCCEEDED. Its companion predecessor-certificate function applies the same requirement.

The current delivery tick distinguishes eligible automatic FinalRecap from work awaiting publication. `derived_final_recap_ready_v1` requires24 complete Final matches **and** the existing verified current Odds Final Results publication. The last successful tick reported `waitingPublication.FINAL_RECAP = 1` with automatic pending, blocked and active leases all zero. Existing Phase2C.1 P0-B evidence explicitly preserves that publication boundary.

This identifies a source-contract discrepancy to resolve; it does not authorize reducing the annual handoff requirement. The run did not capture the individual job row before teardown, so attribution of this exact failure to that row remains a strong source/runtime inference. A subsequent run now captures job metadata after automatic drain, after PREPARE and at first failure. No job state, publication, close predicate or readiness certificate was repaired or fabricated.

## Scoped timings

For432 successful score operations, local admission plus execute wall time was p50 65.14ms, p95 80.47ms, p99 113.64ms and maximum214.62ms. Admission p50 was25.92ms; execute p50 was39.05ms. These measurements include local psql process/RPC overhead, exclude the preceding context handshake and are not pure PostgreSQL transaction durations. They do not establish a history-scale or hosted-performance result.

Annual transition, later-generation execution, abort, closure concurrency and full rollback proof remain incomplete.
