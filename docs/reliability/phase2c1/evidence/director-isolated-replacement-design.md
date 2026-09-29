# Isolated Director replacement: source design and proof boundary

Status: SOURCE INSPECTED; runtime/SQL/hosted proof NOT PROVEN. Page unchanged while parent reviews safe replacement scope.

## What is already canonical

Production Director core is already backed by Supabase/PostgreSQL. Existing Production console supports setup, Players & Access, handicaps, current scoring controls, side-game entries/publication, Draft/Guide, audit. Google retirement need not rewrite those competitive authorities.

Relevant source:
- `app/admin/director/page.js`: Production gate/entitlement then ProductionDirectorConsole; every non-Production case selects legacy DirectorDashboard.
- `app/admin/director/ProductionDirectorConsole.js:133`: fixed fetch `/api/director/production-overview`.
- `app/api/director/production-overview/route.js`: `allowBootstrap:false`, accepts active `production-director-entitlement` only.
- `lib/production-director-console.js:defaultDependencies/readProductionDirectorOverview`: current runtime, read-control, enrollment, scoring-state, side-games and setup/handicap wrappers. Current runtime/read-control wrappers are explicitly Production bound.
- `lib/production-current-tournament-runtime.js`: hardcoded Production resource contract and activation assertion; not an isolated Preview adapter.
- `lib/production-cutover-read-control.js:inspectProductionCutoverReadState`: activation assertion before RPC using constant Production resource URL. Must not reuse by faking VERCEL_ENV or headers.
- `app/api/director/tournament-setup/route.js:authorize`: rejects non-Production before RPC, requires Production entitlement/current activation/origin for mutations.
- `ProductionPlayersAccessPanel`, `ProductionTournamentSetupPanel` similarly call fixed Production APIs.

## Existing Preview capability is narrower

- `readTournamentLiveView` and `readMatchAuthorizationMatrix` support bounded isolated canonical read adapters. The retired live-matches GET already uses them and preserves the old DTO.
- `currentScoringMutationAuthorityContract` supports a non-Production contract without Production scope spoofing.
- `authorizePreviewDirector` with a configured isolated database and same-origin Auth URL supports canonical preview account entitlement and leased impersonation. Root fixed its invalid-config Passport fallback and retired bootstrap.
- `readCanonicalScoringAuthority` selects `read_preview_scoring_authority` for non-Production.
- `finalizeCanonicalMatch` and `reopenCanonicalMatch` select the existing Preview canonical functions.
- `mutateCanonicalMatchControl` explicitly throws `OPERATION_NOT_SUPPORTED_UNDER_SUPABASE_AUTHORITY` in Preview. Mark Live / Lock / Resume / access control are not transparently available by changing the page component.
- `directorMutationAuthorityDiagnostics` enables those Production-only controls only through Production SCORING_COMMIT capability. Do not weaken that gate just to expose buttons.

## Minimum safe read replacement

A bounded isolated-only overview adapter can use existing canonical tournament view + exact match authorization read, selected from the verified Director entitlement tournament. It must verify view scope and fail closed, expose optional status as NOT_PROVEN/NOT_OBSERVED when no existing isolated adapter exists, and never call any Production-bound wrapper. Rendering can reuse existing presentation components with explicit supported capability controls. This proves only overview/read availability, not full setup/round-control/side-game editing.

Preconditions: exact isolated database allowlist, matching Auth origin, active canonical account entitlement, no Passport bootstrap, no request-controlled DB URL or tournament switch, no Production env spoof. Do not manufacture activation, worker health, prepared state, current pointer or result authority from display data.

Tests required before claiming this replacement complete: authorized isolated read yields existing DTO; anonymous/revoked/mismatched tenant denied before DB; explicit Production URL denied; failed/mismatched canonical read never falls back; unknown telemetry stays unknown; no unsupported mutation button or route is enabled; rendered page loads without old /api/director GET. Actual isolated SQL/API proof must verify schema/permission contracts, not only mocked route body.

## Exact remaining functional blocker

A selector/page-only change cannot preserve full isolated Director core functionality. The canonical Production operational APIs cannot be safely reused in Preview without distinct isolated adapters preserving actor/transaction/security contracts. Preview's current canonical adapter lacks several lifecycle operations outright, and setup/side-game authoring wrappers are Production-only. Completing those is meaningful contract/adapter work, not a safe one-line UI change.

Until implemented/proven: isolated Director full boot/control compatibility is NOT PROVEN. Production canonical code remains source-inspected and unit-covered; no Production or hosted validation occurred. Do not claim zero-Google Director PASS from retired410 or a console that subsequently403s.

This is separate from whether PostgreSQL canonical score/side-game authority is Google-independent. Do not reintroduce Google to mask the missing isolated surface.
