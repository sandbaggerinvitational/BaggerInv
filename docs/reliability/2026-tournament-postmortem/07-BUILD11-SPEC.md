# Build 11 Native Specification

**Status:** PROPOSED. This document is design input. Nothing here is owner-approved, implemented, tested, or release-certified.

**Shipping baseline:** native Build 10 commit `e7652b9b65595861f4f7cdf0b8326491581a27b8`, inspected from `/private/tmp/bagger-build10-today/native`. The dirty main checkout and older SHA are excluded from claims about shipped behavior.

The machine-readable requirement catalog is `working/native-requirements.json`; the evidence catalog is `working/native-findings.json`. Those catalogs are the authoritative list of IDs, exact evidence locations, confidence, assumptions, risks, dependencies, physical tests, and incident-to-test mappings.

## Intended Build 11 outcome

Build 11 should preserve a valid participant or spectator destination during ordinary feature failure, make every scoring outcome and recovery state explicit, and represent valid server lifecycle states without converting them into global unavailability. The release should also retain prior corrections for tournament-local time, round-scoped spectator navigation, appearance, and spectator Today loading.

The target is a set of independently testable protections. It is not a claim that one architecture rewrite is required before any work starts. In particular, the local SQLite timestamp correction in `B11-SCORE-001` has no dependency on a broad backend redesign.

## Priority and requirement map

| ID | Priority | Proposed behavior | Primary incident/test |
|---|---:|---|---|
| B11-NAV-001 | P0 | Feature-local failure retains the authenticated shell and destination | INC-007 / NA-2026-007 |
| B11-NAV-002 | P0 | Only explicit identity or certification loss removes private UI | INC-007 / NA-2026-007 |
| B11-NAV-003 | P0 | Normal authority and lifecycle refresh preserves identity-bound navigation | INC-007 / NA-2026-007 |
| B11-NAV-004 | P1 | Scoring and finalization fences preserve outcome context | INC-006, 007 / NA-2026-006, 007 |
| B11-NAV-005 | P1 | Spectator detail traversal remains round-scoped | INC-002 / NA-2026-002 |
| B11-SCORE-001 | P0 | Durable timestamps and CAS comparisons use canonical values or revisions | INC-006 / NA-2026-006 |
| B11-SCORE-002 | P0 | Exact matching Official intent reconciles automatically | INC-006 / NA-2026-006 |
| B11-SCORE-003 | P0 | Every blocking queue state has truthful, safe actions | INC-006 / NA-2026-006 |
| B11-SCORE-004 | P0 | Process death and same-ID replay converge deterministically | INC-006 / NA-2026-006 |
| B11-SCORE-005 | P0 | Recovery restores admission and identifies the canonical next unscored hole | INC-006 / NA-2026-006 |
| B11-SCORE-006 | P1 | Physical multi-device and poor-connectivity scoring is certified | INC-006 / NA-2026-006 |
| B11-SCORE-007 | P1 | Canonical hole-specific strokes appear before first entry | INC-005 / NA-2026-005 |
| B11-SCORE-008 | P1 | Match lifecycle and scored-hole progress use separate copy | INC-005, 006 / NA-2026-005, 006 |
| B11-READ-001 | P0 | Odds contract represents the full legitimate output domain | INC-008 / NA-2026-008 |
| B11-READ-002 | P0 | Side-game lifecycle and published detail are separate states | INC-009 / NA-2026-009 |
| B11-READ-003 | P0 | Failure scope, retryability, and outcome certainty travel end to end | INC-004, 007, 008, 009 / matching NA tests |
| B11-READ-004 | P1 | Build 10 spectator Today state-machine behavior remains covered | INC-004 / NA-2026-004 |
| B11-READ-005 | P1 | Tournament-local time updates while views remain mounted | INC-001 / NA-2026-001 |
| B11-READ-006 | P1 | Appearance proof starts at Release-equivalent application roots | INC-003 / NA-2026-003 |
| B11-READ-007 | P1 | Redacted request diagnostics allow physical attribution | INC-004, 006, 007, 008, 009 / matching NA tests |

## State ownership

Build 10 gives `AppCoordinator` authority over the root state and lets a broad mobile-API failure leave the ready state. `RootView` then replaces the entire authenticated branch. The participant tab, subtab, and navigation path live inside that branch. This makes feature health, session identity, write authority, and navigation lifetime one accidental failure domain.

Build 11 should keep four concepts independent:

1. **Identity:** who is authenticated and whether private data may remain visible.
2. **Environment and write authority:** whether reads or mutations are permitted for this client/release/context.
3. **Feature state:** pending, usable, stale-but-usable, failed, unauthorized for this resource, or incompatible for one destination.
4. **Navigation:** the current identity-bound tab and path, validated against current authorization.

A feature error may fence writes and update the affected destination. It must not remove a valid shell. A true identity revocation must remove private UI and clear any saved private route. An unknown security state must fail mutations closed while the client resolves it; it must not invent a sign-out result.

## Acceptance model

Each P0/P1 requirement has a concrete acceptance statement and physical-device plan in `working/native-requirements.json`. Passing one proof layer permits only that layer's claim:

| Proof layer | Permitted claim |
|---|---|
| Source inspection | The implementation contains or removes a specific code path |
| Unit/model test | Deterministic model transitions pass controlled inputs |
| Adapter/contract test | Native and server agree on a versioned fixture |
| Simulator integration | App-level behavior passed in a simulated environment |
| Physical device | The specified OS/device/app lifecycle passed on hardware |
| Full lifecycle dress rehearsal | The complete isolated tournament choreography passed |

No combination that omits physical device and full lifecycle evidence may be summarized as a holistic release PASS. A prior green suite cannot be promoted to physical evidence.

## Required product behavior

### Participant shell and navigation

- Feature, match, environment, and identity errors must be distinguishable before navigation acts.
- Ordinary background/foreground, reconnect, compatible activation change, and feature retry must retain the selected identity-bound route.
- Explicit sign-out, deleted identity, certification rejection, or identity mismatch must clear private UI and private route state.
- Scoring and finalization screens must remain visible during unknown outcomes, with mutations disabled and outcome certainty stated.

### Scoring

- SQLite persistence must return canonical data suitable for comparison. Durable revision or canonical-field comparison is preferred to whole-record equality over noncanonical `Date` values.
- Unknown accepted outcomes reuse the original mutation ID. A stored acknowledgement causes reads only.
- An exact matching Official score may clear a stranded local intent only after fresh, context-bound proof; differing values never auto-resolve.
- Recovery must restore admission based on current server authority and guide the scorer to the first canonical unscored hole without overwriting an Official hole.
- Queue-state UI must distinguish syncing, accepted-awaiting-readback, unknown outcome, matching Official, differing Official, quarantine, and persistence failure.

### Reads and presentation

- Odds must use one versioned representation for every legitimate calculator output, including extreme finite values and infinity.
- Net Skins and Calcutta must expose lifecycle independently of optional detailed presentation. The product decision on historical results must be explicit.
- Spectator Today must render pending as loading, retry both required reads, keep usable content during normal refresh, and cancel safely on mode exit.
- Canonical per-hole strokes should appear before first score entry. This is a P1 operational-awareness gap: 2026 evidence did not show incorrect server scoring or proven competitive corruption.
- Match lifecycle and scored-hole progress must use distinct labels.

## Native/PWA parity and safe handoff

**Status:** PROPOSED. This section addresses requested fallback/parity Parts XXIX, XXX, LXXIX, CXL, CXCVII, and CXCVIII. It does not approve automatic cross-client mutation.

Native and PWA should share canonical server authority, gross-only scoring, stable mutation identity, acknowledgement/readback meaning, typed outcome certainty, and finalization rules. Parity does not require identical UI, cache, or local persistence. Each client's limitation must remain visible.

The system may automatically classify a native intent and advise whether handoff is safe. It must not automatically submit a new PWA mutation while a native outcome is unknown, accepted-awaiting-readback, conflicting, or locally blocked with unresolved evidence. The participant initiates a handoff only after exact reconciliation or an explicit safe state.

| Native state before handoff | Proposed PWA behavior |
|---|---|
| No unresolved native intent; fresh canonical writable authority | PWA may begin a new gross-only intent under the normal contract |
| Native intent queued, syncing, or outcome unknown | PWA shows read-only canonical state for that hole and must not mint a new mutation ID |
| Native acknowledgement stored; canonical readback pending | PWA may refresh/read only; it must not rePOST |
| Exact matching Official result established | PWA skips that Official hole and may continue only at a canonically unscored hole |
| Differing Official result or conflict | PWA does not overwrite or auto-resolve; use the supported review path |
| Backend/authority unavailable | Preserve gross source evidence and stop ambiguous digital retries; physical cards remain the independent fallback |

Acceptance belongs to proposed `PWA-001`, `B11-SCORE-002` through `004`, and `B11-READ-003`. Physical proof must exercise Native→PWA and PWA→Native transitions at the save, transport, acknowledgement, and readback boundaries and assert one canonical effect. Automatic same-client retry may reuse only the original durable mutation ID under its typed retry policy.

## Compatibility and rollout constraints

`B11-READ-001`, `B11-READ-002`, `B11-READ-003`, and `B11-SCORE-007` require coordinated contracts or explicit compatibility gates. A server-first response that Build 10 cannot parse is not an acceptable rollout. Contract fixtures must include Build 10 behavior during the transition.

Local work can start immediately on `B11-SCORE-001`, queue-state presentation design, navigation ownership design, and retention tests for Build 10 corrections. Release integration remains gated by each requirement's actual dependencies.

## Release language

Before physical and lifecycle evidence exists, reports should say “source verified,” “model tested,” “simulator tested,” or “ready for physical verification.” “Recovered” must state the exact state and boundary. Build 10 force-close/relaunch is not a guaranteed recovery: the deterministic audit recovered 47 of 50 injected syncing positions and re-triggered the timestamp fault in three; 25 of 25 acknowledged positions recovered; no physical-native recovery was claimed.
