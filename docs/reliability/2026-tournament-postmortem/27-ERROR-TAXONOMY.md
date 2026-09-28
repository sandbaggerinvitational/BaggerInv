# Native Error Taxonomy and UI Consequences

**Status:** PROPOSED Build 11 design. It is neither approved nor implemented.

**Baseline:** Build 10 `e7652b9b65595861f4f7cdf0b8326491581a27b8`.

## Problem

Build 10 can convert a generic mobile-API failure into an environment refresh, then replace the authenticated root. The same broad path receives events with materially different meaning: feature outage, malformed or unrepresentable success data, scoped authorization, transport loss, environment incompatibility, or identity revocation. HTTP status alone cannot safely choose a security, navigation, retry, or scoring-outcome action.

Incidents illustrate the ambiguity:

- Spectator Today had a local pending/retry defect while physical capacity attribution remained unknown (INC-004).
- A local queue persistence fault could coincide with a known server commit and unknown local acknowledgement state (INC-006).
- Feature-coded errors could destroy global navigation (INC-007).
- A legitimate Odds value produced a backend 503, while the native decoder also rejected the same value under a six-digit semantic rule (INC-008).
- Side-game HTTP 200 envelopes with `presentation:null` were valid lifecycle states that the detail screen could not represent (INC-009).

## Proposed independent axes

Every failure or incomplete result should carry independent values for:

| Axis | Proposed values | Consumer decision |
|---|---|---|
| Scope | feature, resource/match, mutation-authority, environment, identity | Which state may change |
| Outcome certainty | not-started, not-accepted, unknown, accepted, rejected, not-applicable | Whether retry may send and with which ID |
| Retryability | immediate, backoff, after-refresh, after-auth, after-upgrade, explicit-review, never | What action appears |
| Data usability | none, stale-usable, partial-usable, canonical | Whether content remains visible |
| Contract meaning | transport-failure, typed-error, invalid-success, valid-empty/lifecycle, compatible-success | Whether HTTP code can be trusted as sufficient |
| Security action | none, fence-writes, hide-resource, remove-private-shell, clear-session | Privacy and authority behavior |

These axes may be encoded in one versioned envelope or in native mapping over stable server codes. Their semantics must be shared fixtures, not inferred from strings.

## Proposed classes and actions

| Class | Examples | Shell/navigation | Retry/mutation behavior |
|---|---|---|---|
| Identity invalid | Revoked session, participant binding mismatch, explicit deletion | Remove private shell and clear private route | No mutation; reauthenticate or stop |
| Certification invalid | Trust/certification rejected | Fail closed with explicit global state | No mutation until recertified |
| Environment incompatible | Client release/capability truly unsupported | Explicit upgrade/incompatibility state | No mutation; retry only after compatibility change |
| Environment unknown | Verification timed out/offline | Preserve shell if privacy permits | Fence transport; do not declare incompatibility |
| Resource unauthorized | User valid, feature/match denied | Preserve shell; local forbidden state | Disable affected action only |
| Feature unavailable | 503 or typed feature outage | Preserve shell/destination | Local backoff/retry; sibling features remain |
| Transport unavailable | Offline, timeout, connection loss | Preserve shell and usable content | Queue/local Save only when independent authority permits |
| Invalid success | HTTP 200 but required contract invariant fails | Preserve shell; local incompatible/error state | Never treat as accepted mutation; log contract code |
| Valid lifecycle without detail | Configured, calculating, stale, withdrawn, `presentation:null` | Preserve destination; render lifecycle | Poll/retry only according to state |
| Mutation unknown outcome | Response lost after possible acceptance | Preserve exact score context | Same mutation ID only; reconcile before new intent |
| Mutation known accepted/readback pending | Stored acknowledgement | Preserve context; show accepted/readback state | Reads only; never rePOST |
| Canonical conflict | Differing fresh Official values | Preserve review context | Explicit safe review; no auto-resolve |
| Local persistence failure | Durable transition failed | Preserve context; show actionable fault | Fail writes closed; reconcile/repair without discarding evidence |
| Cancellation or obsolete generation | Mode exit, identity lifecycle replacement | Do not publish obsolete state | Cancel safely; no global error |

## Semantic HTTP requirements

- A 200 response is transport success, not automatic semantic success. A valid lifecycle envelope with no detail is different from a malformed success.
- A 401/403 is not automatically an identity failure. Stable scope must distinguish session, resource, match, certification, and write authority.
- A backend 503 caused by projection/serialization of a valid domain value remains a backend defect; native semantic limits must independently cover the full legitimate domain.
- Timeouts and cancellation must preserve outcome certainty. A scoring timeout after transport start cannot be treated like a read timeout.
- Unknown or legacy error codes must follow a documented fail-closed mutation policy while preserving privacy-safe shell state where possible.

## B11-READ-003 — typed failure scope (P0)

Acceptance: the 18-case Build 10 failure matrix, all F01-F16 navigation families, true identity codes, scoped scoring denials, semantic 200, cancellation, timeout, offline, and coded conflict each map to one documented UI/security action with no unrelated shell mutation. Physical verification injects feature outage, environment outage, scoped denial, and identity revocation.

Dependencies: backend code contract plus `B11-NAV-001` and `B11-NAV-002`. Confidence: taxonomy ambiguity PROVEN. Assumption: legacy servers can be safely mapped or version-gated. Risks: unknown-code fallback and under-classified security failure.

## Related read requirements

- `B11-READ-001` (P0): version the Odds representation so backend and native accept the legitimate output domain. Verify signs, 1- through at least 7-digit values, infinity, malformed values, and every display phase under `NA-2026-008`.
- `B11-READ-002` (P0): render side-game lifecycle independently from published detail. Verify configure, calculation, publish, newer configured round, stale dependency, withdrawal/supersession, recalculate, and republish under `NA-2026-009`.
- `B11-READ-004` (P1): preserve spectator Today loading/retry semantics under `NA-2026-004`.
- `B11-READ-007` (P1): emit bounded redacted diagnostics that can attribute a physical request without including tokens, phone, email, gross score, or private payload.

## Proposed diagnostic event

For each meaningful request outcome, a privacy-safe event should contain:

- request correlation ID and stable resource category;
- client release/build and contract version;
- HTTP status and stable error code, if present;
- scope, retryability, outcome certainty, and data-usability categories;
- coarse duration bucket, app lifecycle, and network class;
- current destination category and queue-state category;
- resulting action: retained, locally failed, write-fenced, route fallback, or root exit.

Tokens, participant contact details, raw identifiers unnecessary for correlation, score payloads, and full response bodies are excluded. Retention and export require privacy review. `NA-2026-004`, `006`, `007`, `008`, and `009` must verify one correlatable client/server event for each injected case.

## Claim boundary

This taxonomy can be source- and contract-tested before hardware work. It is not physically certified until TestFlight fault injection verifies the corresponding shell, navigation, write fence, and recovery state. Error-handling PASS cannot stand in for full tournament lifecycle proof.
