# Build 11 Entry and Exit Criteria

**Status:** PROPOSED governance design. These criteria are not owner-approved and do not authorize implementation, testing against Production, or release.

## Entry criteria

Build 11 work may begin when the relevant lane has its own inputs. The whole program need not wait for every backend decision.

### Common evidence entry

- Shipping baseline is frozen as native Build 10 `e7652b9b65595861f4f7cdf0b8326491581a27b8`.
- `working/native-findings.json` records incident confidence, source/report line evidence, tested proof layers, physical evidence, recovery limits, audited prior-PASS claims, and missing tests.
- `working/native-requirements.json` identifies each PROPOSED requirement, priority, acceptance, physical test, dependency, confidence, assumptions, risks, and NA test IDs.
- Open product decisions and contract dependencies have named decision records or explicit unresolved status.
- Non-Production fixtures and data-isolation rules exist before any mutable validation.

### Independent native/SQLite entry

`B11-SCORE-001` may start with the exact Build 10 schema, defect reproduction, migration inventory, and real local SQLite harness. It does not wait for an Odds, side-game, or global error-envelope redesign. Queue-state UI design (`B11-SCORE-003`) and navigation ownership design (`B11-NAV-001`) may also begin from the proven native gaps while their integration dependencies remain explicit.

### Contract-coordinated entry

- `B11-READ-001`: approved legitimate Odds domain and a versioned Build 10/11 compatibility sequence.
- `B11-READ-002`: explicit Net Skins and Calcutta lifecycle meanings, including policy for historical published results. The separate 009A and 009B backend causes remain separate work items.
- `B11-READ-003`: stable scope/retry/outcome/security error semantics and unknown-code policy.
- `B11-SCORE-007`: server-owned per-hole allocation projection and privacy boundary.

These dependencies gate integration and release of their requirement. They do not block unrelated timestamp, local queue, presentation, or navigation work.

### Physical-validation entry

- A release candidate is traceable to one immutable SHA and configuration.
- TestFlight/Release-equivalent roots are used where root behavior matters.
- The isolated environment supplies production-shaped contracts and disposable tournament identities.
- Fault controls are deterministic, release-excluded, and incapable of contacting or mutating Production.
- Device/OS/network/appearance matrix, operator scripts, privacy-safe diagnostics, and evidence destinations are ready.
- Expected canonical state and mutation counts are declared before execution.

## Requirement exit rule

A P0/P1 requirement exits only when:

1. its acceptance statement is fully exercised;
2. source and deterministic automated proof cover the causal behavior;
3. contract fixtures pass when a server/native boundary exists;
4. the stated physical-device plan passes on the required matrix;
5. negative, interruption, cancellation, recovery, and lifecycle cases applicable to it pass;
6. evidence is retained and traceable to exact client/server versions;
7. assumptions are confirmed or converted into explicit residual risks;
8. no open defect contradicts the acceptance statement.

P0/P1 acceptance details live in `working/native-requirements.json`. The following program gates summarize them without replacing them.

## P0 exit gates

### Navigation and authority

- `B11-NAV-001`: F07-F11 and F14 keep the valid shell and route while failures stay local.
- `B11-NAV-002`: identity/certification exits remove private UI; scoped denial does not.
- `B11-NAV-003`: all top-level and representative nested routes survive healthy/compatible lifecycle transitions and clear on identity exit.
- `B11-READ-003`: complete error matrix maps to typed, documented UI/security actions.

Evidence: `NA-2026-007` physical run plus contract and simulator/model proof. A source-only refactor does not exit these requirements.

### Scoring durability and recovery

- `B11-SCORE-001`: no fractional time field produces false CAS conflict; genuine concurrency remains detected; Build 10 rows migrate safely.
- `B11-SCORE-002`: full-context matching Official intent resolves safely; differing intent stays reviewed; stored ACK reads only; unknown outcome uses the original ID.
- `B11-SCORE-003`: every blocking state has truthful safe actions and accessibility semantics.
- `B11-SCORE-004`: every enumerated process-death boundary converges to one commit or explicit unresolved state without lost evidence.
- `B11-SCORE-005`: recovery restores admission only under current authority and identifies the first canonical unscored hole.

Evidence: `NA-2026-006` on real device SQLite, with mutation receipts and canonical projections. Build 10 bounded relaunch results do not satisfy this Build 11 gate.

### Read contracts

- `B11-READ-001`: backend and native accept all legitimate Odds fixtures, including 7-digit and infinity policy, with rollout compatibility proven.
- `B11-READ-002`: both side games render the full approved lifecycle without requiring detail when none is valid.

Evidence: `NA-2026-008` and `NA-2026-009` contract plus physical proof. HTTP 200 alone is not a pass when semantics are unrepresentable.

## P1 exit gates

- `B11-NAV-004`: scoring/finalization unknown outcomes preserve exact review context (`NA-2026-006`, `007`).
- `B11-NAV-005`: spectator detail traversal remains round-scoped across all boundary fixtures (`NA-2026-002`).
- `B11-SCORE-006`: physical two-device, poor-connectivity, 18-hole scoring/finalization passes all formats (`NA-2026-006`).
- `B11-SCORE-007`: server-owned per-hole strokes are visible before entry and match applied scoring (`NA-2026-005`). This closes presentation awareness, not a proven 2026 competitive-integrity defect.
- `B11-SCORE-008`: lifecycle, progress, and local reliability labels remain distinct (`NA-2026-005`, `006`).
- `B11-READ-004`: spectator Today pending, partial, failure, retry, cancellation, and mode-exit matrix passes (`NA-2026-004`).
- `B11-READ-005`: tournament-local time updates in mounted physical sessions across date/DST cases (`NA-2026-001`).
- `B11-READ-006`: appearance passes from Release-equivalent roots across required physical settings (`NA-2026-003`).
- `B11-READ-007`: a redacted diagnostic bundle attributes each injected failure and passes privacy review.

## Release-candidate exit

A Build 11 release candidate may be described as ready only when:

- every release-blocking P0 is exited with retained evidence;
- the owner has made explicit decisions on any P1 deferred from that release and the release claim names the deferral;
- regression checks for all NA-2026-001 through 009 applicable to the candidate have passed;
- the physical matrix and one isolated full lifecycle dress rehearsal have passed on the exact candidate;
- compatibility with the deployed server sequence and Build 10 transition population is demonstrated;
- privacy, diagnostics retention, and release-excluded test-hook checks pass;
- no evidence relies on the dirty main checkout or substitutes simulator evidence for hardware.

If physical or lifecycle proof is missing, status is “ready for physical verification,” “partial,” or “not tested,” as appropriate. If a P0 fails, status is FAIL. Do not average proof layers or summarize green unit tests as a holistic PASS.

## Stop and rollback criteria for validation

Stop the isolated dress rehearsal if a mutation is duplicated, queue evidence is lost, private UI remains after true identity revocation, a test control can reach Production, or diagnostics expose prohibited data. Preserve artifacts before resetting the isolated fixture. Rollout design for coordinated contracts must include a compatible server/client sequence; an incompatible server-first response is a release blocker.

## Timing and ownership

Incident timings remain UNKNOWN unless a retained artifact bounds them. This document sets no schedule and assigns no unapproved owner. Owners, dates, and release scope become authoritative only through a separate approval record.

