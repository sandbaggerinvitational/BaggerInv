# Current-pointer baseline

## Scope and evidence

This document records the current-vs-history routing implemented in Release 139 at Git commit `b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6` (`b2065c90`). It is a source baseline, not a proposed design. It does not establish the installed database migration state, Production configuration, cache-hit rate, query plan, row count, or live latency.

The principal source is:

- `production_control.current_tournament_pointer_v1` and the annual runtime functions in `supabase/production_migrations/202608300064_production_future_year_administration_v1.sql` and `202608300066_production_future_runtime_activation_v1.sql`;
- `readProductionCurrentTournamentRuntime` in `lib/production-current-tournament-runtime.js`;
- `resolveProductionCurrentReadDispatch` in `lib/production-current-read-dispatch.js`;
- `scoringShadowRpc` and the Production translation in `lib/scoring-shadow.js` and `lib/production-cutover-read-transport.js`;
- the explicit historical services in `lib/completed-history-service.js`, `lib/completed-history-supabase.js`, `lib/history-2026-service.js`, `lib/history-2026-supabase.js`, and `lib/secondary-history-service.js`.

Confidence is **high for the source call graph** and **unknown for live deployment state and performance**. No provider, account, or Production query was made for this baseline.

## Selection contract

`production_control.current_tournament_pointer_v1` contains one row per `scope_key`. Its foreign key binds `tournament_id` and `tournament_year` to the future-tournament catalog, and its revisions are positive integers. A separate partial unique index permits one catalog row in lifecycle `ACTIVE`. The migration seeds the `BAGGER_INV_PRODUCTION` pointer to tournament `2026`, year `2026`, pointer revision `1`, and lifecycle revision `1` when the frozen Production resource is present.

`read_production_current_tournament_runtime_v1(input)` is the server-only runtime read. It checks service-role access and the exact Production project URL, project ref, and source workbook. It then reads the pointer, verifies that the selected catalog row is `ACTIVE` at the same lifecycle revision, and reads its active annual runtime generation. The 2026 pointer is explicitly allowed to have no annual generation and returns status `FROZEN_2026_RUNTIME`. A later pointer must have an `ACTIVE` generation and returns runtime, authority, and admission generation IDs.

`readProductionCurrentTournamentRuntime()` calls that RPC with a ten-second client timeout and normalizes the returned identity and revisions. It rejects malformed identifiers, non-active lifecycle state, missing future-generation IDs, and an unexpected pointer revision. The function does not report its own request duration.

The generic current-read path is:

1. A server adapter calls `scoringShadowRpc(logicalRpc, body)`.
2. `productionCutoverReadTransportEnvironment` proves that Production cutover, credentials, phase, and public reads permit the logical RPC.
3. `resolveProductionCurrentReadDispatch` resolves the current runtime for an allowlisted current read.
4. For frozen 2026, the caller body is left unchanged. For a later year, the caller's `target_tournament_id` is replaced and the exact pointer/runtime/authority/admission tuple is added.
5. `productionCutoverReadRpcTranslation` selects the installed Production RPC. Future-year current views receive the annual tuple, which the future SQL runtime functions recheck against the current pointer and active generation.

`resolveProductionCurrentReadDispatch` wraps its normal runtime reader in React `cache`. The source proves memoization is requested; it does not expose its lifetime, hit count, or reduction in provider requests in a deployed runtime.

The frozen 2026 path and the later-year path are intentionally different. The frozen branch preserves the installed 2026 request shape. The future branch is generation-bound and database-rechecked. The source does not justify treating those two paths as operationally identical.

## Pointer-sensitive current-read inventory

The definitive allowlist is `PRODUCTION_POINTER_CURRENT_READ_RPCS` in `lib/production-current-read-dispatch.js`. These logical operations mean “the tournament selected by the Production pointer” when the Production cutover transport is active.

| Logical RPC | Application adapter or caller | Current data role |
| --- | --- | --- |
| `authorize_match_access` | `lib/match-authorization-supabase.js` | Match view/scoring authorization |
| `read_calcutta_configuration_view` | `lib/calcutta-supabase.js` | Current Calcutta configuration |
| `read_championship_odds_inputs` | `lib/championship-odds-supabase.js` | Current championship-odds inputs |
| `read_competition_derived_state` | `lib/competition-derived-supabase.js` | Current derived competition state |
| `read_current_guide_projection` | `lib/guide-supabase.js` | Current published guide projection |
| `read_game_center_view` | `lib/game-center-supabase.js` | Current match game-center view |
| `read_leaderboards_core_view` | `lib/leaderboards-core-supabase.js` | Current leaderboard projection |
| `read_match_authorization_matrix` | `lib/match-authorization-supabase.js` | Current authorization matrix |
| `read_my_match_view` | `lib/my-match-supabase.js` | Current participant match view |
| `read_net_skins_input_view` | `lib/net-skins-supabase.js` | Current Net Skins inputs |
| `read_net_skins_result_view` | `lib/net-skins-supabase.js` | Current Net Skins results |
| `read_participant_home_view` | `lib/participant-home-supabase.js` | Current participant home |
| `read_participant_identity_context` | `lib/participant-identity-supabase.js` and `lib/production-current-participant-identity-server.js` | Current player identity/membership context |
| `read_production_calcutta_v1` | `lib/production-calcutta-v1.js` | Current participant/observer Calcutta view |
| `read_production_net_skins_v1` | `lib/production-net-skins-v1.js` | Current participant Net Skins view |
| `read_published_odds_view` | `lib/published-odds-supabase.js` | Current published odds |
| `read_preview_draft_view` with `target_scope=CURRENT` | `lib/draft-supabase.js` | Current draft view |
| `read_tournament_live_view` | `lib/tournament-live-supabase.js` | Current live tournament view |
| `read_tournament_secondary_view` | `lib/tournament-live-supabase.js` | Current secondary live module view |

`read_preview_draft_view` is deliberately split: `CURRENT` follows the pointer; `YEAR`, `YEARS`, and `PLAYER` stay explicitly addressed.

Some modules resolve the runtime directly because they must bind more than a generic view call. Release 139 direct consumers include the homepage, live-matches API, tournament foundation/live APIs, game-center loader, odds-center page, tournament-guide resolver, draft runtime, participant identity checks, Director authorization/console, mobile bearer/native admission, Production odds calculation, and Production scoring operations. The exact source files are returned by searching for `readProductionCurrentTournamentRuntime`; this list describes the checked-in baseline, not deployed traffic volume.

Production scoring has its own current-pointer transport in `lib/production-scoring-operations-server.js`. Each non-preactivation operation resolves a dispatch context by reading both platform certification and current runtime. For frozen 2026 it calls the named 2026 RPC. For a later current tournament it dispatches through `dispatch_production_annual_scoring_v1` with the exact annual tuple. That path is detailed in `SCORE-CRITICAL-PATH-BASELINE.md`.

## Explicit historical inventory

Historical reads are selected by explicit year, player, course, or match inputs. They are not members of `PRODUCTION_POINTER_CURRENT_READ_RPCS` unless called as a separate current-data supplement described below.

| Historical domain | Source path | Addressing and behavior |
| --- | --- | --- |
| Completed History 2017–2025 | `lib/completed-history-service.js` → `lib/completed-history-supabase.js` → logical `read_preview_completed_history` | `YEARS`, `YEAR`, `PLAYER`, `COURSE`, or `MATCH`; the Production translator uses `read_production_cutover_completed_history` and preserves an explicit `tournament_year` from 2017 through 2025. It does not resolve the current pointer. |
| Immutable 2026 History aggregate | `lib/history-2026-service.js` → `lib/history-2026-supabase.js` → `read_preview_2026_historical_view` | The service rejects every ID/year except `2026`; the RPC is absent from the pointer dispatch allowlist. The Production cutover transport still authorizes and translates it, but it remains a fixed-2026 read. |
| Secondary/career History model | `lib/secondary-history-service.js` | Composes all completed 2017–2025 views, the explicit 2026 view, and a player projection, then calculates records/ratings in application memory. The logical model is historical rather than current-pointer selected. |
| Historical routes | `app/history/**`, `app/champions/**`, `app/players/**`, `app/records/**`, `app/statistics/**`, `app/compare/page.js`, and `app/board-of-governors/page.js` | Consume the explicit services above when their Supabase read source is selected. |

The cold secondary-history orchestration is broad by source: it first reads a completed-year revision index, may then read nine year payloads, and concurrently loads the 2026 bundle and player projection. React caches and revision-keyed in-memory caches can eliminate some work. No request-count telemetry proves the deployed cold/warm distribution.

## Mixed current/history dependencies

The primary 2026 historical aggregate is fixed to 2026, but `loadHistory2026ViewUncached` also requests `read_current_guide_projection` for course presentation and optionally `read_leaderboards_core_view` for tournament-player metadata. Both supplemental logical RPCs are in the current-pointer allowlist. While 2026 is the frozen current pointer they select the same tournament. After a future pointer advance, the checked-in dispatch would select the new current tournament for those supplements while the primary historical aggregate remains fixed to 2026.

That is a source-observable mixed boundary. Whether the 2026 History routes are disabled, separately configured, or otherwise protected after a real pointer advance is **UNKNOWN** because Release 139 source does not contain deployed account state or a live post-advance proof. This baseline records the coupling without proposing a replacement.

Participant identity has another split. `read_participant_identity_context` is pointer-sensitive, and `resolveSupabaseParticipantIdentity` performs an additional `readProductionCurrentTournamentRuntime` equality check in Production. The mobile bearer path likewise verifies that the returned participant tournament equals the active runtime. These are current identity checks, not history reads.

## Query-count and timing observability gaps

The source exposes partial durations, not an end-to-end current-pointer span:

- `scoringShadowRpc` returns `durationMs` from the translated provider request. Pointer resolution happens before `supabaseRequest` starts its timer, so the duration excludes the runtime RPC and dispatch work.
- `readProductionCurrentTournamentRuntime` has a timeout but no returned duration, query count, cache-hit field, or database `query_ms`.
- Several view payloads may contain their own `query_ms`, but Release 139 has no uniform contract requiring it across all 19 pointer-sensitive operations.
- The 2026 History service reports primary `query_ms`, individual request durations, adapter time, cache-hit state, and total service time. It does not report the number of provider calls or rows scanned, and its primary `query_ms` does not cover current-guide/player supplements.
- Completed/secondary History report application request and service durations but not database statement counts, rows scanned, buffer/cache behavior, or a per-subquery breakdown.
- React `cache` and module caches expose no production hit/miss metric beyond the 2026 adapter's local `adapterCacheHit` diagnostic.

Timeout constants are cancellation bounds, not measured latency objectives. This source review provides no Release 139 p50, p95, p99, I/O, CPU, connection, or cache-hit measurement, and makes no live-performance claim.

## Baseline conclusions

- Current tournament identity is server-selected. Current read callers cannot authoritatively choose a year through `target_tournament_id` on the future branch.
- Frozen 2026 compatibility and future annual routing are distinct source paths.
- Completed 2017–2025 and the primary 2026 History aggregate are explicitly addressed and are outside the current-pointer dispatch.
- The 2026 History service includes two current-pointer-sensitive supplemental reads; post-advance historical behavior is not proven by this source baseline.
- Static source reveals call shape and bounds, but not installed state, actual query counts, or live latency.
