# Google dependency register

Base inspected: `ab909d4519ea1331e27b0924de1572ebaf690777`. **PROVEN — SOURCE** means the source and installed local definition were inspected; it does not describe Production. The candidate has not been deployed.

## Count and classification contract

There are **30 application dependency groups**, of which **24** were automatic or selectable runtime groups before retirement. Migration125 changes **27 exact SQL function definitions**; these overlap those application chains. Do not add them to claim a larger number of independent dependencies. The JSON register preserves every group and exact SQL function/source hash.

A = active required runtime; B = active optional runtime; C = development/migration only; D = historical import; E = historical evidence; F = obsolete/disconnected; G = unresolved. A legacy selectable Google-authoritative path is distinguished from the already canonical Supabase path. A destination gate can be required operationally without being competitive authority.

**Open G items:** optional CMS/media authoring completeness (GR-APP-28), optional Passport readiness/notification parity (GR-OPTIONAL-01), and actual external scheduling inventory (GR-CONFIG-01). No unknown critical canonical authority is asserted resolved merely by disconnecting an adapter. Their requiredness is explicitly unproven; current canonical tournament functions have identified replacements. Runtime proof gaps remain in the certification matrix, independently of source classification.

**Classification subject:** every A–G entry classifies the Google dependency edge, not the containing canonical function. F / DISCONNECT means the provider producer/gate is retired; all27 canonical functions patched by125 and5 release functions patched by126 remain active. Zero examined critical Google runtime edges does not mean every required replacement interface is complete. The candidate remains PARTIAL for the documented functional/proof gaps.

## Application call chains

| ID | Source / caller | Before | Google purpose | Canonical replacement | Retirement action |
|---|---|---|---|---|---|
| GR-APP-01 | `lib/scoring-google-outbox.js` `processNextGoogleOutboxEvent` → `deliverWithGoogleWriter` | B | Sheets mirror of canonical score, lifecycle, permission state | Canonical hole_scores/score_mutations/audit; no mirror obligation | DEPRECATE / DISCONNECT NOW |
| GR-APP-02 | `lib/mobile-v1-scoring-post-commit.js:1–25` `runMobileScoringPostCommit` | B | Unconditional parallel `drainGoogleOutbox` + `drainScorecardArchiveJobs`, then internal Competition/Intelligence/Calcutta | Internal Competition/Intelligence/Calcutta consumers only | DEPRECATE / DISCONNECT NOW |
| GR-APP-03 | `app/api/scoring/current/route.js:142+`, `app/api/scoring/matches/[matchId]/route.js:126+` | B | Next `after` schedules Google mirror/archive when worker phase available | Canonical acknowledgement; internal post-commit consumers only | DEPRECATE / DISCONNECT NOW |
| GR-APP-04 | `app/api/director/route.js:307–351` canonical lifecycle branch | A | Awaits mirror after canonical commit; failure throws503 `GOOGLE_MIRROR_DELIVERY_PENDING`; trace and response include mirror state | Canonical lifecycle receipt controls success | DEPRECATE / DISCONNECT NOW |
| GR-APP-05 | `app/api/live-matches/route.js:140–164,202–213,265` | A | Canonical control/finalization drains Google; legacy branch performs Google writes and confirmation | Supported PostgreSQL control/finalization contracts | DEPRECATE / DISCONNECT NOW |
| GR-APP-06 | `app/api/director/route.js:361+` (Google branch) `withProductionGoogleAuthorityWrite` → updateTournamentAdminData/mark/access/finalize/pairings/Calcutta/NetSkins/course | A | Legacy workbook-authoritative Director operations | Production Director canonical authoring/control APIs; legacy UI parity not assumed | DEPRECATE / DISCONNECT NOW |
| GR-APP-07 | `lib/scoring-persistence-adapter.js:86–119` `persistParticipantScore` Google branch | A | Google live score/confirm, optional ingress lease; canonical fallback branch exists | submit_production_hole_score + canonical acknowledgement | DEPRECATE / DISCONNECT NOW |
| GR-APP-08 | `lib/scorecard-archive-worker.js` `processNextScorecardArchiveJob` → upsert/invalidate RoundScorecards + readback/checkpoint | B | Sheets human-readable scorecard export; canonical finalized snapshot is separate DB artifact | finalized_scorecard_snapshots + canonical snapshot audit | DEPRECATE / DISCONNECT NOW |
| GR-APP-09 | `app/api/cron/scoring-google-outbox/route.js` POST | B | Config/secret-gated claim/drain1–25, phase WORKERS; GET405 | No replacement consumer needed; endpoint explicitly retired | DEPRECATE / DISCONNECT NOW |
| GR-APP-10 | `app/api/cron/round-scorecards-archive/route.js` + archive env | B | Gated external export/reconciliation | No replacement delivery needed; canonical snapshots retained | DEPRECATE / DISCONNECT NOW |
| GR-APP-11 | `app/api/cron/future-match-google-compatibility/route.js` → `lib/future-match-google-compatibility-worker.js` → `lib/production-future-google-writer-server.js` | A | Provisions future match Google rows from canonical manifest, exact destination generation/readback/fingerprint | Exact prepared PostgreSQL setup/context; no workbook destination | DEPRECATE / DISCONNECT NOW |
| GR-APP-12 | `lib/production-odds-calculation-server.js:208–281` `resolveProductionOddsRuntimeContext` | A | Future year calls DB `read_production_annual_google_destination_v1`; normalizer requires writerGenerationId + workbook + target fingerprint | Current tournament pointer + annual platform/runtime/generation tuple | DEPRECATE / DISCONNECT NOW |
| GR-APP-13 | `app/api/odds/publish/route.js:265–306` → `deliverSupabaseOddsGoogleMirror` | A | Canonical publication commits then awaited Google mirror; failure caught/participant publication retained. Else legacy Google publication branch exists. | Canonical owner-controlled Odds publication | DEPRECATE / DISCONNECT NOW |
| GR-APP-14 | `lib/championship-odds-google-mirror.js` | B | Claim → Sheets publish/readback → complete/fail DB mirror status | Canonical odds_published_snapshots; mirror already retired in073 | DEPRECATE / DISCONNECT NOW |
| GR-APP-15 | `app/api/odds/publication-operations/route.js` | C | Rehearsal compares workbook before/after; mirror retry operations | Canonical publication tests; no workbook readback requirement | DEPRECATE / DISCONNECT NOW |
| GR-APP-16 | `lib/production-director-console.js:153–178` `workerModel` | A | Global worker enabled requires every workercontrol enabled; pending sums outbox/archive nonterminal rows | Required internal worker health only; old Google jobs historical | DEPRECATE / DISCONNECT NOW |
| GR-APP-17 | `lib/scoring-authority.js` | A | Default google; Preview Supabase requires configured isolated workbook | Exact isolated/certified database authority, no workbook credential | DEPRECATE / DISCONNECT NOW |
| GR-APP-18 | `lib/tournament-read-source.js`, `my-match-read-source`, `home-read-source`, `game-center-read-source`, `scoring-read-source`, `match-authorization-source`, `leaderboards-core-read-source`, `net-skins-read-source`, `calcutta-read-source`, `competition-derived-read-source`, `intelligence-derived-read-source`, `draft-read-source`, `guide-read-source`, `prediction-settings-source`, `published-odds-read-source`, `odds-calculation-source`, `war-room-input-source`, history source selectors | A | Defaults/fallbacks Google and Preview eligibility workbook IDs, albeit Productioncutover branches canonical | Domain-specific current PostgreSQL read projections | DEPRECATE / DISCONNECT NOW |
| GR-APP-19 | `lib/participant-identity-authority.js:59–142` | A | Default Passport; Preview Supabase auth requires workbook ID, publicAuth + serverIdentity. Nonpreview local resolvesPassport | Supabase participant identity and canonical contacts/roles | DEPRECATE / DISCONNECT NOW |
| GR-APP-20 | `app/api/player-passport/initialize/route.js` | A | Supabase branch resolves identity + readMyMatchView; else `initializeParticipantTournament` → getTournamentData/readPlayerPassportMatches (Sheets) | Canonical Supabase participant initializer branch | DEPRECATE / DISCONNECT NOW |
| GR-APP-21 | `lib/participant-initialization.js`, `lib/player-passport-server.js` | A | Google Passport/TrustedDevices verification/retries/readiness; Preview impersonation mixes DB lease with Google director validation | Canonical identity and Director entitlement; legacy Passport optional features unproved | DEPRECATE / DISCONNECT NOW |
| GR-APP-22 | `app/api/player-passport/activation`, `/admin`, `/readiness`, `/notifications`; `/api/director/notifications/sandbox` | C | Legacy passport activation/device/readiness notification writes + Sheetslog | Canonical identity/PlayersAccess exists; optional notification parity NOT ESTABLISHED | DEPRECATE / DISCONNECT NOW |
| GR-APP-23 | `app/api/director/participant-identity/route.js` loadReview/import | D | Preview Google identityconfiguration → DB `importParticipantIdentityConfiguration`, approve/linkAuth | Canonical participant/roster APIs; preserve approved import provenance | PRESERVE MAINTENANCE-ONLY SOURCE; DISCONNECT HTTP/RUNTIME |
| GR-APP-24 | `app/api/director/scoring-authority/route.js:596–611,782–794,1070` | D | Explicit Preview import Google NetSkins config, Calcutta config/ownership, publishedOdds into DB; scoring rollback/readback/rehearsals | Canonical side-game/configuration/publication APIs; archive old HTTP import source | PRESERVE MAINTENANCE-ONLY SOURCE; DISCONNECT HTTP/RUNTIME |
| GR-APP-25 | `lib/production-director-projection-synchronization.js` and `/api/admin/production-director-synchronization` | F | Google Guide/Draft/PredictionSettings projection into DB | Guide/Draft/PredictionSettings protected canonical authoring | DEPRECATE / DISCONNECT NOW |
| GR-APP-26 | `lib/guide-sync-service.js` → `defaultGoogleRead` + `publishGuideProjection`; `/api/cron/guide-sync`, `/api/director/guide-content` | A | Preview automatic/scheduled GoogleGuide→DB projection | Canonical Guide authoring/current projection | DEPRECATE / DISCONNECT NOW |
| GR-APP-27 | `lib/draft-synchronization.js`, `app/api/admin/draft-projection`, predictionsettingssync | D | Googleauthoring→canonical projection, freshness comparison | Canonical Draft/PredictionSettings authoring/current revisions | PRESERVE MAINTENANCE-ONLY SOURCE; DISCONNECT HTTP/RUNTIME |
| GR-APP-28 | `app/api/admin/cms`, `/api/admin/tournament`; `google-sheets-write` CMS/metadata/adminreport | G | Legacy workbookplayers/teams/rosters/courses/matches/awards and presentationsettings/media; mutationpolicy blockscanonical fields underSupabase | Core canonical authoring exists; optional CMS media/site editing replacement UNKNOWN | OWNER CAPABILITY REVIEW |
| GR-APP-29 | `lib/production-maintenance-precommit-deployment-rebind.js:79–124` | A | Futuredeployment precommit gate demands Googlemirror/archive flags/secrets even Supabaseauthority | Canonical release manifest, pointer/generation/identity proof without Google flags | DEPRECATE / DISCONNECT NOW |
| GR-APP-30 | `lib/google-sheets-data.js`, `lib/google-sheets-server-read.js`, `lib/google-sheets-write.js`, `app/live/sheetData.js` | A | All realGoogletransports: docs.google.com/gviz, sheets.googleapis.com, oauth2.googleapis.com. OtherproductionGoogleDriveACL tools also separate maintenanceprovidercontrol | Runtime transport denied; retained historical import/source outside tournament runtime | DEPRECATE / DISCONNECT NOW |

## Exact SQL replacements

Migration125 is source-hash guarded. Every replacement uses one exact semantic anchor within its installed124 function. It never globally deletes Google strings. Historical migrations remain unchanged.

| ID | Current installed function | Before / after | Scope and proof |
|---|---|---|---|
| GR-SQL-01 | `public.submit_production_hole_score(jsonb)` | B → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-02 | `public.future_production_submit_hole_score_v1(jsonb)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-03 | `public.mutate_production_match_control(jsonb)` | B → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-04 | `public.future_production_mutate_match_control_v1(jsonb)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-05 | `public.finalize_production_match(jsonb)` | B → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-06 | `public.future_production_finalize_match_v1(jsonb)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-07 | `public.reopen_production_match(jsonb)` | B → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-08 | `public.future_production_reopen_match_v1(jsonb)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-09 | `scoring_authority.capture_finalized_scorecard_snapshot(text,text)` | B → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-10 | `scoring_authority.invalidate_finalized_scorecard_snapshot(text,bigint,text)` | B → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-11 | `public.mutate_production_future_year_administration_v1(jsonb)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-12 | `public.mutate_production_future_runtime_v2(jsonb)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-13 | `production_control.bind_pending_annual_jobs_v1()` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-14 | `public.read_production_scoring_authority(jsonb)` | B → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-15 | `public.future_production_read_scoring_authority_v1(jsonb)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-16 | `production_control.future_year_readiness_v1(text)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-17 | `production_control.future_runtime_readiness_before_identity_v1(text)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-18 | `production_control.assert_annual_scoring_runtime_pre_side_games_v1(jsonb,text,text)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-19 | `production_control.ensure_annual_side_game_runtime_v1(text,uuid,uuid,uuid,boolean)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-20 | `production_control.assert_future_scoring_runtime_capability_v1(text,uuid,uuid,uuid)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-21 | `public.activate_production_annual_scoring_transition_v1(jsonb)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-22 | `production_control.annual_scoring_predecessor_certificate_pre_side_games_v1(text)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-23 | `production_control.advance_annual_scoring_transition_v1(uuid,jsonb)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-24 | `production_control.close_annual_scoring_predecessor_pre_derived_workers_v1(jsonb,text)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-25 | `public.abort_production_annual_scoring_transition_v1(jsonb)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-26 | `production_control.annual_scoring_predecessor_certificate_pre_derived_workers_v1(text)` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |
| GR-SQL-27 | `production_control.annual_side_game_implementation_manifest_v1()` | A → F | Exact source hash in JSON; canonical body/ACL retained; scoped PostgreSQL proof in `evidence/google-retirement-sql.json` |

The new migration126 separately retires Google-only post-cutover release/context gates and disables obsolete delivery controls. It preserves exact canonical pointer/generation/platform/identity/manifest checks. Its release test must pass without fake Google target certificates; see `test/reliability-phase2c1-release-admission.integration.test.mjs` and the final evidence index for actual results.

## SQL retained state and callable boundaries

- Canonical `finalized_scorecard_snapshots`, score receipts, revision history and audit remain. Finalize/Reopen snapshot semantics remain; invalidation audit truthfully says `FINALIZED_SCORECARD_SNAPSHOT_INVALIDATED` instead of claiming external delivery was queued.
- Old Google outbox, archive jobs and checkpoints are retained byte-for-byte, including PENDING/RETRYABLE/BLOCKED/DELIVERED. They are historical delivery evidence, no longer unfinished canonical tournament work. No row is falsely marked DELIVERED or VERIFIED.
- Four automatic provider-binding triggers are removed; internal Competition, Net Skins, Calcutta and Odds generation triggers remain. Seven Google/archive annual dispatch operations are disabled; the immutable dispatch trigger is re-enabled in the same migration transaction.
-34 legacy Google/archive destination/claim/complete/fail service RPC grants are revoked. Actual installed125 source inspection finds0 service-role-callable direct INSERT/UPDATE/DELETE producers into retired provider job tables. Four retained direct producers exist only as postgres-owner historical functions. This is SOURCE/ACL evidence, supplemented by real score/control SQL tests; it is not an assurance against an administrator restoring obsolete grants later.
- Annual nullable destination columns retain old provenance; new canonical authority does not fabricate a writer generation or successful Google certificate. Canonical project/source import provenance is retained where identity/manifest contracts require it.

## History, Records and external evidence

| ID | Scope | Class | Replacement / limit |
|---|---|---|---|
| GR-HIST-01 | 2017–2025 completed History live fallback | F | Exact certified completed_history_current_revisions + immutable year facts |
| GR-HIST-02 | 2026 historical read provenance | F | Current canonical matches + finalized_scorecard_snapshots; source provenance from SQL |
| GR-HIST-03 | Records and player-history calculations | F | Canonical completed History + current Final2026 request-local record model |
| GR-HIST-04 | Historical import builders and origin metadata | D | Retain reconstruction/import source outside boot/worker/tournament automation |
| GR-HIST-05 | Original external historical sheets, reports and evidence | E | Canonical dataset equivalents must be inventoried before eventual external cleanup |
| GR-CONFIG-01 | External scheduler existence and cadence | G | Retired HTTP routes make delivery unavailable; later owner-authorized provider inventory |
| GR-OPTIONAL-01 | Legacy Passport readiness/notification logs | G | Canonical enrollment/auth replacement exists; messaging feature parity not established |

Real corrected2017–2025 canonical data exports were not found in the bounded local inventory. Synthetic service tests exercise every supported year and semantic cases; they do not prove deployed data completeness. `lib/historical-data.json` is preserved but not promoted to canonical authority: prior audit records stale2019/2020 scores and no complete scorecard/hole payloads. No external artifact is deleted.

## Credentials/configuration (names only)

`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL`, `PRODUCTION_GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_SPREADSHEET_ID`, `PREVIEW_SCORING_SHEET_ID`, `PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED`, `PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED`, `PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED`, `SCORING_GOOGLE_OUTBOX_WORKER_SECRET`, `ROUND_SCORECARDS_ARCHIVE_ENABLED`, `ROUND_SCORECARDS_ARCHIVE_WORKER_SECRET`, `GUIDE_SYNC_TOURNAMENT_ID`, `GUIDE_SYNC_WORKER_SECRET`, `PRODUCTION_STEP11_EXTERNAL_GOOGLE_WRITES_ENABLED`, `PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_REHEARSAL_ENABLED`, `PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_EXPECTED_COMMIT_SHA`, `PRODUCTION_STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ENABLED`, `PRODUCTION_STEP12_GOOGLE_WRITER_PROVIDER_FENCE_EXPECTED_COMMIT_SHA`

These are obsolete runtime configuration or retained historical-rehearsal names. No values were read for this audit and no deployed value is removed. Later credential revocation requires deployed zero-Google observation, closed rollback window and completed historical preservation. No Google SDK package exists to remove; the former transports use fetch/crypto.

## Test impact / safety

The candidate tests are `reliability-phase2c1-runtime`, `reliability-phase2c1-delivery-retirement`, `reliability-phase2c1-history`, `reliability-phase2c1-google-retirement-postgres.integration`, plus annual/release and affected Phase2C suites. Old tests demanding legacy Google default/fallback/delivery are reclassified by exact test identity, not counted as passes. SQL tests prove canonical snapshots/audit and financial authority isolation; injected History tests prove service/adaptor semantics, not actual historical copies. See the final certification for executed totals.

No Production/provider/Google access was used to create this register. External schedules and files remain owner-follow-up. All source-side removals must remain protected by zero-credential, zero-network, no-enqueue and actual full-sequence regression gates.

## Release-admission exact function appendix

Migration126 changes five runtime definitions (the temporary patch helper is not a sixth runtime function). Current-source protected release fixture passed2/2; complete annual CREATE remains independently blocked by P2C1-ANNUAL-001.

| ID | Exact function | Retired requirement | Preserved authority |
|---|---|---|---|
| GR-SQL-REL-01 | `production_control.postcutover_annual_release_context_v1()` | Google destination/worker/drain admission | Current canonical pointer/generation/platform/identity/release and actual manifest checks |
| GR-SQL-REL-02 | `production_control.authorize_production_postcutover_normal_release(jsonb)` | Google destination/worker/drain admission | Current canonical pointer/generation/platform/identity/release and actual manifest checks |
| GR-SQL-REL-03 | `production_control.authorize_production_postcutover_normal_release_frozen_2026_v1(jsonb)` | Google destination/worker/drain admission | Current canonical pointer/generation/platform/identity/release and actual manifest checks |
| GR-SQL-REL-04 | `production_control.rebind_production_postcutover_normal_release(jsonb)` | Google destination/worker/drain admission | Current canonical pointer/generation/platform/identity/release and actual manifest checks |
| GR-SQL-REL-05 | `production_control.rebind_production_postcutover_normal_release_frozen_2026_v1(jsonb)` | Google destination/worker/drain admission | Current canonical pointer/generation/platform/identity/release and actual manifest checks |

Public CSV transport is covered explicitly: `app/live/sheetData.js:getTournamentData` rejects before cache or gviz requests, independently of credential guards. Stored old provenance is retained. The candidate does not contain a supported runtime Google maintenance export; retained source requires a separately reviewed maintenance operation.
