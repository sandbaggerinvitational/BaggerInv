# Build 11 Native Reliability Blueprint

**Status:** PROPOSED. This blueprint is a forensic design deliverable. It is not an implementation plan approved by an owner, and it makes no claim that Build 11 work or validation has occurred.

**Evidence baseline:** exact native Build 10 commit `e7652b9b65595861f4f7cdf0b8326491581a27b8`. Detailed findings and requirements are in `working/native-findings.json` and `working/native-requirements.json`.

## Design objective

Build 11 should prevent a local feature/read failure from erasing a valid authenticated experience, make durable scoring recovery deterministic and understandable, and represent the server's valid data domain and lifecycle states. It should retain the specific corrections already made for timezone, round navigation, spectator appearance, and spectator Today loading while replacing weak proof claims with explicit evidence layers.

## Blueprint streams

### Stream A — durable scoring core

Start with `B11-SCORE-001`. Normalize every persisted value used in optimistic comparison or replace whole-record equality with an explicit durable revision/token plus canonical immutable fields. Inventory every mutable `Date`, every Build 10 row shape, and every transition before choosing migration behavior. This stream is local and should proceed without waiting for a broad server redesign.

Build `B11-SCORE-002` and `004` on that stable persistence layer. Formalize the two safe replay rules: stored acknowledgement means reads only; unknown possible acceptance reuses exactly the original mutation ID. Define full-context equivalence using identity, match, hole, immutable snapshot, revisions, and exact gross arrays. Never use gross equality alone as deletion authority.

Then connect `B11-SCORE-003` and `005`: surface the real durable state, expose only safe actions, and restore admission/navigation from fresh canonical authority. Treat Production `progress.currentHole` as last played, not automatically next. Validate same-hole and adjacent-hole multi-device behavior before `B11-SCORE-006` full-lifecycle certification.

### Stream B — shell, identity, and navigation

Separate identity, environment/write authority, feature state, and navigation lifetime. `B11-NAV-001` prevents feature errors from replacing the shell. `B11-NAV-002` preserves strict fail-closed behavior for proven identity/certification exits. `B11-NAV-003` owns an identity-bound validated route that survives healthy/compatible lifecycle changes.

Use the 16-trigger inventory as the conformance model: F01/02/03/04/05/12/15/16 intentional; F07/08/09/10/11/14 local and shell-preserving; F06/13 conditional on typed result. `B11-NAV-004` keeps scoring/finalization context visible under fences. `B11-NAV-005` retains round-local spectator traversal.

### Stream C — typed reads and lifecycle contracts

`B11-READ-003` defines scope, outcome certainty, retryability, data usability, contract meaning, and security action. Navigation consumes those meanings rather than raw HTTP status. Unknown security states fence writes while resolution is pending.

`B11-READ-001` aligns Odds backend and native representation across the legitimate output domain. Its rollout must account for Build 10's six-digit semantic bound; compatibility is part of acceptance.

`B11-READ-002` models side-game lifecycle independently from detailed presentation. Keep the incident's backend work separate: 009A concerns Net Skins current-result invalidation; 009B concerns Calcutta dependency/read timing. A common native state model is useful, but it does not make those one root cause.

Retain `B11-READ-004` spectator Today semantics and add `B11-READ-007` diagnostics so future physical symptoms can be tied to a request, state, and navigation consequence.

### Stream D — presentation retention and awareness

`B11-READ-005` retains tournament-local time across mounted sessions, focus, and foreground. `B11-READ-006` verifies appearance from signed-out Release roots rather than a DEBUG fixture.

`B11-SCORE-007` adds canonical per-hole strokes before entry and `B11-SCORE-008` separates lifecycle from progress/reliability copy. Pre-entry strokes are P1 because they affect scorer awareness and trust. The reviewed evidence does not show incorrect server scoring or proven competitive corruption.

### Stream E — evidence and release control

Execute `NA-2026-001` through `NA-2026-009` under `33-PHYSICAL-DEVICE-PLAN.md`. Apply `46-BUILD11-ENTRY-EXIT-CRITERIA.md` to each requirement and the final release candidate. Retain a privacy-safe evidence package tied to exact client and server versions.

## Proposed dependency sequence

1. Freeze baseline, evidence catalogs, Build 10 row inventory, and test fixtures.
2. Begin `B11-SCORE-001` independently; begin queue-state UX and navigation-ownership design in parallel conceptually.
3. Agree typed error semantics for `B11-READ-003`; integrate `B11-NAV-001` and `002` against them.
4. Add identity-bound navigation retention (`B11-NAV-003`) and scoring/finalization context (`B11-NAV-004`).
5. Complete exact scoring reconciliation and crash boundaries (`B11-SCORE-002` through `005`).
6. Agree versioned Odds, side-game lifecycle, and stroke-allocation contracts; verify Build 10 compatibility sequence.
7. Integrate retained Today/time/appearance/round-navigation behavior and diagnostics.
8. Run requirement-level contract, simulator, and physical matrices.
9. Run multi-device 18-hole scoring and the full isolated lifecycle dress rehearsal on the immutable candidate.

This sequence prevents broad backend work from blocking the isolated timestamp repair while keeping coordinated contracts from escaping their real integration gates.

## Incident-to-design trace

| Incident | Build 11 response | Acceptance test |
|---|---|---|
| 2026-INC-001 timezone | B11-READ-005 | NA-2026-001 |
| 2026-INC-002 round navigation | B11-NAV-005 | NA-2026-002 |
| 2026-INC-003 More appearance | B11-READ-006 | NA-2026-003 |
| 2026-INC-004 Today pending/retry | B11-READ-003, 004, 007 | NA-2026-004 |
| 2026-INC-005 pre-entry strokes | B11-SCORE-007, 008 | NA-2026-005 |
| 2026-INC-006 timestamp/recovery | B11-SCORE-001 through 006, B11-NAV-004 | NA-2026-006 |
| 2026-INC-007 global shell reset | B11-NAV-001 through 004, B11-READ-003, 007 | NA-2026-007 |
| 2026-INC-008 Odds domain | B11-READ-001, 003, 007 | NA-2026-008 |
| 2026-INC-009 side-game lifecycle | B11-READ-002, 003, 007 | NA-2026-009 |

## Decisions required before coordinated integration

- Which identity/certification codes conclusively require private-shell removal, and how legacy unknowns fail closed.
- Cold-launch and full-relaunch route policy, distinct from healthy lifecycle retention.
- Whether next unscored hole is auto-selected or presented as an explicit guided choice after recovery.
- Approved state names and actions for every queue condition.
- Odds representation and Build 10 compatibility window.
- Side-game historical-result policy and versioned lifecycle envelope, with 009A and 009B resolved separately.
- Canonical per-hole stroke allocation surface and wording, including given/negative policy.
- Diagnostic retention/export privacy policy.

Until approved, each remains an assumption or risk in `working/native-requirements.json`.

## Risks to manage

- Preserving a shell must never preserve unauthorized private data or write authority.
- Simplifying optimistic comparison must not suppress a genuine concurrent writer.
- Reconciliation must not delete evidence based on partial equality.
- Navigation persistence must be identity-bound and route-validated.
- Server-first contract changes can strand Build 10 clients.
- Historical side-game data can be mistaken for current results without explicit authority.
- Physical fault hooks can invalidate release safety if included outside test builds.
- Diagnostics can leak private or competitive data unless fields and retention are constrained.
- Large test counts can create false confidence if process death, real SQLite, hardware, or full lifecycle is absent.

## Evidence-aware release posture

Build 10 relaunch should be described precisely: bounded exact-code recovery for an exact-matching Official intent; 47 of 50 injected syncing placements recovered and three re-triggered the timestamp defect; 25 of 25 acknowledged placements recovered; no physical-native recovery was claimed. It is not evidence that continued native scoring was certified.

Build 11 may claim only the proof layer actually completed. Source/model/simulator success may advance work to physical verification. A release-wide PASS requires all release-blocking P0 requirements, their physical tests, compatibility evidence, and the complete isolated lifecycle rehearsal on the exact candidate.
