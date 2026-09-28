# Reliability foundation

Phase 1 adds measurement, evidence and regression fixtures. It does not implement Build 11, change scoring rules, deploy to Production or certify the next tournament.

Start with [Phase 1 certification](phase1/CERTIFICATION.md), its [evidence index](phase1/EVIDENCE.md) and [traceability](phase1/TRACEABILITY.md). The byte-preserved [2026 postmortem](2026-tournament-postmortem/README.md) remains the requirements and historical evidence basis.

## Local workflows

Run these from the repository root after installing the locked dependencies. No command below accepts a Production connection string.

| Command | Purpose | Proof boundary |
|---|---|---|
| `npm run test:reliability` | Foundation tests and machine-readable evidence | Local tests; SQL and physical proof are not implied |
| `npm run test:reliability:sql` | Foundation plus actual isolated PostgreSQL functions | Requires local PostgreSQL 17 and IPC permission; never a live database |
| `npm run benchmark:reliability` | Deterministic 1x/2x/5x/10x history profiles | Local SQL latency under rollback; not Production capacity |
| `npm run benchmark:reliability:processors` | Actual queue, claim, calculator/checkpoint and completion paths | Local transactional processor samples; not hosted worker scheduling or publication |
| `npm run benchmark:reliability:telemetry` | Uninstrumented/disabled/enabled comparison | Local wrapper + real SQL with simulated HTTP transport |
| `node tools/reliability/capture-query-plans.mjs` | Nested SQL plans at 1x and 10x | Separate from timing runs because plan logging adds overhead |
| `npm run test:reliability:native-candidate` | Future native behavior gate | Deliberately fails for unfixed Build 10 behavior or missing required checkout |
| `npm run diagnostic:plan -- --operation current_match_summary --mode tournament --environment production --params '{"tournamentId":"2026","matchId":"2026-R3-1"}'` | Validate a bounded diagnostic plan | Plan only; no database driver, credential lookup or query execution |

Run database benchmarks and integration suites sequentially. They create private disposable Unix-socket clusters and remove only those owned clusters. On macOS the sandbox may require permission for local PostgreSQL IPC. Existing local databases and provider databases are not targets.

See the [fixture contract](performance/BENCHMARK-FIXTURE.md), [baseline](performance/BASELINE.md), [query plans](performance/QUERY-PLANS.md) and [Never Again catalog](testing/2026-NEVER-AGAIN-PHASE1.md) before interpreting results. Simulator reproduction and physical iPhone acceptance are distinct. A historical defect reproduction can pass while its future behavior gate correctly remains RED.

## Operational contracts

- [Telemetry](observability/TELEMETRY-CONTRACT.md): correlation is a network-attempt identity; mutation IDs retain idempotency authority.
- [Diagnostic query budget](observability/DIAGNOSTIC-QUERY-BUDGET.md): repository tooling enforces named current-ID reads; unrestricted credentials can still bypass it.
- [Score critical path](architecture/SCORE-CRITICAL-PATH-BASELINE.md) and [current pointers](architecture/CURRENT-POINTER-BASELINE.md): current source boundaries and remaining synchronous work.
- [Capacity and restore gaps](phase1/CAPACITY-EVIDENCE-GAPS.md): local timings do not establish Supabase I/O headroom or tested backups.

The overall legacy application suite is not green. Its exact unchanged-baseline comparison and historical byte-freeze exceptions are retained in [regression notes](phase1/REGRESSION-NOTES.md). No failure is silently converted to a pass.
