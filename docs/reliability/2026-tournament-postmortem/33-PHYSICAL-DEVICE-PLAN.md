# Build 11 Physical-Device Validation Plan

**Status:** PROPOSED. This plan has not been approved or executed. It authorizes no Production testing.

All mutable scenarios use an isolated, production-shaped non-Production environment and disposable tournament data. Network fault injection, clock injection, process termination hooks, and synthetic failures must be release-excluded. No procedure in this plan should call or mutate Production.

## Claim policy

A result must name its proof layer. Source review, deterministic model tests, contract fixtures, simulator integration, physical device runs, and full lifecycle rehearsals are different evidence. “Holistic PASS,” “release certified,” or equivalent language requires both the required physical matrix and the full isolated lifecycle. Missing evidence is recorded as NOT TESTED or BLOCKED, never inferred from a prior green suite.

The 2026 reports include valuable physical observations, but few retained logs tie those observations to a specific native request and state transition. They may establish symptom existence; they do not automatically prove attribution. Build 11 evidence must keep physical observation and causal proof separate.

## Minimum matrix

Run each applicable test on:

- a smallest supported iPhone class and a largest supported iPhone class;
- the minimum supported iOS major version and the current release-supported iOS version;
- light and dark system appearance where appearance or shared controls matter;
- default and accessibility Dynamic Type, with VoiceOver checks for state/action meaning;
- Wi-Fi and cellular, plus controlled offline, high latency, timeout, response loss, and handoff states where network behavior matters;
- cold launch, warm foreground, background/foreground, and force-terminate/relaunch boundaries where lifecycle behavior matters.

Record the exact device model, OS, native build/commit, server release/activation, contract version, fixture ID, account/identity alias, time zone, appearance, network state, test ID, start/end timestamps, and operator. Timing is UNKNOWN unless the retained evidence bounds it.

## NA-2026-001 — tournament timezone and mounted clock

**Incident:** 2026-INC-001. **Priority:** P1 retention.

Setup three devices/sessions whose device zones are New York, Chicago, and UTC while the tournament publishes one IANA zone. Exercise tournament-local midnight for three tournament dates and both relevant DST directions using a release-excluded injected clock. Keep views mounted across the boundary, then repeat with background/foreground and focus. Compare PWA and native day label, schedule, and activation presentation.

Pass conditions: all sessions select the same tournament day; mounted content updates without view recreation; competitive match/score lifecycle, identity, and mutation authority do not change. Retain before/after screen capture, injected-time record, app diagnostics, and server read-only projection. A simulator-only clock test cannot close this item.

## NA-2026-002 — round-scoped spectator match navigation

**Incident:** 2026-INC-002. **Priority:** P1 retention.

Use rounds with zero pairings, one match, partial pairings/placeholders, and complete pairings. Traverse first, interior, and last detail in each round using opaque IDs. Verify previous/next, index/count, back behavior, and placeholder tap behavior.

Pass conditions: navigation never crosses rounds; endpoints are nil; every index/count derives from the same round membership; placeholder rows do not fabricate detail. Retain a route trace and server fixture membership alongside screen evidence.

## NA-2026-003 — spectator More and Release-root appearance

**Incident:** 2026-INC-003. **Priority:** P1 retention.

Install a Release-equivalent/TestFlight build. Starting signed out, enter spectator mode and capture chooser, Today, Matches, Leaders, and More in light/dark system appearance on small/large devices. Repeat participant roots and accessibility contrast settings. Do not use a DEBUG fixture that forces an outer light scheme.

Pass conditions: the documented product-root scheme owns all surfaces; shared adaptive controls remain legible; cards, separators, disclosure controls, and navigation chrome meet the approved contrast standard; app content is not masked. Retain uncropped captures and appearance settings.

## NA-2026-004 — spectator Today load/retry lifecycle

**Incident:** 2026-INC-004. **Priority:** P1 retention.

Control the two required Today resources independently. Exercise initial pending, one complete/one pending in both orders, both success, each single failure, both failure, invalid model, timeout, 503, cancellation, interruption, repeated retry, background, relaunch, and mode exit during the attempt.

Pass conditions: pending/partial shows loading; failure appears only after a required request definitively fails; retry starts both required requests exactly once; usable content remains during ordinary refresh; stale or cancelled generations do not publish after exit. Retain client request IDs, server fixture events, state-transition log, and screen recording. A physical unavailable screen without request correlation cannot identify capacity or the failing resource.

## NA-2026-005 — canonical pre-entry strokes

**Incident:** 2026-INC-005. **Priority:** P1 presentation.

Use all 18 holes in Best Ball, Scramble, and Singles with zero, positive, multiple, and approved negative/given allocation cases. Before any score entry, compare each row's badge/semantic label with the server-owned allocation. Save one hole in every format and compare the pre-entry allocation with the applied post-save result. Review sunlight-like brightness, small/large device, Dynamic Type, and VoiceOver.

Pass conditions: canonical allocation is visible before entry and matches post-save application; gross mutation payload remains gross; the client performs no authoritative allocation from displayed handicap; copy does not suggest the scorer should subtract strokes. This test closes presentation awareness only. It must not be reported as evidence that a 2026 result was competitively corrupted.

## NA-2026-006 — SQLite queue, recovery, and multi-device scoring

**Incident:** 2026-INC-006. **Priority:** P0.

Use the real app-container SQLite store. Generate fractional times across every transition and mutable date field. Exercise termination before durable intent, after intent, after lease, during POST, after commit/before ACK, after ACK/before persistence, after persistence/before readback, after readback/before compaction, and during recovery. Include stored-ACK read-only recovery and unknown-outcome same-ID replay. Repeat with response loss, timeout, 503, airplane mode, Wi-Fi/cellular handoff, background, and compatible reactivation.

With two physical devices, cover same-hole contention, adjacent-hole progress, and later Official holes while the first device recovers. Run Best Ball, Scramble, and Singles through 18 holes and finalization.

Pass conditions:

- no fractional timestamp creates a false concurrent modification;
- a real competing write still conflicts;
- unknown outcomes reuse exactly one original mutation ID;
- stored acknowledgement recovery sends reads only;
- every server mutation ID has at most one canonical effect;
- matching Official intent resolves only with full fresh context and nonregressed revisions;
- differing Official intent remains explicit review;
- each durable state has truthful safe actions;
- next-entry admission returns only under current authority and identifies the first canonical unscored hole without treating `progress.currentHole` as “next”;
- no hidden queue residue remains at round/finalization completion.

Retain SQLite snapshots at each boundary, redacted request/receipt IDs, canonical projections/revisions, state-transition events, process/lifecycle trace, mutation-count assertion, and screen recording. Build 10's 47/50 syncing and 25/25 acknowledged injected recovery results are baseline evidence, not a Build 11 physical PASS.

Add a cross-client handoff submatrix at the same process boundaries. From Native, attempt PWA continuation with: no unresolved intent, queued intent, syncing/unknown outcome, stored acknowledgement/readback pending, exact matching Official result, differing Official result, and local persistence failure. Repeat the safe directions from PWA to Native. Pass only when unsafe states block a new cross-client mutation, read-only refresh remains available where authorized, exact matching Official holes are skipped, and safe continuation creates at most one canonical effect. This is proposed `PWA-001` acceptance; no automatic cross-client submission is authorized.

## NA-2026-007 — feature failure and navigation preservation

**Incident:** 2026-INC-007. **Priority:** P0.

Exercise F01-F16 from the trigger inventory. For F07-F11 and F14, inject each failure while every top-level tab and representative nested path is active, including a sibling/background read. For F06 compare an explicitly resource-scoped denial with an explicitly identity-scoped denial. For F13 compare healthy/compatible, transport-unknown, incompatible, and revoked outcomes. Include Wi-Fi/cellular handoff, background/foreground, compatible activation transition, and relaunch.

Pass conditions: intentional triggers perform their documented transition; unnecessary triggers preserve shell instance, identity, tab, subtab, and route; conditional triggers act only on typed scope; mutations are fenced independently; true identity exit removes private UI and clears private routes. Retain before/after route snapshots and correlated request/error/action events.

## NA-2026-008 — Odds extreme legitimate domain

**Incident:** 2026-INC-008. **Priority:** P0.

Use shared backend/native fixtures for both signs, 1- through at least 7-digit legitimate American odds, the known `+1666567` boundary case, signed infinity policy, malformed strings, and every display phase. Test small/large devices, Dynamic Type, VoiceOver, and error recovery.

Pass conditions: every legitimate calculator output crosses the versioned contract and renders without clipping or semantic rejection; malformed/unsupported input fails Odds only; the shell and route remain; Build 10 compatibility behavior during rollout is explicitly verified. Retain exact fixture values, server serialization, native decoded model, and captures.

## NA-2026-009 — side-game mixed lifecycle

**Incident:** 2026-INC-009. **Priority:** P0.

Run a long-lived session through Net Skins and Calcutta configure R1/R2, calculate, publish, add configured R3, withdraw/supersede, dependency stale, recalculate, and republish. Include mixed Official/Official/Configured, HTTP 200 with `presentation:null`, timeout, and typed 503. Track 009A Net Skins result-currentness separately from 009B Calcutta dependency/read behavior.

Pass conditions: the selected product and route remain; Configured, Awaiting calculation, Stale dependency, Published, Withdrawn, and Unavailable are distinguishable; historical results appear only under approved authority and never as current by inference; no detail is fabricated; sibling failure does not reset Today. Retain envelope/revision, lifecycle transition, request IDs, route snapshots, and screen recording.

## Cross-cutting physical automation and compatibility scenarios

These scenarios address requested Parts CCXXXVI through CCXL. They are PROPOSED and require approved environment-specific thresholds before execution.

- **Physical automation:** use release-excluded hooks only to pause transport, terminate at a named durable boundary, and expose a privacy-safe state category. Automation must not edit SQLite, fabricate an acknowledgement, bypass authority, or ship in the release candidate. A manual run remains required for gestures, accessibility, and owner comprehension.
- **Network conditioning:** define named Wi-Fi, cellular, offline, latency, loss, response-loss, and handoff profiles. Record the measured condition actually delivered. Do not invent latency, bandwidth, or loss thresholds in this audit.
- **Long-lived app:** keep participant scoring, spectator Today, and side-game destinations mounted through the approved rehearsal duration, tournament-local midnight where relevant, repeated background/foreground cycles, network transitions, and cache refresh. The duration remains an approval input; no unmeasured “soak PASS” is allowed.
- **Backend release during an open client:** hold each representative Native/PWA destination open while a backward-compatible server release and activation transition occurs. Verify route, identity, read usability, mutation fence, contract version, and recovery without claiming compatibility from final state alone.
- **Mixed versions:** exercise Build 10 and the Build 11 candidate against every supported transition server contract, then exercise the Build 11 candidate before, during, and after server rollout. A response that Build 10 cannot parse requires an explicit compatibility gate or rollout order. Retain the exact version-pair matrix.

## Full lifecycle dress rehearsal

After all P0 NA tests pass independently, run one isolated tournament lifecycle from account/certification through spectator/participant entry, match navigation, 18-hole multi-device scoring, finalization, Odds, Net Skins, Calcutta, background/foreground, loss/recovery, and relaunch. Run retained P1 presentation checks in the same release candidate where practical.

The dress rehearsal is a separate test artifact. It does not erase individual failures. If any P0 requirement fails, the holistic result is FAIL. If a required physical step is missing, the holistic result is NOT TESTED or INCOMPLETE, never PASS.

## Evidence package

Each run produces an immutable manifest, step log, exact fixture/configuration, request-correlation export, redacted state transitions, before/after canonical snapshots, mutation-count assertions where applicable, screen recording/captures, defects, rerun links, and operator attestation. Hash artifacts and identify exclusions. Do not include secrets, contact details, score payloads beyond the minimum approved isolated fixture, or Production data.
