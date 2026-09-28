# Native Navigation and Failure Containment

**Status:** PROPOSED Build 11 design. No behavior in this document is approved, implemented, or release-certified.

**Baseline:** Build 10 `e7652b9b65595861f4f7cdf0b8326491581a27b8`.

## Build 10 failure chain

Source inspection establishes this chain:

1. Generic repositories can map `MOBILE_API_UNAVAILABLE` to `AppCoordinator.refreshEnvironmentAfterMobileAPIUnavailable()` (`MobileReadRepository.swift:576-603`, `TournamentDataCoordinator.swift:320-345`).
2. Environment recheck can replace the coordinator state (`AppCoordinator.swift:691-717`).
3. `RootView` selects a completely different branch for that state (`RootView.swift:78-145`).
4. Participant tab selection is local `@State` in `BaggerAppShell` (`AppTabShell.swift:31-36`). Replacing the shell destroys that navigation state.

The fallback audit demonstrated the simulator effect. It did not attribute every reported physical reset to a particular request, because provider logs lacked resource, device-session, client-state, and navigation-consequence correlation.

## Complete Build 10 root-change inventory

The 16 identified root-changing families from `/private/tmp/bagger-build10-today-fallback-audit/FALLBACK-INVENTORY.md:5-38` are:

| Trigger | Classification | Build 11 proposed treatment |
|---|---|---|
| F01 cold launch/full relaunch | Intentional | Apply documented launch destination policy |
| F02 first/restored authentication | Intentional | Create authenticated shell; restore only a valid identity-bound route |
| F03 explicit home link | Intentional | Navigate home because the user/link requested it |
| F04 sign-out/account deletion and later sign-in | Intentional | Clear private route and rebuild under new session |
| F05 true identity/certification loss | Intentional | Remove private UI; fail closed |
| F06 generic 401/403 mapping | Conditional | Global only with explicit identity scope; otherwise local/resource-scoped |
| F07 generic feature `MOBILE_API_UNAVAILABLE` | Unnecessary | Preserve shell; fail the destination |
| F08 scoring current/selection read failure | Unnecessary | Preserve score context; fence affected mutations |
| F09 queue readback/reconciliation failure | Unnecessary | Preserve outcome context and durable evidence |
| F10 reconnect revalidation failure | Unnecessary | Preserve shell; show scoped connection/authority state |
| F11 finalization callback failure | Unnecessary | Preserve finalization/review destination and outcome certainty |
| F12 genuinely incompatible environment | Intentional | Fail closed at environment scope; preserve identity only if privacy permits |
| F13 foreground health/recheck | Conditional | Preserve route when healthy/compatible; leave shell only for proven global invalidation |
| F14 network failure during recheck | Unnecessary | Do not translate transport failure into global identity/environment loss |
| F15 spectator-mode entry | Intentional | Create spectator shell with explicit Today default |
| F16 invalid spectator tab normalization | Intentional | Select an allowed local fallback within spectator shell |

Counts: eight intentional, six unnecessary, and two conditional. These classifications describe the reviewed Build 10 transition families; physical attribution remains unknown when no correlated request evidence exists.

## Proposed state boundaries

### Identity state

Identity owns authentication, participant binding, certification, revocation, and visibility of private data. Only a typed, trustworthy identity event may tear down the private shell. An HTTP status alone is not enough: a resource-level 403 and a revoked session demand different behavior.

### Environment and mutation authority

Environment state owns release compatibility, activation, API capability, and write permission. It may fence mutations while keeping the shell mounted. A network failure during verification is “unknown authority,” not proof of incompatibility.

### Feature state

Each destination owns its pending, usable, stale-but-usable, partial, failed, and retry state. A sibling/background read cannot silently change the foreground destination.

### Navigation state

Navigation should be identity-bound and validated. It includes top-level tab, local subtab, and an allowlisted route plus opaque identifiers. Private paths are cleared on identity exit. Missing, obsolete, or unauthorized destinations use a local fallback without changing unrelated tabs.

## Proposed navigation requirements

### B11-NAV-001 — feature-local failures preserve the shell (P0)

Acceptance: inject each F07-F11 and F14 source while every top-level tab and representative nested route is active. Shell identity, tab, subtab, and route remain stable. The feature shows a typed local state. Mutations remain fenced until authority is proven. Physical verification must repeat a foreground and sibling/background failure over Wi-Fi and cellular.

Dependencies: typed scope from `B11-READ-003` and a navigation owner whose lifetime does not depend on the transient authority enum. Confidence: root cause PROVEN. Risk: shell retention must never preserve stale write authority or revoked private visibility.

### B11-NAV-002 — identity exits remain fail-closed (P0)

Acceptance: missing/revoked identity, UUID mismatch, rejected certification, deletion, and explicit sign-out remove private UI. Bare/scoped feature denial retains it. Unknown security state disables writes while resolution is pending. Physical verification compares one revocation with one feature-scoped denial.

Dependency: backend codes that distinguish identity, resource authorization, environment, and feature health. Confidence: overbroad mapping STRONGLY SUPPORTED; reviewed true-denial paths source-proven. Risk: under-classifying revocation can retain private data.

### B11-NAV-003 — lifecycle refresh preserves valid route (P0)

Acceptance: all five tabs and nested Match, Passport, History, Odds, Net Skins, and Calcutta paths survive healthy foreground, transport interruption, reconnect, and compatible release transition. Identity exit clears saved route. Invalid route restores to a documented local fallback. Physical verification includes background/foreground, network handoff, compatible hosted release transition, and full relaunch.

Dependencies: `B11-NAV-001` and identity-bound route validation. Confidence: state-lifetime gap PROVEN. Risks: a persisted route can outlive authorization; obsolete opaque IDs require safe local fallback.

### B11-NAV-004 — outcome context survives fences (P1)

Acceptance: timeout, lost acknowledgement, unknown finalization, reconnect, and scoped outage keep the exact match/hole/review destination visible, block unsafe resubmission, and state whether the outcome is known, unknown, accepted, or rejected. Physical verification cuts the network at save, acknowledgement, and readback boundaries.

Dependencies: `B11-SCORE-002`, `B11-READ-003`. Confidence: architecture PROVEN; physical timing remains untested. Risk: copy must not imply commit before acknowledgement.

### B11-NAV-005 — spectator traversal remains round-scoped (P1)

Acceptance: zero/one/partial/complete pairings, opaque IDs, and first/interior/last boundaries never cross rounds; endpoints are nil; placeholders do not fabricate detail routes. Physical verification traverses certified non-Production fixtures.

Dependency: canonical round membership/order projection. Confidence: prior defect and correction PROVEN. Risk: encoded fixture IDs can mask scope regressions.

## Destination behavior matrix

| Input event | Shell | Destination | Writes | Route |
|---|---|---|---|---|
| Feature pending/failure | Retain | Loading/error/stale content | According to independent authority | Retain |
| Scoped resource denial | Retain | Local forbidden state | Disable affected action | Retain or local authorized fallback |
| Transport offline/timeout | Retain | Local retry/offline state | Fence until safe | Retain |
| Environment compatibility unknown | Retain if privacy permits | Verification state | Disable | Retain pending result |
| Environment proven incompatible | Identity may remain; incompatible root permitted | Explicit upgrade/incompatibility state | Disable | Snapshot may be retained only for validated restoration |
| Identity revoked/deleted/mismatch | Remove private shell | Authentication/certification state | Disable and clear credentials as policy requires | Clear private route |
| User sign-out | Remove private shell | Signed-out chooser | Disable | Clear private route |
| Explicit home link | Retain | Home | Unchanged | Change by request |

## Verification

`NA-2026-007` is the primary navigation test. It must execute all F01-F16 classifications and assert the root, shell instance, identity, tab, subtab, path, feature state, and mutation authority before and after each event. `NA-2026-002`, `006`, `008`, and `009` provide round, scoring, Odds, and side-game coverage.

Passing source/model/simulator checks does not certify physical lifecycle behavior. A holistic navigation PASS requires the specified physical matrix and the isolated full-lifecycle dress rehearsal.
