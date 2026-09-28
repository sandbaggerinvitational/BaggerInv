# Engineering target blueprint

**Audit boundary:** This document is based on historical evidence and source review only. The audit made no Production or staging requests, mutations, builds, deployments, or source changes. Every design below is proposed. It is not implemented or approved release evidence. Unknown measurements remain unknown.

## Architecture decision

Extend the existing stack with one canonical PostgreSQL scoring authority, bounded Vercel APIs, independent Native and PWA clients, a modest durable outbox and worker seam, constrained current-pointer read models, a mobile Director surface, isolated certification and diagnostic environments, and independent telemetry.

Do not adopt a microservices, event-sourcing, or AWS rewrite without measured need. Confidence is high in this direction. Exact schemas and budgets still require design review and performance proof.

## Native and contracts

- Identity and session state own authentication.
- Participant authority owns read and write eligibility.
- The shell owns the selected tab and navigation path independently of feature state.
- Feature repositories own loading, available, unavailable, and error states.
- Network state remains separate from identity and feature state.

A true identity invalidation clears protected authority. An optional-feature 503 preserves the shell, although the system may fence writes while authority is uncertain. Formal date, revision, and mutation serialization governs queue transitions. The client reconciles exact canonical acknowledgements and readback.

Clients submit gross scores only. Strokes, net scores, hole winners, and match results remain server authority. Versioned semantic contracts represent configured, no-result, current, historical, and stale states without inferring a session failure.

## Backend and database

The critical scoring transaction performs:

1. Authentication and authorization.
2. Idempotency resolution.
3. Current immutable scoring-context and expected-revision checks.
4. Gross-score validation.
5. Server calculation of strokes, net, hole result, and match state.
6. Canonical score, revision, receipt, audit, and minimal durable-event writes.
7. Commit and authoritative readback.

Keep correctness-critical values and audit evidence atomic. Remove historical side-game fingerprints, optional projections, and financial refresh from this transaction. A worker failure cannot relabel an Official score as failed.

Use one constrained current pointer per semantic domain, exact indexed scopes, and versioned component manifests. Preserve immutable history without rediscovering current authority by scanning it. Transaction scopes, indexes, function volatility and planning, and triggers are part of query-plan review. Raising timeouts or compute alone is not the design.

## Derived systems and operations

Net Skins, Calcutta, and Odds each own explicit configuration, job, result, publication, and history state. Narrow fingerprints contain only protected semantic facts. Versioned job compatibility replaces accidental activation stranding where security permits; exact runtime guards remain.

Event consumers deduplicate, retry within bounded policy, expose stale, superseded, and dead-letter states, and atomically advance current-result pointers. Public or financial publication requires owner review.

Tournament Operations derives phase, readiness, blockers, and the next safe action from bounded canonical inputs. It does not calculate golf independently. Whole-round operations bind a review fingerprint, stable operation ID, atomic transaction, immutable receipt, and scoped postcondition. An unknown response is resolved from the exact receipt and current authority. A changed scope invalidates stale review and explains the next safe action.

## Director, observability, and operations

Director synthesizes system health, current round, scoring availability, match completeness, side games, blockers, and the next safe action. Advanced IDs are available on demand. Proposed capabilities include GO, Prepare All, self-verifying Open, Recent Operations, Closeout, physical recovery, and Close Tournament.

Every consequential action shows its exact effect, revisions, reversibility, and dependencies, and requires the proper owner authority.

Trace request → operation or mutation → RPC and receipt → readback → client state. Retain database CPU, memory, I/O, connections, waits, restarts, and missing-data signals. During Tournament Mode, allow bounded current reads, prioritize score and control work, throttle optional polls and workers, and technically prohibit deep live diagnostics. Use measured compute headroom and rehearsed fallback and restore procedures.

## Delivery and proof

Implement observability and the test foundation first. Bounded score and current-pointer work may then proceed in parallel with approved Native persistence and navigation work. Continue through semantic lifecycle, Director integration, a full synthetic tournament, physical and owner rehearsal, and exact freeze.

Every P0 change requires same-layer regression, relevant integration, performance, and security proof, physical proof where required, a runbook, and durable evidence. Readiness is not a total test count.

Detailed proposed contracts: [Native](BUILD11-BLUEPRINT.md), [database](DATABASE-BLUEPRINT.md), [Director](DIRECTOR-BLUEPRINT.md), [automation](AUTOMATION-BLUEPRINT.md), [test](TEST-BLUEPRINT.md), [infrastructure](INFRASTRUCTURE-BLUEPRINT.md), and [evidence](EVIDENCE-BLUEPRINT.md). Proposed requirements are cataloged in [REQUIREMENTS](REQUIREMENTS.md); this audit does not approve them.
