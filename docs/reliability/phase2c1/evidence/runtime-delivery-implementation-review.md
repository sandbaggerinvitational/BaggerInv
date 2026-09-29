# Runtime delivery retirement handoff

Base: ab909d4519ea1331e27b0924de1572ebaf690777. Working candidate shared with other agents; changes below are local only, uncommitted by this agent.

## Inventory

Actual source/call-path inventory: `/private/tmp/phase2c1-runtime-inventory.md` (30 dependency families). No external data/provider access. Source evidence only for inventory.

## Scoped implementation

- `lib/mobile-v1-scoring-post-commit.js`: remove Google outbox/archive fanout; preserve Competition, Intelligence, Calcutta settled fanout and operational phases.
- `app/api/scoring/current/route.js` and `app/api/scoring/matches/[matchId]/route.js`: remove Google/archive postcommit callbacks and obsolete Google-authority shadow observer branch; preserve canonical mutation response, participant authorization/rate limiting, and internal three-family fanout.
- `app/api/director/route.js`: canonical lifecycle receipt no longer depends on awaited Google mirror; mirror metadata keeps delivered/failed/pending and adds retired. Retire legacy workbook Dashboard GET and legacy noncanonical action path with 410. Existing production console APIs replace core operation/authoring capabilities; this is not a claim of 1:1 replacement for every legacy optional CMS/Passport feature.
- `app/api/live-matches/route.js`: same Google completion-gate removal; retired legacy mutations/admin-secret path. GET now reads existing canonical tournament view and authorization mapper for frozen2026 as well as future years, preserves DTO, scope verifies before auth matrix, strips access secret fields. Canonical auth failures never fallback to Google.
- `app/api/cron/scoring-google-outbox/route.js`, `app/api/cron/round-scorecards-archive/route.js`, `app/api/cron/future-match-google-compatibility/route.js`: explicit 410 without reading credentials/body, claiming queue, or invoking adapter. No actual scheduler/config modification.
- `lib/production-director-console.js`: retired Google workers/history do not affect core health. Missing internal control/queue measurement is NOT_OBSERVED, not invented healthy. Required controls disabled/backlog remain visible. Existing legacy queue DTO keys preserved empty; googleRuntime=RETIRED.

## Tests

`test/reliability-phase2c1-delivery-retirement.test.mjs`: 22 tests. UNIT and API-route-body with injected transports. Actual source handlers imported after import dependency substitution, actual canonical DTO/health mapping used. Unexpected dependency invocation throws. These are not SQL, hosted, real auth, browser or full boot proof.

Updated existing tests:
- `test/mobile-v1-scoring-contracts.test.mjs`: old five-consumer requirement replaced with three internal consumers and unavailable retired dependencies; rejected internal job remains settled.
- `test/reliability-telemetry-protected-equivalence.test.mjs`: explicitly preserves Release139 five-consumer historical observation, compares surviving internal fanout arguments/results to that before-state. No historical report modified.
- `test/step13e1-production-director-console-foundation.test.mjs`: fixture now provides internal controls/current pending measurement rather than incorrectly using Google exports as health proof.

Command:
`node --test test/reliability-phase2c1-delivery-retirement.test.mjs test/mobile-v1-scoring-contracts.test.mjs test/reliability-telemetry-protected-equivalence.test.mjs test/step13e1-production-director-console-foundation.test.mjs`

Observed 40 pass / 0 fail / 0 skip, report `/private/tmp/phase2c1-delivery-focused.tap`.
`git diff --check`: PASS for shared checkout at time of handoff. Route syntax checks passed. No broad suite or build performed by this agent.

## Explicit limitations and retirement impacts

1. Legacy DirectorDashboard GET now 410; non-Production admin/director still routes to that old dashboard unless parent supplies canonical isolated console selection. Production core console is separate. A usable isolated Director page is not proven by route-body tests.
2. Actual existing worker-inspection RPC historically exposes Google queue counts, not `required_pending_count`; candidate therefore truthfully reports NOT_OBSERVED until internal queue observation exists. This is not a newly fabricated core outage and cannot be claimed healthy.
3. Existing broad source-contract tests explicitly require removed code. Examples: director-operations-console, director-course-tees, projection-mission-control, round-scorecards-archive, step13e7a-future-match-google-compatibility-worker, scoring-authority-phase2. They require explicit historical/obsolete classification with identities; do not hide as unexplained pre-existing failures.
4. Canonical source replacements exist for core enrollment/setup/pairings/sidegames/Guide/Draft/PredictionSettings. Canonical editable replacement for all legacy media/site presentation settings not established; classify optional convenience loss or explicit open capability, not silently preserved.
5. Retained legacy Passport readiness/notifications are not proven 1:1 equivalent to current core canonical APIs. They should be explicitly optional retired tooling, not implied required tournament functionality.
6. Old external Google artifacts, actual scheduler inventory, deployed Google use, preserved private remote historical copies cannot be proven without external access, which is prohibited here.
7. Annual Odds Google-destination prerequisite, selectors/auth defaults, runtime Google transport guard, DB enqueue/annual dispatcher/migration safety are parent-owned and not certified by these tests.

No Production query/mutation/deployment/config changes; no Google account/network access; no real data changes; no native changes; no commit/push.
