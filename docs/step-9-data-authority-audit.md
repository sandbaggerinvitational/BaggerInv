# Step 9 — Data Authority and Google Dependency Audit

> **Supersession note — August 31, 2026:** Steps 13E.8A and 13E.8B moved
> Production Prediction Settings and Draft authoring to bounded Supabase-native
> Director workflows. Tournament Guide is now the sole remaining Production
> Google human-authoring domain. The evidence and conclusions below describe
> the historical Step 9 repository state and are intentionally not rewritten.

## Audit status

**BLOCKED — inventory and safe cleanup complete; a dual-authority defect and
permissive authority-token fallbacks require separately reviewed hardening.**

This report describes the architecture present at repository HEAD
`328525231d0675d87251d8c7ed13a6763675558c` on branch
`feature/mock-tournament-qa-integration`. The worktree was clean when the audit
was captured.

The baseline inventory is pinned to that clean HEAD. Step 9 then added narrow
source-isolation cleanup and tests; final deployed-environment evidence is
reported separately in the Step 9 handoff. Vercel environment values,
the source selected by a particular deployment, current Google/Supabase data,
network request counts, job state, and parity status cannot be proven from Git
alone. Where those facts matter, this report says **requires runtime
verification** rather than inferring a result.

No database records, Google workbooks, source flags, authority epochs, or
Production resources were changed. Application cleanup is limited to strict
source-token validation, a legacy `/api/live` boundary, invalid `/live` view
normalization, Net Skins fail-closed reads, environment documentation, and
tests. Production continues to resolve its approved legacy paths.

## Scope and method

The audit traced direct and indirect references to:

- Google workbook IDs and workbook isolation controls;
- `docs.google.com` GViz/CSV reads;
- Google Sheets v4 reads, writes, discovery, range, and batch operations;
- Google service-account OAuth;
- foreground public/PWA data loaders;
- Director authoring, synchronization, mirror, audit, and diagnostic paths;
- explicit Google/Supabase source gates;
- caches and stale/fallback behavior;
- `lib/historical-data.json`;
- Supabase migrations that retain Google provenance, mirror jobs, or authority
  controls.

The repository was searched by endpoint, symbol, import graph, and exact-name
reference. The classification is:

| Code | Meaning |
| --- | --- |
| A | Required Director authoring |
| B | Required synchronization or mirror |
| C | Required operational, audit, or diagnostic behavior |
| D | Required explicit rollback path |
| E | Required Production-legacy path until an approved Production cutover |
| F | Obsolete foreground application dependency |
| G | Unused or dead code |
| H | Unknown; requires investigation or deployed-runtime evidence |

One dependency may serve more than one legitimate role. The primary class and
any important secondary classes are shown below.

## Current architecture summary

The repository has one set of shared Google transports and many explicit
consumer source boundaries:

```text
Google workbook
  ├─ Director authoring and operational controls
  ├─ supported synchronization/import
  ├─ Supabase-authority reporting mirrors
  ├─ explicit Preview rollback adapters
  └─ Production-legacy readers

Supabase canonical/projection contracts
  ├─ current tournament and scoring reads
  ├─ Guide/current-course reads
  ├─ historical reads and secondary analytics
  ├─ published Odds and derived competition state
  ├─ participant/PWA reads
  └─ versioned Draft and prediction inputs
```

The main architectural risk is not the existence of Google code. It is using a
Google foreground loader outside its intended authoring, synchronization,
diagnostic, rollback, or Production-legacy boundary. The source modules
generally fail closed for an explicitly selected but incomplete Preview
Supabase configuration and hard-resolve Production to its existing Google
behavior.

Step 9 found two material exception families. First, several protected Director and legacy
Live Match Control mutations still write lifecycle, permission, pairing, and
match-configuration fields directly to Google even while Preview scoring
authority resolves to Supabase. Finalize/Reopen are authority-aware; the other
actions are not. Because this is a scoring-control behavior correction rather
than F/G dependency deletion, Step 9 documents it as a blocker instead of
silently changing scoring behavior. Second, `ODDS_CALCULATION_INPUT_SOURCE`,
`ODDS_PUBLICATION_AUTHORITY`, `SCORING_AUTHORITY`, and
`PARTICIPANT_IDENTITY_AUTHORITY` still normalize an unknown token—or, for the
Odds pair, an ineligible Preview Supabase request—to Google/Passport. They are
authority/operational selectors rather than ordinary read gates, but their
permissive behavior is another fail-closed hardening blocker.

## Direct Google transports and caches

| Primary class | File and functions | Dependency and behavior | Known callers |
| --- | --- | --- | --- |
| A/B/C/D/E | `lib/spreadsheet-environment.js`: `PRODUCTION_SPREADSHEET_ID`, `configuredSpreadsheetId()`, `assertPreviewSpreadsheetIsolation()`, `resolveSpreadsheetId()`, `assertLiveScoringWriteEnvironment()` | Defines the Production workbook ID, reads `GOOGLE_SHEETS_ID`, and protects Preview writes from the Production workbook. | All shared Google clients and most Preview source gates. |
| A/B/C/D/E | `lib/google-sheets-server-read.js`: `accessToken()`, `readNormalizedSheetValues()`, `readNormalizedSheetsValues()` | Service-account JWT with `spreadsheets.readonly`; Sheets v4 `values:batchGet`; ranges are `Sheet!A:ZZ`. Token caching, request deduplication, and per-sheet caching are built in. | `app/live/sheetData.js`; Director/live/Passport diagnostics; writer cache invalidation. |
| A/B/C/D/E | `lib/google-sheets-write.js`: `accessToken()`, `google()`, `readWorkbookMetadata()`, `readWorkbookSheetTitles()`, `readWorkbookSheetsByName()` | Service-account JWT with full Sheets scope; workbook discovery; individual and batch reads; batch updates/clears; verified writes and readbacks. | Director/admin/scoring/Passport/Guide/Odds/mirror services. |
| D/E/B | `lib/google-sheets-data.js`: `fetchSheet()`, `loadHistoricalDataFromSpreadsheet()` | Public GViz CSV reads from `docs.google.com`; historical, Draft, course, and scorecard adapters. | `lib/stats.js`, completed-history import, course/scorecard services, Draft Google adapter. |
| A/C/D/E/B | `app/live/sheetData.js`: `fetchSheet()`, `fetchOptionalSheetValues()`, `getTournamentData()` | The large Google tournament model. Preview uses authenticated batch reads; non-Preview uses public GViz. It reads 11 required and 19 optional tabs. | Google branches of `/live`, `/home`, homepage foundation, Guide, Game Center, participant initialization, Director diagnostics, and scoring reconciliation. |

Cache behavior that must remain visible during any later deletion decision:

- normalized Sheets reader: live 2.5 seconds, semi-static 60 seconds, static 300
  seconds, plus pending-read deduplication;
- `getTournamentData()`: 2.5-second model cache and up to 60-second last-good
  value only for a transient Google error;
- historical and scorecard GViz reads: 300-second Next cache with the
  `sbi-google-sheets` tag;
- Google Odds snapshot reader: 60-second process cache;
- legacy participant initialization: 15-second per-session process cache;
- write helpers invalidate the normalized, tournament, and Odds caches for
  affected sheets.

## A — Required Director authoring

These paths represent real Google-managed authoring or Director control and are
not removal candidates merely because participant reads have moved to
Supabase.

| Files/functions | Google-owned responsibility | Consumers |
| --- | --- | --- |
| `lib/google-sheets-write.js`: `readTournamentAdminData()`, `updateTournamentAdminData()` | Tournament configuration authoring. | `app/api/admin/tournament/route.js`, Director operations. |
| `lib/google-sheets-write.js`: `readTournamentGuideAdminData()`, `saveTournamentGuideRecord()`, `deleteTournamentGuideRecord()` | Guide, schedule, rules, dining, local guide, and contacts authoring. | `app/api/tournament-guide/route.js`, Guide editor. |
| `lib/google-sheets-write.js`: `readCmsResource()`, `saveCmsRecord()`, `archiveCmsRecord()`, `deleteCmsRecord()`, `reorderCmsRecord()` | Generic CMS-managed workbook content. | `app/api/admin/cms/route.js`. |
| `lib/google-sheets-write.js`: Director match, pairing, tee, Net Skins, Calcutta, access, Finalize, and Reopen operations | Director competition controls when the selected authority delegates to Google, or the Google half of a supported lifecycle operation. | `app/api/director/route.js`, `app/api/live-matches/route.js`, protected admin UI. |
| `lib/google-sheets-write.js`: Passport activation/admin/device/readiness functions | Legacy Google Passport administration and its explicit rollback/Production path. | `app/api/player-passport/**`. |
| `lib/google-sheets-write.js`: Odds publication helpers | Google-authority publication of the four reporting tabs. | `app/api/odds/publish/route.js`. |
| `lib/google-sheets-data.js`: `loadDraftSheets()` | Google-authored Draft Settings and Draft Picks for the Google read path. | `lib/draft.js`. |

## B — Required synchronization and mirror

| Files/functions | Direction | Purpose |
| --- | --- | --- |
| `lib/guide-sync-service.js` | Google → Supabase | Reads the approved Guide tabs, validates them, and creates/version-selects the shared Guide projection. |
| `lib/completed-history-supabase.js` and `lib/google-sheets-data.js:loadCanonicalCompletedHistoryFoundationData()` | frozen Production Google archive → Supabase | Imports the 2017–2025 historical foundation from ten historical tabs plus Round Scorecards and Course Holes. It is fail-closed and does not use the bundled JSON as import authority. |
| `lib/player-public-profile-projection.js` | Google Players → Supabase | Projects Google-managed player editorial/profile attributes into the shared secondary-history contract. |
| `lib/draft-synchronization.js` | Google Draft Settings/Picks → Supabase | Builds, fingerprints, imports, reads back, and parity-checks the versioned Draft projection. |
| `lib/scoring-google-outbox.js` | Supabase → Google | Delivers supported scoring mutations and lifecycle mirrors with classification and verification. |
| `lib/scorecard-archive-worker.js` | Supabase scoring lifecycle → Google archive | Upserts or invalidates Round Scorecards archive rows and verifies readback. |
| `lib/championship-odds-google-mirror.js` | Supabase Odds publication → Google | Mirrors the immutable publication to Odds Control, Odds Snapshots, Odds Team Results, and Odds Player Results. |
| `lib/google-sheets-write.js:synchronizeNetSkinsResults()` and Calcutta publication helpers | shared application result → Google reporting tabs | Maintains required Google reporting artifacts under the supported contract. |
| `app/api/odds/prediction-settings/route.js` | Google Prediction Settings → Supabase projection | Narrow authoring-source read and projection readiness path; it does not require the broad 17-tab prediction loader. |

The corresponding Supabase SQL migrations store provenance, authority state,
mirror jobs, and protected RPCs. They do not make network requests to Google and
must not be classified as foreground Google dependencies. Relevant migration
families include scoring outbox, Guide synchronization, Odds mirror,
completed/secondary history, and Draft projection migrations.

## C — Required operational, audit, and diagnostic behavior

| Paths | Purpose |
| --- | --- |
| `app/api/director/scoring-authority/route.js` | Authority/epoch, reconciliation, checkpoint, parity, and protected repair diagnostics. |
| `app/api/director/scoring-shadow/**` | Shadow comparison, benchmark, and dry-run evidence. |
| `app/api/director/reset-preview/route.js` | Isolated Preview reset and cache invalidation. |
| `app/api/director/route.js` | Director readiness and workbook-operation diagnostics. |
| `app/api/cron/guide-sync/**` | Protected Guide synchronization and staleness diagnostics. |
| `app/api/director/completed-history/route.js` | Source validation, import, year parity, shadow parity, and historical certification. |
| `app/api/admin/war-room-input-parity/route.js` | Protected Google/Supabase War Room input comparison. |
| `app/api/preview-reliability/route.js` | Explicit Google legacy-path reliability diagnostics. |
| `app/data-health/page.js` | Operator diagnostics and direct “Open workbook” link; the link does not itself read data. |

These operations may intentionally contact Google even when ordinary
participant reads are Supabase-backed. Zero-Google acceptance criteria should
be scoped to the foreground consumer request, not to these protected
operations.

## D — Required explicit rollback paths

The following shared adapters are still selected by an explicit Google source
value and therefore form the reversible rollback boundary:

| Google adapter/path | Source boundary |
| --- | --- |
| `app/live/sheetData.js:getTournamentData()` and `/api/live` | `TOURNAMENT_READ_SOURCE`, `TOURNAMENT_FOUNDATION_READ_SOURCE`, `HOMEPAGE_CURRENT_READ_SOURCE`, `HOME_READ_SOURCE`, and legacy leaderboards secondary reads. |
| `app/game-center/gameCenterData.js` Google branch | `GAME_CENTER_READ_SOURCE`. |
| `lib/scoring-read-service.js` Google reader | `SCORING_READ_SOURCE`. |
| `lib/participant-initialization.js` and Google Passport APIs | `PARTICIPANT_IDENTITY_AUTHORITY`, `MY_MATCH_READ_SOURCE`, and `MATCH_AUTHORIZATION_SOURCE`. |
| `app/tournament-guide/resolveGuideContentGoogle.js` | `GUIDE_READ_SOURCE` and `COURSE_PRESENTATION_READ_SOURCE`. |
| `lib/stats.js` and the historical Google loaders | `HISTORY_2026_READ_SOURCE`, `COMPLETED_HISTORY_READ_SOURCE`, and `SECONDARY_HISTORY_READ_SOURCE`. |
| archived course/scorecard Google adapters | `HISTORICAL_COURSE_READ_SOURCE`. |
| `app/odds-center/page.js` and Insights Google adapters | `PUBLISHED_ODDS_READ_SOURCE`. |
| `lib/prediction-data.js` and `lib/war-room-input-google.js` | `ODDS_CALCULATION_INPUT_SOURCE` and `WAR_ROOM_INPUT_SOURCE`. |
| `lib/draft.js` Google adapter | `DRAFT_READ_SOURCE`. |

Rollback code should be removed only after an explicit rollback-retirement
decision. A successful Preview Supabase read does not itself authorize that
removal.

## E — Required Production-legacy paths until cutover

Repository source gates generally protect Production by resolving an attempted
Supabase selection back to Google or Passport/application behavior. The
following therefore remain Production dependencies until a separately
authorized Production transition:

- current tournament, homepage, `/live`, Game Center, scoring, and participant
  identity Google branches;
- Guide and current-course Google presentation branches;
- completed, 2026, secondary, and course-history Google branches;
- Published Odds, calculation-input, War Room, Prediction Settings, and Draft
  Google branches;
- `app/sitemap.js`, which intentionally avoids isolated Preview data and loads
  the established Google history plus Draft year enumeration outside Preview;
- Director/admin authoring routes.

This is a static statement about code behavior. The actual Production
environment configuration was not inspected or changed.

## F — Obsolete foreground application dependencies

The audit proved two narrowly removable reachability defects:

1. `/api/live` could invoke the 30-range Google tournament loader even when all
   of its migrated consumers selected Supabase. It now returns an explicit 409
   with `/api/tournament/live` as the canonical endpoint and zero fallback when
   Tournament, core Leaderboards, and Net Skins all resolve Supabase. It remains
   available when any of those independent consumers explicitly selects its
   Google rollback path.
2. Unknown `/live?view=...` tokens could fall through to the Google dashboard
   while the tournament source was Supabase. They now normalize before data
   loading only in Supabase mode. Production/Google legacy `matchups`, `scores`,
   and `points` focused views remain intact; Supabase `scores`/`points` map to
   the shared Leaderboards presentation.

The participant Home and `/live` Net Skins gates also now use their strict
`require*` boundary instead of reading a permissive environment state directly.

Every runtime Google foreground path found is at least one of:

- behind an explicit Google/Supabase source gate;
- the Production-protected legacy branch;
- still used for Director authoring, synchronization, mirror, or diagnostics;
- conditionally used based on another source gate; or
- dependent on deployed environment values that were not available to this
  audit.

The following must not yet be removed as category F:

- `/api/live` implementation — retained as an explicit Google rollback and
  Production-legacy endpoint, but not reachable as a Supabase fallback;
- `getTournamentData()` — still used by rollback, Production, Director,
  reconciliation, Guide Google, and legacy participant paths;
- `refreshHistoricalData()` — still used by rollback/Production, homepage
  historical presentation, admin, sitemap, and calculation diagnostics;
- `lib/historical-data.json` — still an active initial/failure fallback.

## G — Unused or dead code candidates

Exact-name and import-graph searches identify the following isolated candidates.
They were conservatively retained because repository search cannot prove that
external operator scripts do not import shared exports. Step 9 marks them
deprecated instead of deleting shared compatibility APIs.

| Candidate | Evidence | Removal caveat |
| --- | --- | --- |
| `lib/google-sheets-data.js:loadTournamentGuideSheets()` and its `GUIDE_SHEETS`-only subgraph | No `app`, `lib`, or `scripts` caller. Only tests reference the symbol. The runtime Google Guide adapter uses `getTournamentData()`. | Update the source-presence tests that intentionally mention the symbol. |
| `lib/google-sheets-write.js:initializeLiveScoringTestSchema()` | Exact repository search finds the declaration only. | Confirm no out-of-repository operator script imports it. |
| `lib/google-sheets-write.js:authenticateLiveMatchCode()` | Exact repository search finds the declaration only. Active routes use `authenticateParticipantMatch()`, Passport authorization, or Supabase authorization. | Confirm no out-of-repository operator script imports it. |
| `lib/prediction-settings-source.js` | Neither exported function has an application/library/script caller; references are confined to its compatibility test. Runtime settings use the shared Odds configuration projection. | Retained and marked deprecated for external/operator compatibility; `PREDICTION_SETTINGS_READ_SOURCE` is removed from the active environment template. |

Other apparently unimported exports were checked for internal callers. For
example, `normalizedSheetCategory()`, `ensureOddsTabs()`,
`synchronizeNetSkinsResults()`, participant identity inspection,
`publishOfficialCalcutta()`, and `validateLiveMatchFinalResult()` are used
internally and are not category G.

## H — Unknown or requiring runtime investigation

| Question | Why Git is insufficient | Required evidence |
| --- | --- | --- |
| Which source is active on a particular Preview deployment? | Vercel values are not committed. | Protected source diagnostics and deployment metadata. |
| Does `/` still need its unconditional historical refresh? | Yes for the intentionally non-migrated homepage archive cards. Step 3B.2 migrated current-tournament state only and expressly left historical homepage content on Google. | Retain as D/E until that historical homepage consumer is separately authorized for cutover. |
| Does Supabase Leaderboards still call `/api/live`? | Only when `NET_SKINS_READ_SOURCE=google`; that is an explicit mixed-source rollback, not a fallback. | Read the deployed Net Skins gate and capture network requests. |
| Are all authority/configuration tokens fail-closed? | No. The Odds calculation/publication selector, scoring authority, and participant identity authority still have permissive invalid/ineligible normalization. | Add strict Preview validation in a separately reviewed authority-control step while retaining Production hard resolution. |
| Are legacy Passport activation and initialization still required outside rollback/Production? | The routes remain callable, but current deployed identity authority is unknown. | Protected identity authority diagnostics and route-use telemetry. |
| Are the deprecated exported helpers used by external scripts? | The repository has no runtime references, but external REPL/operator usage is not discoverable in Git. | Operator confirmation before deletion. |
| Can Director Google-only match controls remain active under Supabase scoring authority? | No synchronization path moves those Google mutations back into canonical Supabase matches/permissions. | Add authority-aware RPCs or fail closed before Google access in a separately authorized scoring-control hardening step. |
| Are Google caches serving any ordinary migrated request? | Cache code is shared and source selection is runtime-dependent. | Request-scoped Google diagnostics on final deployed hostnames. |

## Public and PWA route matrix

“Supabase-capable” below means the repository contains an eligible Preview
branch. It does not claim that the branch is selected on a deployed hostname.

| Surface | Current source boundary in code | Supabase contract | Remaining Google behavior | Class |
| --- | --- | --- | --- | --- |
| `/` | `HOMEPAGE_CURRENT_READ_SOURCE` | shared tournament foundation + live tournament view | Google current-tournament rollback; intentionally non-migrated homepage archive cards still use `refreshHistoricalData()` | D/E |
| `/live` tournament | `TOURNAMENT_READ_SOURCE` | shared tournament live view | `getTournamentData()` in Google mode | D/E |
| `/live` leaderboards | `LEADERBOARDS_CORE_READ_SOURCE`, `NET_SKINS_READ_SOURCE`, `CALCUTTA_READ_SOURCE` | shared core leaderboard and derived-state views | `/api/live` remains a secondary endpoint when Net Skins is Google | D/E/H |
| `/odds-center` | `PUBLISHED_ODDS_READ_SOURCE` | published Odds snapshot/read RPC | prediction workbook + Odds Snapshots Google adapter in Google mode | D/E |
| `/tournament-guide`, section routes | `GUIDE_READ_SOURCE` | versioned Guide projection | `resolveGuideContentGoogle.js` rollback/Production adapter; Google remains authoring source | A/B/D/E |
| `/courses` current and current course profiles | `COURSE_PRESENTATION_READ_SOURCE` | Guide current-course projection | Guide Google adapter in Google mode | A/B/D/E |
| `/courses?view=archive`, archive profiles and hole analytics | `HISTORICAL_COURSE_READ_SOURCE` | completed history + 2026 shared course model | archived Courses/Course Holes/scorecard Google adapter | D/E |
| `/history` | `COMPLETED_HISTORY_READ_SOURCE` plus `HISTORY_2026_READ_SOURCE` | completed-years view + 2026 historical view | Google history for whichever year group is not Supabase-selected | D/E |
| `/history/[year]`, round, team | year-specific completed/2026 source gates | scoped shared historical views | scoped Google history/scorecard adapters | D/E |
| `/champions`, `/champions/[year]` | completed-history source gate | completed historical contract | legacy stats model in Google mode | D/E |
| `/players`, profiles, `/records`, `/statistics/**`, `/ratings`, `/compare`, `/board-of-governors` | `SECONDARY_HISTORY_READ_SOURCE` | request-local shared secondary-history model | `refreshHistoricalData()` + legacy stats in Google mode | D/E |
| `/draft`, Draft analytics | `DRAFT_READ_SOURCE` | versioned Draft projection | Draft Settings/Picks Google adapter | A/B/D/E |
| `/war-room` and optimizer/intelligence consumers | `WAR_ROOM_INPUT_SOURCE` and derived source gates | canonical prediction-input bundle and Supabase-derived projections where selected | broad Google prediction/historical adapter for rollback, Production, and parity diagnostics | C/D/E |
| `/home` PWA | `HOME_READ_SOURCE`, identity and Net Skins gates | participant home/My Match/shared tournament contracts | `getTournamentData()` + Passport initialization in Google/Passport mode | D/E |
| `/my-match` and participant APIs | `MY_MATCH_READ_SOURCE`, `PARTICIPANT_IDENTITY_AUTHORITY` | participant identity + My Match views | Passport initialization and workbook reads in legacy mode | D/E |
| `/game-center/[matchId]` | `GAME_CENTER_READ_SOURCE`, Guide course gate | Game Center view + course projection | tournament loader + live score sheet reader in Google mode | D/E |
| `/score/access/[token]`, scoring APIs | `MATCH_AUTHORIZATION_SOURCE`, `SCORING_READ_SOURCE`, `SCORING_AUTHORITY` | Supabase authorization/read/write contracts when selected | Google match access, scoring reads/writes, and Passport paths | A/B/D/E |
| installed PWA Guide/Odds/leaderboards/home surfaces | same server APIs and shared adapters as above | no separate datastore model | same explicit Google rollback/Production paths; no PWA-specific Google client was found | D/E |

## Environment and source-variable matrix

All Supabase selections below also depend on the relevant approved Preview
project and credentials. Most current/scoring gates additionally require an
isolated Preview workbook. “Production behavior” describes source code, not a
runtime observation.

| Variable(s) | Concern | Default/alternate | Preview behavior | Production behavior in code |
| --- | --- | --- | --- | --- |
| `VERCEL_ENV` | deployment guard | platform value | only `preview` can satisfy Preview Supabase gates | Supabase requests are generally hard-blocked/resolved to legacy source |
| `GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_SPREADSHEET_ID` | configured workbook | configured ID; shared fallback is Production ID | must identify an isolated workbook for most mutable Preview gates | supports established Production workbook path |
| `PREVIEW_SCORING_SHEET_ID` | isolated workbook assertion | unset unless configured | must match the configured Preview workbook where required | not a Production authority selector |
| `SUPABASE_SCORING_MIRROR_URL`, `SUPABASE_SCORING_MIRROR_SECRET_KEY` | server Supabase access | unset means ineligible | required by shared Preview data services | do not independently enable Production Supabase authority |
| `TOURNAMENT_READ_SOURCE` | `/live` current tournament | `google` / `supabase` | eligible Supabase or explicit Google | Google-protected |
| `TOURNAMENT_FOUNDATION_READ_SOURCE` | shared current foundation | inherits tournament selection unless set | eligible Supabase or explicit Google | Google-protected |
| `HOMEPAGE_CURRENT_READ_SOURCE` | `/` current tournament | inherits `TOURNAMENT_READ_SOURCE` | eligible Supabase or explicit Google | Google-protected |
| `HOME_READ_SOURCE` | participant PWA home | `google` / `supabase` | eligible Supabase or explicit Google | Google-protected |
| `GAME_CENTER_READ_SOURCE` | Game Center | `google` / `supabase` | eligible Supabase or explicit Google | Google-protected |
| `SCORING_READ_SOURCE` | scoring reads | `google` / `supabase` | eligible Supabase or explicit Google | Google-protected |
| `SCORING_AUTHORITY` | canonical scoring writes | `google` / `supabase` | Supabase only with Preview/workbook/credentials | Google-protected; no audit-time change |
| `MATCH_AUTHORIZATION_SOURCE` | score-entry authorization | `google` / `supabase` | eligible Supabase or explicit Google | Google-protected |
| `PARTICIPANT_IDENTITY_AUTHORITY` | participant identity | `passport` / `supabase` | Supabase requires public auth and server config; otherwise Passport | Passport-protected |
| `MY_MATCH_READ_SOURCE` | participant match view | `google` / `supabase` | eligible Supabase or explicit Google | Google-protected |
| `LEADERBOARDS_CORE_READ_SOURCE` | core leaderboards | `google` / `supabase` | eligible Supabase or legacy dashboard | Google-protected |
| `NET_SKINS_READ_SOURCE`, `CALCUTTA_READ_SOURCE` | derived competition modules | `google` / `supabase` | eligible Supabase or Google/application presentation | Google-protected |
| `MOMENTUM_READ_SOURCE`, `STORYLINES_READ_SOURCE` | competition-derived presentation | `application` / `supabase` | eligible Supabase or application calculation | application-protected |
| `TOURNAMENT_INTELLIGENCE_READ_SOURCE`, `PROJECTION_EDITORIAL_READ_SOURCE`, `FINAL_RECAP_READ_SOURCE` | intelligence-derived presentation | `application` / `supabase` | eligible Supabase or application calculation | application-protected |
| `GUIDE_READ_SOURCE`, `COURSE_PRESENTATION_READ_SOURCE` | Guide/current course reads | `google` / `supabase` | versioned projection when eligible | Google-protected |
| `GUIDE_AUTO_SYNC_ENABLED`, `GUIDE_SYNC_WORKER_SECRET`, `GUIDE_SYNC_TOURNAMENT_ID` | Guide synchronization | operational controls, not public authority | authorizes protected sync only | does not change read authority by itself |
| `HISTORY_2026_READ_SOURCE` | 2026 history | `google` / `supabase` | requires Preview historical/scoring prerequisites | Google-protected |
| `COMPLETED_HISTORY_READ_SOURCE` | 2017–2025 history | `google` / `supabase` | approved Preview project/credentials | Google-protected |
| `SECONDARY_HISTORY_READ_SOURCE` | players/stats/records/ratings | `google` / `supabase` | approved Preview project/credentials | Google-protected |
| `HISTORICAL_COURSE_READ_SOURCE` | archive courses/hole analytics | `google` / `supabase` | approved Preview project/credentials | Google-protected |
| `PUBLISHED_ODDS_READ_SOURCE` | participant published Odds | `google` / `supabase` | eligible published-snapshot RPC | Google-protected |
| `ODDS_PUBLICATION_AUTHORITY` | official publication write | `google` / `supabase` | independently eligible in Preview | Google-protected |
| `ODDS_CALCULATION_INPUT_SOURCE` | Monte Carlo input source | `google` / `supabase` | independently eligible in Preview | Google-protected |
| Step 7B settings projection (no active standalone read flag) | Prediction Settings projection/read | targeted Google synchronization into shared Odds input configuration | runtime consumers read the certified Supabase projection | deprecated standalone compatibility module only |
| `WAR_ROOM_INPUT_SOURCE` | War Room input bundle | `google` / `supabase` | explicit selection; Supabase path also pins certified settings fingerprints | forced Google in Production |
| `WAR_ROOM_PREDICTION_SETTINGS_SOURCE_FINGERPRINT`, `WAR_ROOM_PREDICTION_SETTINGS_EFFECTIVE_FINGERPRINT` | Supabase War Room certification pins | required SHA-256 values | fail closed if absent/invalid | not a Production cutover control |
| `DRAFT_READ_SOURCE` | Draft public reads | `google` / `supabase` | eligible versioned projection or explicit Google | Google-protected |

The repository also contains rehearsal/shadow flags for participant identity and
other protected operations. Those enable evidence gathering and do not by
themselves change canonical authority.

## Final recommended authority matrix

This matrix distinguishes application authority from the operator interface.
Google can remain the authoring UI or reporting mirror while Supabase is the
canonical application read model.

| Dataset | Current repository roles | Recommended final authority | Google role that remains | Migration/removal status |
| --- | --- | --- | --- | --- |
| Guide, schedule, rules, dining, local guide, contacts | Google authoring; versioned Supabase projection; source-gated reads | **Google authoring + Supabase mirror/read** | Director authoring and supported sync source | Keep A/B; retire only direct public reads after Production cutover |
| current course presentation | Guide projection plus canonical tournament context | **Supabase application projection** | authoring via Guide sync | Keep A/B; Google presentation adapter remains D/E |
| tournament foundation, teams, roster, rounds | shared Supabase model plus Google legacy adapter | **Supabase canonical application datastore** | Director-config synchronization/reporting as explicitly supported | Google foreground adapter remains D/E until Production cutover |
| live scoring and match lifecycle | Supabase authority architecture plus Google-authority and mirror paths | **Supabase canonical scoring authority** | reporting mirror and explicit rollback/legacy path | Never remove B/C; retire D/E only after authority and rollback retirement |
| scorecards and hole results | canonical current/finalized Supabase facts plus archive worker | **Supabase canonical authority** | verified Round Scorecards archive/mirror and import provenance | Keep B archive worker; legacy direct readers remain D/E |
| participant identity | Supabase Auth/identity architecture plus Google Passport | **Supabase identity authority** | explicit rollback/Production legacy until cutover | Passport code remains D/E, not G |
| 2026 history | derived from canonical current tournament/scoring facts | **Supabase historical/current projection** | no foreground role after cutover; diagnostic provenance only | Google adapter D/E until Production cutover |
| 2017–2025 completed history | frozen Google source imported into canonical Supabase history | **Supabase certified immutable history** | source evidence and explicit correction import only | Keep B/C import path; retire foreground Google reads after Production cutover |
| awards/honors | certified tournament-scoped historical facts | **Supabase canonical historical fact** | Director source/correction provenance where retained | No independent Google application authority |
| handicaps and applied strokes | historical/current inputs plus frozen match facts | **Supabase canonical/frozen match facts; Google authoring only for retained mutable inputs** | targeted Director authoring/synchronization | Mutable authoring must never rewrite finalized match facts |
| players, profiles, records, statistics, ratings, comparisons | request-local derived model from shared history, with Google legacy calculation path | **Derived from Supabase canonical history** | player editorial authoring/projection where applicable; rollback legacy | Do not persist duplicate statistics as authority |
| historical courses and hole analytics | shared completed/2026 history contract plus Google scorecard fallback | **Derived from Supabase canonical history and scorecard facts** | correction/import provenance | Google foreground adapter D/E until Production cutover |
| published Odds | immutable Supabase published snapshots plus Google publication/mirror options | **Supabase immutable publication/read authority** | Google reporting mirror; Google publication only while explicitly retained | Keep mirror B; source-gated publication decision remains separate |
| Prediction Settings | Google-managed settings and Supabase projection | **Google authoring + Supabase mirror/read** | Director-friendly authoring source | Keep narrow B path; broad foreground loader can retire after all consumers cut over |
| Monte Carlo engine output | application calculation, then immutable publication | **Derived calculation; official artifact in Supabase** | reporting mirror only | Do not store a competing Google-calculated value |
| Draft Settings/Picks | Google authoring, versioned Supabase projection | **Google authoring + Supabase mirror/read** | Director authoring and supported sync | Keep A/B; Google public adapter D/E until Production cutover |
| Net Skins, Calcutta, momentum, storylines, intelligence | canonical facts plus application/Supabase derived projections | **Derived from Supabase canonical competition facts** | authoring/configuration or reporting mirror only where explicitly required | Avoid independent foreground workbook calculations |
| audit/log data | Supabase scoring/publication/import audit plus Google reporting logs | **Authority-local audit, with Supabase canonical application audit** | operational diagnostics/reporting only | Never use an audit mirror as factual application authority |
| CMS/editorial content not represented by shared canonical data | Google/CMS authoring paths | **Google authoring + projected application read where required** | Director authoring | Decide per dataset; do not create website-specific parallel tables |
| ordinary static copy/assets | source-controlled application files | **Static application content** | none | Keep in code/files |

## Remaining Google dependencies versus removal candidates

### Must remain now

1. Director authoring operations in category A.
2. Supported synchronization, import, archive, and mirror workers in category B.
3. Protected authority, parity, readiness, and failure diagnostics in category C.
4. Explicit Google rollback adapters in category D until rollback retirement is
   separately authorized.
5. Production-legacy paths in category E until each Production source is
   independently cut over and certified.
6. Workbook IDs embedded in Supabase checks/provenance where they enforce
   Preview isolation or historical source identity.

### Category G disposition

The candidates listed above are unreachable in repository runtime code, but
shared exports may be used by out-of-repository operator scripts. Step 9 keeps
them as deprecated compatibility shims. Physical deletion requires operator
confirmation and should include exact import/search verification, targeted
tests, the complete suite, `git diff --check`, and the Production build.

### Conditional later removals

After an approved Production cutover and explicit rollback-retirement decision,
the following may be re-audited rather than automatically deleted:

- Google branches of public `/live`, homepage, Game Center, Guide, History,
  secondary-history, historical-course, Odds, Draft, and War Room readers;
- `/api/live` only after all internal clients and secondary endpoints stop using
  it;
- Google Passport foreground initialization only after participant identity
  Production cutover and rollback retirement;
- the broad prediction workbook loader only after every calculation,
  diagnostic, and rollback consumer has a scoped replacement;
- legacy `lib/stats.js` process-global Google state only after sitemap, admin,
  homepage history, rollback, and diagnostic consumers are migrated or retired.

## Duplicate-authority audit

The intended authority patterns are sound for public reads, scoring ingress,
Finalize/Reopen, Guide/Draft/Prediction Settings synchronization, scoring
outbox delivery, scorecard archival, and Odds mirroring. No ordinary public
route accepts independent writes to both stores.

One protected Director control family is not yet authority-safe:

- `/api/director`: `automation-check`, `set-live`, `open-round`,
  `unlock-scoring`, `lock-scoring`, `close-round`, `match-unlock-scoring`,
  `match-lock-scoring`, `match-mark-live`, `match-management`,
  `round-pairings`, and `course-tees` read or write Google directly;
- `/api/live-matches`: `update`, `mark-live`, `pairing`, `access-generate`, and
  `access-disable` write Google directly;
- only Finalize/Reopen delegate through `persistDirectorMatchLifecycle()` to
  the active Supabase scoring authority and then mirror through the outbox.

When `SCORING_AUTHORITY=supabase`, no Google→Supabase reconciliation exists for
the unsupported mutation family. These endpoints are protected/admin rather
than public foreground traffic, but they can create divergent match lifecycle,
permission, or configuration state. This is the primary Step 9 blocker.

Safe remediation is either (a) provide authority-aware Supabase operations for
the affected actions, or (b) fail closed before any Google read/write whenever
Supabase authority is active, while leaving Google/Production behavior intact.
Step 9 does not silently choose between those product behaviors.

The authority-token fallbacks described in the H inventory are also unresolved.
They were not altered here because doing so changes mutation/identity authority
failure behavior rather than deleting an F/G foreground dependency. Step 10
must not assume invalid configuration is fail-closed until that hardening is
implemented and tested.

## Fallback and cleanup audit

The final static search found no `catch → Google`, `missing → Google`, or
`stale → Google` branch on selected Supabase public read services. Explicit
source selection remains their only rollback mechanism. The known last-good
Google tournament cache and bundled-history fallback are confined to
Google/legacy paths. Authority/configuration selectors are a documented
exception: the Odds calculation/publication pair, scoring authority, and
participant identity authority still need separate fail-closed hardening.

Cleanup performed:

- all migrated public read gates modified in Step 9 reject unknown tokens as
  `invalid-source` instead of silently resolving Google/application;
- `/api/live` is explicitly unavailable when all three of its independent
  consumers select Supabase and identifies `/api/tournament/live` as its
  canonical current-tournament replacement;
- unsupported `/live` views redirect before Google loading in Supabase mode,
  while Google/Production focused-view compatibility is preserved;
- Home and Live Net Skins reads use their strict `require*` source boundary;
- `.env.example` now inventories active source/authority boundaries and no
  longer advertises the unused standalone Prediction Settings source flag;
- unused shared exports are marked deprecated but retained until external
  operator compatibility is confirmed.

No cache implementation was deleted. Google caches remain necessary for A–E
paths. Migrated Supabase paths do not populate the mutable `lib/stats.js`
history model; the intentional homepage archive-card branch remains a legacy
consumer until separately migrated.

## `lib/historical-data.json` decision

### Current facts

The file is approximately 232 KB and contains:

- 41 players;
- 10 tournaments;
- 20 team-name rows;
- 224 matches;
- 3 round rows;
- 30 tournament-rule rows;
- 9 awards;
- 30 courses;
- 224 handicap rows;
- no Ghost Match rows.

It is imported by `lib/google-sheets-data.js` and `lib/stats.js`. It initializes
the process-level legacy history model, is restored when the general Google
history refresh fails, and supplies legacy scorecard context when that history
load fails. Repository comments explicitly warn that bundled 2019/2020 point
populations are stale and prevent this file from becoming the completed-history
import authority.

### Decision

**Keep temporarily, but formally demote it to a source-controlled emergency
fallback. It is not canonical and must not feed canonical Supabase imports.**

Required constraints:

1. Do not manually update it as a third authority.
2. Do not use it to overwrite certified Google or Supabase historical facts.
3. Preserve source diagnostics (`bundled-initial` / `bundled-fallback`) so its
   use is observable.
4. Keep completed-history import fail-closed on the authoritative source rather
   than falling back to this file.
5. After Production historical reads and all legacy consumers stabilize,
   choose one explicit end state:
   - generate a versioned emergency artifact from certified canonical history;
     or
   - remove the file and its fallback after rollback retirement.

Until then it is category D/E with an H follow-up, not category F or G.

## Runtime reference appendix

This appendix accounts for every non-test application/library file returned by
the repository-wide Google/Sheets/GViz/legacy-loader pattern search. Shared
transport details and ranges are defined in the earlier transport tables.

- **A — Director authoring UI/API:** `app/admin/CmsManager.js`,
  `app/admin/TournamentEditor.js`, `app/admin/page.js`,
  `app/admin/tournament-guide/GuideEditor.js`, `app/api/admin/cms/route.js`,
  `app/api/admin/tournament/route.js`, `app/api/live-matches/route.js`,
  `lib/workbook-protection.js`.
- **B — synchronization/mirror:** `app/api/cron/guide-sync/diagnostics/route.js`,
  `app/api/odds/prediction-settings/route.js`, `app/api/odds/publish/route.js`,
  `app/api/odds/publication-operations/route.js`, `lib/draft-synchronization.js`,
  `lib/guide-sync-service.js`, `lib/player-public-profile-projection.js`,
  `lib/scorecard-archive-worker.js`, `lib/scoring-google-outbox.js`.
- **C — protected operational/diagnostic:**
  `app/api/director/participant-identity/route.js`,
  `app/api/director/reset-preview/route.js`, `app/api/director/route.js`,
  `app/api/director/scoring-authority/route.js`,
  `app/api/director/scoring-shadow/benchmark/route.js`,
  `app/api/director/scoring-shadow/phase2-dry-run/route.js`,
  `app/api/director/scoring-shadow/route.js`, `app/api/odds/inputs/route.js`,
  `app/data-health/page.js`, `lib/scoring-shadow-gate.js`.
- **D/E — explicit rollback and Production-legacy presentation:** `app/page.js`,
  `app/board-of-governors/page.js`, `app/champions/page.js`,
  `app/champions/[year]/page.js`, `app/compare/page.js`,
  `app/courses/[courseId]/holes/[holeNumber]/page.js`, `app/history/page.js`,
  `app/history/[year]/page.js`, `app/history/[year]/round/[round]/page.js`,
  `app/history/[year]/team/[side]/page.js`, `app/odds-center/page.js`,
  `app/players/page.js`, `app/players/[slug]/page.js`, `app/ratings/page.js`,
  `app/records/page.js`, `app/records/[slug]/page.js`, `app/statistics/page.js`,
  `app/statistics/handicaps/page.js`, `app/statistics/partnerships/page.js`,
  `app/statistics/rivalries/page.js`, `app/sitemap.js`,
  `app/tournament-guide/resolveGuideContentGoogle.js`,
  `lib/draft-runtime.js`, `lib/odds-data.js`, `lib/prediction-data.js`,
  `lib/stats.js`, `lib/war-room-input-google.js`.
- **Shared transports/gates serving A–E:** `app/live/sheetData.js`,
  `lib/google-sheets-data.js`, `lib/google-sheets-server-read.js`,
  `lib/google-sheets-write.js`, `lib/spreadsheet-environment.js`,
  `lib/calcutta-read-source.js`, `lib/competition-derived-read-source.js`,
  `lib/draft-read-source.js`, `lib/game-center-read-source.js`,
  `lib/guide-read-source.js`, `lib/history-2026-read-source.js`,
  `lib/home-read-source.js`, `lib/intelligence-derived-read-source.js`,
  `lib/leaderboards-core-read-source.js`, `lib/match-authorization-source.js`,
  `lib/my-match-read-source.js`, `lib/net-skins-read-source.js`,
  `lib/odds-calculation-source.js`, `lib/participant-identity-authority.js`,
  `lib/prediction-settings-source.js`, `lib/published-odds-read-source.js`,
  `lib/scoring-authority.js`, `lib/scoring-read-source.js`,
  `lib/tournament-read-source.js`.
- **Static reference only, not a Google transport:** `lib/scoring-api-errors.js`
  (safe error vocabulary) and the two early scoring-shadow migrations
  (workbook provenance/authority metadata). These are not network dependencies.

`app/api/director/route.js` and `app/api/live-matches/route.js` are also the
H/blocker family described in the duplicate-authority audit; their A/C role
does not excuse a Google-only mutation while Supabase is canonical.

## Audit conclusion

The repository already expresses the intended long-term shape: one canonical
Supabase application model, shared adapters for website/PWA/native consumers,
Google retained where it is the approved Director authoring interface or a
reporting mirror, and explicit reversible source boundaries during staged
cutover.

The safe F cleanup is implemented and the G candidates are conservatively
deprecated. Broader Google deletion still requires Production cutover
authorization and explicit rollback retirement. Step 10 should not begin until
the protected Director/live-match dual-authority blocker and the remaining
permissive authority-token configuration fallbacks are resolved, and the same
final commit is deployed and network-certified in Preview.
