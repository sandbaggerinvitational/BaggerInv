# Phase 2C before-state

Base **b1ceaa89f2d7cd0cdf2835aba04a24aca442ca18**, verified clean before creating branch `codex/reliability-phase2c-recovery-delivery` in the existing isolated Phase2 worktree. Original owner checkout was not edited. Node26.7.0/npm11.19.0. Phase1 preserved evidence, Phase2 benchmarks and Never Again fixtures are available locally.

All work is non-Production. Production queries, deployments and real participant communications: **zero**. Tests use owned socket-only disposable PostgreSQL17.11; no remote database URL is accepted. The source hashes were frozen in [before-source-manifest](evidence/before-source-manifest.json) before implementation. The numbered user requirement index contains all314 numbered sections.

## Reproduced before implementation

| Gate | Evidence and confidence | Existing protection / missing proof |
|---|---|---|
| A — outcome after revocation | **PROVEN POSTGRESQL**: unchanged Phase2 score suite31/31, including committed receipt with denied replay after Lock; [receipt](evidence/before-score.json) | Canonical mutation survives; supported participant status authority absent |
| B — autonomous delivery | **PROVEN SOURCE**, no autonomous-runtime PASS: Phase2 durable intents and explicit flush exist; request-bound after callbacks do not establish independent retry/scheduling | Manual explicit processing is durable, but missed dispatch/process loss needs a supported runner |
| C — annual42883 | **PROVEN POSTGRESQL**: unchanged migration suite12/12 characterizes actual future initializer errors; [receipt](evidence/before-migration.json) | Exact transactions fail; additional effective-definition inventory is retained separately |
| D — NetSkins lock inversion | **PROVEN POSTGRESQL / CONCURRENCY**: unchanged migration suite captures a two-transaction advisory-lock cycle,40P01, retained retry state, explicit later success | Contained, not eliminated; explicit retry is not autonomous |
| E — finite timeout | **PROVEN CONFIGURATION GAP**: inherited cluster default statement_timeout=0; deliberate timeout rollback exists | Unlimited-normal profile cannot prove finite normal headroom |
| F — client/control/release | **PROVEN EVIDENCE GAP**: Phase2 proof matrix marks integrated RPC/API/hosted/client and full release transitions NOT PROVEN | Unchanged shape/source is not actual client runtime proof |

A coverage gap is not fabricated into an observed runtime failure. Before reproductions use exact base shipping code. New test/tooling changes are separate from this historical record.

## Test-time timeout proposal

Score and recovery: **1000ms**; worker transactions: **5000ms**; intentional timeout injection: **25ms** against a controlled100ms wait. These are isolated test profiles, not changes to Production timeout configuration. Phase2 common p99 was below2ms locally; the1s score profile leaves a large margin for host variance while detecting accidentally synchronous heavy work. Workers perform broader approved derivation, so use a separate5s bound. Neither number is a performance target. Measure maximum/headroom, fail unexpected timeout, and do not raise the budget to make a failing query pass.

PostgreSQL CREATE DATABASE TEMPLATE does not copy per-database settings. The new fixture explicitly reapplies the finite timeout to every clone; a setting assertion prevents a false finite-timeout claim.
