# Calcutta release blocker inventory and disposition

Starting candidate: `6adace0c57e107ecda30d074001cb8ce302ab67b`.

Inventory completed read-only before correction. All 32 reproduce on unchanged 3985efb0. Reproduction is not a waiver. Classification: A17/B3/C3/D9/E0/F0/G0. Eleven baseline tests receive explicit security/authority review; PN-2 is the twelfth. No confirmed security/product defect was found. The four integrity dispositions and the exact local dependency-symlink harness correction were subsequently explicitly authorized. No assertion is skipped. The final certification section supersedes the retained initial blocked-run evidence below.

## Root-cause groups

| Group | Count | IDs | Current authority / disposition |
|---|---:|---|---|
| Public vs explicit participant presentation/routing and per-surface mounting |16|1,3,5,7,8,9,10,11,12,13,14,15,18,24,30,32|Current public/PWA separation; test real routing/rendering, not obsolete implementation spelling.|
| Canonical tagline |2|6,26|4096f972 copy, accessible portal retained.|
| Safe optional-side-game visibility/read state |3|17,19,28|CalcuttaV1 and Net Skins explicit domain states, not old deployment flag.|
| Current pointer / retirement / Setup / display semantics |5|2,16,20,27,31|Existing canonical selection, installability retirement, Setup workspace, Guide retirement, release74 display.|
| Incomplete or unresolved fixtures |3|23,25,29|Real canonical portrait; matched index/year revisions; resolve React import.|
| Historical identity scope / cache-version maintenance |3|4,21,22|Explicitly authorized exact pins, immutable historical release scope, and cache-version update; no calculation or authority weakening.|

## Complete32-failure inventory

A stale source assertion; B historical/release identity; C harness/fixture; D intentional covered change; E possible defect; F confirmed defect; Gunknown.

### 1. Courses UI uses chronological groups, bounded prefetch, one AppShell, and no per-card data topology

- File/assertion: `test/course-archive-organization.test.mjs:106` (original starting line).
- Expected: No Header/Footer anywhere in Courses; no fetch/API per card.
- Actual baseline/current behavior: Public Courses conditionally renders Header/Footer; participantPresentation suppresses both. No per-card transport.
- History/replacement: Public restoration 78031110/31a60421 separated public website and /app surfaces.
- Classification: **D**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute both conditional render states; retain no-fetch/no-API guards.

### 2. current Course Detail uses the Guide resolver while archive transport uses the explicit historical-course boundary

- File/assertion: `test/course-detail-app.test.mjs:72` (original starting line).
- Expected: Exact guide-only readTournamentLiveView ternary with source.tournamentId.
- Actual baseline/current behavior: Guide-only live context remains; Production first resolves current pointer, while Preview uses configured ID.
- History/replacement: Annual current-tournament routing replaces static source hint; source remains Supabase.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **YES**. No bypass, data write, secret exposure, or authority regression demonstrated; current behavioral guards were inspected.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute actual resolver for Guide/Course × Production/Preview; assert correct year and zero Google fallback.

### 3. player profiles preserve draft history as display-only career context

- File/assertion: `test/draft-analytics.test.mjs:41` (original starting line).
- Expected: No historical Draft links in either presentation.
- Actual baseline/current behavior: Participant renders noninteractive article; public website retains historical Draft links and analytics link.
- History/replacement: Public website restoration; completed Draft facts unchanged.
- Classification: **D**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute conditional branch and verify public Link vs participant article; preserve history-read assertions.

### 4. analytics implementation digest requires an explicit version update

- File/assertion: `test/history-analytics-reuse.test.mjs:319` (original starting line).
- Expected: Current four-file digest scorecard-domain-v1-456440687845e6d6 equals explicit version.
- Actual baseline/current behavior: Explicit version remains scorecard-domain-v1-0ef4c5ba687ce51b. Only prediction-engine changed; analytics imports pick, whose c/key dependency closure is unchanged. Other three files are byte-identical to bbf942fd.
- History/replacement: c26d5823 handicap parity and c0d8267b symmetry changed unrelated prediction functions, not consumed historical calculations.
- Classification: **B**. Candidate-related: **NO**.
- Security/authority relevant: **YES**. No bypass, data write, secret exposure, or authority regression demonstrated; current behavioral guards were inspected.
- Release blocking: **NO after explicitly authorized correction**.
- Disposition: Advance the explicit version to the current four-file digest and regenerate its coupled codec identity. The digest test and all calculations remain unchanged. The previously rejected dependency-scoped test approach was not applied.

### 5. 2025 owns one compact top year navigator while preserving canonical destinations

- File/assertion: `test/history-step3a-completed-year-2025.test.mjs:160` (original starting line).
- Expected: Literal /history previous/next href properties.
- Actual baseline/current behavior: historyPresentationHref preserves public URLs and translates participant URLs to /app/history.
- History/replacement: Explicit participant namespace; one participant rail retained.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute actual href resolver for both namespaces; verify previous/next wiring.

### 6. redundant app footers are scoped out of History while public event footer remains intact

- File/assertion: `test/history-step3a4-navigation-scramble.test.mjs:260` (original starting line).
- Expected: Old 24 Players • Two Teams • One Trophy literal.
- Actual baseline/current behavior: Footer renders TOURNAMENT_2026_TAGLINE.
- History/replacement: 4096f972 certified cadence: 24 Players. 3 Rounds. 2 Teams. 1 Trophy.
- Classification: **D**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Render canonical tagline expression; retain scoped footer absence checks.

### 7. 2026 Year navigation is shared, top-placed, two-destination, and has no fabricated 2027

- File/assertion: `test/history-step3a7-2026-parity.test.mjs:77` (original starting line).
- Expected: Inline center href /history.
- Actual baseline/current behavior: Center uses namespace helper; previous2025/nextnull model unchanged.
- History/replacement: Explicit participant namespace.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute helper; retain placement, absent2027, and previous/next model assertions.

### 8. both 2026 Team pages place one Tournament parent rail below the hero

- File/assertion: `test/history-step3a7-2026-parity.test.mjs:118` (original starting line).
- Expected: Inline /history/${team.year}.
- Actual baseline/current behavior: Parent URL uses historyPresentationHref; team roster/round structure unchanged.
- History/replacement: Public/PWA split; participant parent rail preserved.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute actual team href helper; retain 12-player/three-round and rail placement checks.

### 9. History-context Course navigation sits below the hero while direct and Guide entry stay normal

- File/assertion: `test/history-step3a7-2026-parity.test.mjs:154` (original starting line).
- Expected: Unwrapped tournamentReturn/historyReturn href.
- Actual baseline/current behavior: coursePresentationHref maps scoped History/Course/Guide URLs; unrelated URLs pass through.
- History/replacement: Explicit participant namespace.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute actual course helper, preserve direct/Guide/History null and rail placement assertions.

### 10. full current standings disclose inline from the existing 24-row History payload

- File/assertion: `test/history-step3a7-2026-parity.test.mjs:168` (original starting line).
- Expected: Direct /players/${slug} Link.
- Actual baseline/current behavior: Link uses historyPresentationHref; 24-row disclosure remains inline.
- History/replacement: Public/PWA route isolation.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute profile URL semantics; retain 24 rows, inline disclosure, no additional fetch.

### 11. deep Career detail mounts locally on first expansion and remains mounted

- File/assertion: `test/history-step5c-delivery.test.mjs:114` (original starting line).
- Expected: Records Held exact opening tag and useState(open || !defer).
- Actual baseline/current behavior: participantPresentation prop added; shouldDefer = participantPresentation && defer. Public eager, participant deferred.
- History/replacement: Public restoration preserves original public detail and mobile deferral.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute real IntelligenceSection with stateful hook fixture; assert mount, open, close-retains-content in both modes.

### 12. History prefetch is bounded to recent Archive, first Round, teams, and shell destinations

- File/assertion: `test/history-step5c-delivery.test.mjs:133` (original starting line).
- Expected: Three textual index===0 prefetch occurrences.
- Actual baseline/current behavior: Four occurrences: additional public overview plus existing branches; each independently first-round-only.
- History/replacement: Public overview restoration.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute every real prefetch expression for indices0/1/2; retain false-prefetch heavy-link guards.

### 13. Home routes, identity, facts, and accessible actions remain intact

- File/assertion: `test/home-command-center-polish.test.mjs:88` (original starting line).
- Expected: Home links /live?view=leaderboards, skins, and /tournament-guide/schedule.
- Actual baseline/current behavior: Participant links /app/leaderboards, skins, /app/guide/schedule.
- History/replacement: Explicit participant navigation authority.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Validate canonical participantAppHref/destination and actual call-site URLs; preserve action/name/accessibility assertions.

### 14. View Scorecard targets the canonical Game Center and preserves leaderboard return state

- File/assertion: `test/leaderboard-detail-consistency.test.mjs:25` (original starting line).
- Expected: Return URL /live?view=leaderboards&tab=players&round=...
- Actual baseline/current behavior: /app/leaderboards?tab=players&round=...; Game Center encodes return context.
- History/replacement: Explicit participant routing.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute actual returnTo expression including encoded adversarial query characters; keep canonical scorecard destination.

### 15. Preview page and API use Supabase core with no Google fallback or Passport-named identity request

- File/assertion: `test/leaderboards-core-supabase.test.mjs:421` (original starting line).
- Expected: Supabase leaderboard branch lives in app/live/page.js as supabaseLeaderboards.
- Actual baseline/current behavior: Explicit participant page app/app/leaderboards/page.js owns it; public /live uses TournamentSupabaseRead.
- History/replacement: Website/PWA boundary restoration.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **YES**. No bypass, data write, secret exposure, or authority regression demonstrated; current behavioral guards were inspected.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute actual pages with isolated transports; selected Supabase performs zero Google calls. Retain API identity/no-fallback/cache guards.

### 16. Supabase Home does not register the legacy Trusted Devices install callback

- File/assertion: `test/legacy-participant-access-cleanup.test.mjs:92` (original starting line).
- Expected: Slice first effect through obsolete [onUpdated], exact readiness-only guard.
- Actual baseline/current behavior: Initial effect reads install policy; event effect requires readiness AND installabilityEnabled; dependencies include both.
- History/replacement: Production browser installability retirement (step14h).
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **YES**. No bypass, data write, secret exposure, or authority regression demonstrated; current behavioral guards were inspected.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute all real component effects with missing readiness and retired policy; assert no listeners or writes.

### 17. Leaderboards use shared tournament identity, explicit app routing, URL tabs, detail sheets, and Passport highlighting

- File/assertion: `test/mobile-leaderboards.test.mjs:334` (original starting line).
- Expected: Unconditional LEADERBOARD_MODULES.map.
- Actual baseline/current behavior: leaderboardModules derived from canonical Net Skins state; NOT_CONFIGURED tab hidden.
- History/replacement: Optional side-game presentation contract.
- Classification: **D**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute actual module-selection expression for absent/notconfigured/visible states; preserve all detail/current-player checks.

### 18. Game Center return context defaults to My Match and preserves explicit safe origins

- File/assertion: `test/my-match-game-center-role-polish.test.mjs:90` (original starting line).
- Expected: leaderboardReturn ? backTo : /my-match literal.
- Actual baseline/current behavior: Both legacy and /app leaderboard contexts supported; legacy translated; default remains /my-match.
- History/replacement: Participant namespace migration.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute actual backHref block for home/tournament/both leaderboard URLs/unknown external origin.

### 19. Leaderboards owns exactly Players, Teams, Net Skins, and Insights

- File/assertion: `test/navigation-ia-polish.test.mjs:46` (original starting line).
- Expected: Unconditional four-module iteration.
- Actual baseline/current behavior: Four eligible modules, but unavailable Net Skins omitted; Calcutta remains separate.
- History/replacement: Optional side-game state visibility.
- Classification: **D**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute current module expression and keep Calcutta exclusion plus routing assertions.

### 20. current Director setup and Tournament Day surfaces present tee time without a starting-hole control

- File/assertion: `test/phase-b1-production-starting-hole-retirement.test.mjs:38` (original starting line).
- Expected: Old inline Update match course and tee time copy in SetupPanel.
- Actual baseline/current behavior: Match Details is in RoundPairingWorkspace; stages upsert-match with metadata and preserves pending selections.
- History/replacement: Certified Round Pairing Workspace replaced old per-match controls.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute real Match Details stage expression; verify exact metadata, no startingHole and no pairing mutation.

### 21. PN-1 preserves Production authority, dispatch, fencing, scoring and post-commit implementations byte-for-byte

- File/assertion: `test/pn1-production-mobile-boundary.test.mjs:10` (original starting line).
- Expected: Current native Calcutta/Skins and transport identical to 6d0b2ad5 plus one existing Guide exception.
- Actual baseline/current behavior: Stage0 c0d3e5e0 added canonical reviewer-only published presentation and observer transport. Four baseline files differ, including already-excepted Guide fingerprint.
- History/replacement: Certified native Stage0; reviewer security and unpublished presentation tests cover new behavior.
- Classification: **B**. Candidate-related: **NO**.
- Security/authority relevant: **YES**. No bypass, data write, secret exposure, or authority regression demonstrated; current behavioral guards were inspected.
- Release blocking: **NO after explicitly authorized correction**.
- Disposition: Pin only the three Stage-0 files to exact reviewed 3985efb0 versions; retain every other original pin and the existing Guide exception. Permit only the exact reviewed Calcutta OBSERVATION line.

### 22. decimal-display correction preserves all release73 runtime outside the exact presentation allowlist

- File/assertion: `test/pn4-production-reconciliation.test.mjs:107` (original starting line).
- Expected: Entire current tree equals release73 outside five display paths/tests/docs.
- Actual baseline/current behavior: Later authorized releases changed Menu, tagline, assets and many other surfaces. First mismatch app/Menu.js blob cb9993... vs6c8e77....
- History/replacement: Test intended release74 scope but compares moving HEAD. Nearby release71/73 checks use immutable release objects.
- Classification: **B**. Candidate-related: **NO**.
- Security/authority relevant: **YES**. No bypass, data write, secret exposure, or authority regression demonstrated; current behavioral guards were inspected.
- Release blocking: **NO after explicitly authorized correction**.
- Disposition: Certify immutable release74 against immutable release73 with the original exact file/blob allowlist. A separate current-candidate gate preserves every runtime file against 6adace0c, except the two explicitly authorized analytics identity constants.

### 23. Draft portraits enrich once by stable Player ID without changing the completed Draft

- File/assertion: `test/post-step14-draft-team-intelligence.test.mjs:42` (original starting line).
- Expected: Synthetic nonexistent player-one-pic.webp becomes a local URL.
- Actual baseline/current behavior: Canonical asset inventory correctly returns null for nonexistent key.
- History/replacement: Prelaunch clean-fallback contract prevents known-doomed404s.
- Classification: **C**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Use existing clay-beltran-pic.webp fixture plus nonexistent future key; assert immutable picks/handicaps/order retained.

### 24. participant shell uses selective idle prefetch while retaining explicit heavy-link control

- File/assertion: `test/preview-reliability.test.mjs:134` (original starting line).
- Expected: Literal /live participant nav entry.
- Actual baseline/current behavior: /app/tournament entry; idle prefetch and explicit heavy-link control retained.
- History/replacement: Explicit participant namespace.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Validate actual destination through shared routing and source call-site, preserving idle/prefetch guards.

### 25. Homepage completed-history composition keeps explicit 2026 history while current presentation follows the Production pointer

- File/assertion: `test/production-completed-history-homepage-read.test.mjs:195` (original starting line).
- Expected: Fixture YEARS rows only contain year; YEAR revision omits year/fingerprint yet expected success.
- Actual baseline/current behavior: Current reader rejects mismatched/incomplete index-vs-year revision evidence with COMPLETED_HISTORY_REVISION_CHANGED.
- History/replacement: Versioned completed-History cache protects consistent snapshot composition.
- Classification: **C**. Candidate-related: **NO**.
- Security/authority relevant: **YES**. No bypass, data write, secret exposure, or authority regression demonstrated; current behavioral guards were inspected.
- Release blocking: **NO after verified maintenance**.
- Disposition: Supply matching synthetic year/revision/fingerprint in both reads; preserve strict runtime comparison unchanged.

### 26. the public site menu restores its original tournament footer without changing the PWA Hub

- File/assertion: `test/public-website-shell-restoration.test.mjs:7` (original starting line).
- Expected: Obsolete footer copy and inline fragment overlay.
- Actual baseline/current behavior: Canonical tagline and accessible portal overlay; hub stays separate.
- History/replacement: 4096f972 tagline; fec7b917 public drawer containment.
- Classification: **D**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Render canonical copy and execute portal selection for public/PWA/open/closed; preserve hub/nofooter distinction.

### 27. every callable mutation symbol remains on an exactly classified intent entrypoint

- File/assertion: `test/step11-6-legacy-google-mutation-inventory.test.mjs:168` (original starting line).
- Expected: Literal hard-Preview predicate in each legacy writer entrypoint.
- Actual baseline/current behavior: Guide now blocks normalized Production with410 before authorization, body parsing or dynamic writer import. Privileged authoring wrapper separately retires both Guide operations.
- History/replacement: Production Guide authoring moved to Director/Supabase; legacy preview preserved.
- Classification: **D**. Candidate-related: **NO**.
- Security/authority relevant: **YES**. No bypass, data write, secret exposure, or authority regression demonstrated; current behavioral guards were inspected.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute all three actual handlers in normalized Production; require410, no authorization/body/writer. Keep complete exact writer inventory and other boundaries.

### 28. Net Skins reads canonical NOT_CONFIGURED state while Calcutta retains its configuration gate

- File/assertion: `test/step11-production-cutover-read-sources.test.mjs:202` (original starting line).
- Expected: Calcutta unavailable without old PRODUCTION_CALCUTTA_CONFIGURED, even explicitGoogle; supabase allowed at CURRENT_READS.
- Actual baseline/current behavior: V1 Calcutta accepts canonical NOT_CONFIGURED/UNPUBLISHED; requires OBSERVATION for Supabase; explicit retained Google selection remains no-fallback.
- History/replacement: 9d5392e8 Production CalcuttaV1 owns safe optional-domain states.
- Classification: **D**. Candidate-related: **NO**.
- Security/authority relevant: **YES**. No bypass, data write, secret exposure, or authority regression demonstrated; current behavioral guards were inspected.
- Release blocking: **NO after verified maintenance**.
- Disposition: Test all optional flag states at OBSERVATION; retain rejection below requiredphase and exact explicit-source semantics.

### 29. current-read dispatch preserves frozen input and makes the pointer authoritative for future

- File/assertion: `test/step13e7b-production-annual-reads-workers.test.mjs:37` (original starting line).
- Expected: Data-URL transformed module resolves all imports.
- Actual baseline/current behavior: New bare React cache import cannot resolve relative to data: URL; execution fails before any authority assertion.
- History/replacement: Request-scoped cache added by public-read optimization.
- Classification: **C**. Candidate-related: **NO**.
- Security/authority relevant: **YES**. No bypass, data write, secret exposure, or authority regression demonstrated; current behavioral guards were inspected.
- Release blocking: **NO after verified maintenance**.
- Disposition: Resolve actual React module to absolute fileURL; preserve actual cache and every pointer/frozen-year assertion.

### 30. legacy /api/live is explicit rollback/Production only and cannot be a Supabase fallback

- File/assertion: `test/step9-data-authority-cleanup.test.mjs:78` (original starting line).
- Expected: Old per-view conditions and NetSkins selection inline in public /live.
- Actual baseline/current behavior: Public /live delegates Supabase views to TournamentSupabaseRead; explicit participant leaderboard page owns core/Skins selection.
- History/replacement: Public/participant routing restoration.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **YES**. No bypass, data write, secret exposure, or authority regression demonstrated; current behavioral guards were inspected.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute real pages with strict isolated transports; retain legacy-route selection/fallback header/order guards.

### 31. Tournament match cards remain compact and preserve official match data

- File/assertion: `test/tournament-dashboard.test.mjs:94` (original starting line).
- Expected: Display formatter directly consumes playingHcp.
- Actual baseline/current behavior: playerDisplayHandicap uses meaningful decimal displayHandicap separately from integer playingHcp and strokes.
- History/replacement: Release74 meaningful Course Handicap display correction.
- Classification: **D**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute real playerMeta with14.7display/15playing/14strokes; assert decimal, unchanged strokes and unchanged input.

### 32. public desktop menu uses the original website navigation sections

- File/assertion: `test/tournament-hub.test.mjs:30` (original starting line).
- Expected: Public overlay is inline fragment beside Sheet.
- Actual baseline/current behavior: Public accessible portal vs participant Sheet; navigationSections unchanged.
- History/replacement: fec7b917 public drawer containment.
- Classification: **A**. Candidate-related: **NO**.
- Security/authority relevant: **NO**.
- Release blocking: **NO after verified maintenance**.
- Disposition: Execute actual portal selection/dialog state; preserve exact navigation labels and no admin generic link.

## Candidate-specific PN-2

`test/pn2-native-admission.test.mjs:333` compares thirteen current authority implementations byte-for-byte against6d0b2ad5. It prevents native admission work from changing web/PWA authority, resource fencing, identity, persistence, and dispatch. The only candidate difference in its protected file is:

```js
  read_production_calcutta_management_v1: "OBSERVATION",
```

The existing production RPC_PHASE table is an exact reviewed allowlist, not an open capability. OBSERVATION is the established inspection/configuration read phase. The SQL adds a STABLE private projection and frozen/current-year wrappers. They enforce service-role, runtime/resource contract, active Director actor and canonical current-pointer agreement. The future-year target is reachable only through the existing annual dispatcher with READ classification and no worker. Public/anon/authenticated execution is revoked; the internal projection and future target are not service-role-callable directly. Returned fields are explicitly whitelisted: configuration, prices, owners/fractions, status, revisions/fingerprints, requested predecessor, and active competition identities. No Auth UUID, email, GHIN or audit payload is returned. No financial formula, mutation body, public participant read, revision immutability or publication operation is changed.

Independent answers: mutates data NO; broadens participant access NO; unpublished data outside Director NO; bypasses current-tournament authority NO; bypasses Director NO; new financial authority NO; weakens immutable revisions NO. The install inserts only its exact annual READ dispatch registration; it creates no Calcutta facts.

A bounded exact-replacement precedent exists in PN-1 (Guide delivery-fingerprint exception), and PN-4 pins exact immutable release scopes. Initial application was safety-blocked; no bypass was attempted. After explicit owner authorization, the exact PN-2 line was added to the expected frozen file using a helper that requires one exact anchor and rejects an already-present extension. The comparison still covers every other byte. Negative tests reject changed phase, extra RPC, changed existing RPC and missing registration.

## Security classification

Explicit authority-related baseline IDs:2(current tournament);4(historical cache integrity);15(Preview/Supabase no fallback);16(legacy account install writes);21(native reviewer/persistence);22(release lineage);25(consistent canonical historical revisions);27(retired Production Google writer);28(domain read source/phase);29(current pointer dispatch);30(legacyGoogle no fallback). PN-2 adds Director-private read/authority review. No arbitrary allowlist entries, source fallbacks, client-selected resources or secret-bearing fixtures were introduced. Static method/location checks were replaced only where the actual handler/selector is executed with fail-closed outcomes.

## Initially outstanding approvals — subsequently explicitly granted

1. PN-2: authorize one exact OBSERVATION allowlist line while all other authority bytes remain pinned.
2. PN-1: authorize exact reviewed Stage0 file pins for native Calcutta/NetSkins/observer read transport, plus the same candidate line; preserve every other original byte pin and all reviewer/admission tests.
3. PN-4: authorize certifying the immutable release74 object8e967680 rather than applying that historical release's scope to every later authorized commit; preserve exact file/blob comparisons.
4. Historical analytics: approve advancing the explicit analytics version to its current four-file digest (`scorecard-domain-v1-456440687845e6d6`) and regenerating its coupled codec identity under the existing scheme, without changing calculations. Consumed pick/c/key and all three analytics files are unchanged; an earlier proposed consumed-dependency identity-test approach was safety-blocked and not applied. The safer version-update proposal leaves the full current-source digest assertion intact. No cache version/source change has been made.

The initial run stopped while these approvals were outstanding. All four were subsequently granted and applied exactly; see final certification below. No Production access, push, deployment or migration occurred.

## Initial certification evidence — retained audit trail

- Independent maintenance selection: 236 passed, 0 failed.
- Focused Calcutta model/server selection: 17 passed, 0 failed.
- Relevant disposable PostgreSQL integration: 9 passed, 0 failed.
- React DOM renderer selection in normal runtime: 30 passed, 0 failed.
- Calcutta and Net Skins browser scripts: both passed at390/430/820/1280/1440px. Synthetic local transports only; no Production calls.
- Production build: passed. Existing autoprefixer warnings remain; no new runtime changes.
- git diff --check: passed.
- Full repository application selection: **3,490 tests: 3,486 passed, 4 failed, 0 skipped/cancelled**. Server selection3460:3456pass/4fail; separate normal React DOM selection30:30pass. Integration tests run separately. No failing test excluded or skipped.
- Runtime preservation: app/lib/supabase/ios/scripts/public/contracts/build configuration are byte-unchanged from6adace0c. Original certified Calcutta patch remains range-diff-identical to847522ca.
- Four protected integrity test files are unchanged. No waiver, broad allowlist, flaky marking or skip was added.
- No new candidate commit while release gates remain unresolved. Maintenance changes are local and uncommitted.

Evidence logs: `/private/tmp/calcutta-disposition-maintenance.log`, `/private/tmp/calcutta-disposition-focused17.log`, `/private/tmp/calcutta-disposition-pg.log`, `/private/tmp/calcutta-disposition-render.log`, `/private/tmp/calcutta-disposition-all-app.log`, `/private/tmp/calcutta-disposition-build.log`, `/private/tmp/calcutta-disposition-calcutta-ui.log`, `/private/tmp/calcutta-disposition-net-skins-ui.log`.

## Initial blocked status — superseded by final certification below

CALCUTTA RELEASE BLOCKER DISPOSITION: BLOCKED

STARTING CANDIDATE: 6adace0c57e107ecda30d074001cb8ce302ab67b

STALE SOURCE ASSERTIONS: 17

STALE HISTORICAL ASSERTIONS: 3

HARNESS ISSUES: 3

INTENTIONAL COVERED CHANGES: 9

POSSIBLE PRODUCT DEFECTS: 0

CONFIRMED PRODUCT DEFECTS: 0

UNKNOWN: 0

SECURITY-RELEVANT FAILURES REVIEWED: 12 (11 baseline plus PN-2)

CONFIRMED SECURITY DEFECTS: 0

PN-2 ADDITIVE EXTENSION: Technically compatible; frozen-test update authorization remains blocked.

PN-2 CORRECTION: NOT APPLIED. One exact read registration was proposed; every existing PN-2 byte assertion remains enforced.

CALCUTTA BUSINESS LOGIC CHANGED: NO

TEST COVERAGE WEAKENED: NO

FINAL REPOSITORY TESTS: 3486 PASS / 4 FAIL / 0 SKIPPED

UNEXPLAINED FAILURES: 0

UNRESOLVED SECURITY/INTEGRITY GATE FAILURES: 4 (analytics identity, PN-1, PN-2, release-74 scope)

POSTGRES INTEGRATION: PASS — 9/9

PRODUCTION BUILD: PASS

DIFF CHECK: PASS

FINAL CANDIDATE SHA: NONE — no new commit. HEAD remains the starting candidate; verified maintenance patch is local/uncommitted.

PUSHED: NO

DEPLOYED: NO

PRODUCTION MUTATIONS: 0

READY FOR BOUNDED PRODUCTION RELEASE: NO

## Subsequent authorized integrity disposition — stopped at harness boundary

The owner subsequently authorized the four exact dispositions above. They are
now applied locally: PN-1 pins the three reviewed Stage-0 files; PN-1/PN-2 permit
only the exact Director Calcutta OBSERVATION line; PN-4 certifies immutable
release 74; analytics version and its coupled codec digest advance under the
unchanged digest tests. All four original failing gates now pass.

A new whole-candidate preservation test pins every runtime file to starting
candidate 6adace0c, allowing only the two explicit analytics identity constants.
Its first execution rejects the disposable checkout's untracked node_modules
symlink as an unexpected runtime addition. Focused results: 41 tests, 40 passed,
1 failed, 0 skipped. This is a newly added harness boundary, not evidence of a
Calcutta runtime regression. The proposed dependency-only exclusion was rejected
by the safety reviewer as beyond the exact dispositions after a failing gate;
that patch was not applied and no alternative bypass was attempted.

Evidence: /private/tmp/calcutta-final-integrity.log. Calcutta range-diff remains
identical, application/migration/native files are unchanged from the starting
candidate, and git diff --check passes. Full-suite/build recertification and the
new commit are deliberately not completed while this gate remains unresolved.
All changes remain local and uncommitted. No push, deployment, Production
migration, or Production data mutation occurred. Release readiness remains NO.

## Final authorized harness disposition and candidate scope

The owner explicitly authorized correcting only the demonstrated local dependency
symlink issue. The exception now requires all of the following:

- Exact workspace entry `node_modules` is a symbolic link, not a regular file or directory.
- Its literal and resolved target are both exactly
  `/Users/claybeltran/Developer/BaggerInv/node_modules`, a real external dependency directory.
- Neither the starting candidate, current HEAD nor staging index contains that
  entry or any descendant. It therefore is absent from the exact Git deployment
  payload; the dependency manifests remain byte-pinned.
- Every other runtime/source/configuration path retains its existing exact checks.

There is no general symlink exclusion, ignore-file edit, dependency wildcard, or
runtime-file exemption. Negative tests reject other paths, staged/tracked
dependencies, redirected targets and non-symlink entries. The temporary workspace
link will be removed before the final commit; no dependency files are committed.

The four approved integrity corrections, prior 29-failure maintenance, and
certified Calcutta runtime/business implementation are preserved. The analytics
file differs only in its two explicit identity constants. The full current-source
analytics hash test remains unchanged. PN-1/PN-2 compare complete expected files;
the sole additive RPC is exactly `read_production_calcutta_management_v1` at
`OBSERVATION`. Release74 is certified as an immutable historical object; the
separate current-candidate check continues guarding all current runtime files.

### Exact diff classification

Relative to starting candidate `6adace0c57e107ecda30d074001cb8ce302ab67b`, the
final maintenance commit contains 34 files:

- 32 test/harness files: justified behavioral maintenance, exact reviewed
  integrity pins, and the strictly bounded local dependency-artifact check.
- 1 documentation file: this complete inventory, disposition and certification record.
- 1 runtime metadata file: `lib/historical-analytics-reuse.js`; only the explicit
  analytics version and coupled codec identity constants change. No calculations change.

The complete combined candidate relative to original baseline
`3985efb0c6c6cf99ffc38e92ca2b8b31f0b38971` spans 61 files:
5 application files, 6 library files, 2 synthetic browser scripts, 1 additive
private-read migration, 3 documentation files and 44 test/harness files. This
includes the unchanged certified Calcutta payload and the previously authorized
Net Skins saved-entry readiness cleanup. The original Calcutta payload range-diff
remains identical (`847522ca = 6adace0c`); no additional business change is introduced.

The additive migration remains
`supabase/production_incremental/director-calcutta-management-read-v1.sql`.
It is certified in disposable PostgreSQL only. No Production installation is
performed or authorized by this local final-candidate task.

## Final certification — PASS

The complete unchanged application test selection was rerun with the local-server
permission required by its synthetic browser tests. Results:

| Gate | Result |
|---|---|
| Repository server-runtime application selection | 3,463 passed; 0 failed; 0 skipped/cancelled |
| Separate React DOM renderer selection | 30 passed; 0 failed; 0 skipped/cancelled |
| **Complete application total** | **3,493 passed; 0 failed; 0 skipped/cancelled** |
| Focused integrity selection (included in application total) | 42 passed |
| Focused Calcutta model/server selection (included in application total) | 17 passed |
| Relevant disposable PostgreSQL integration | 9 passed; 0 failed; 0 skipped/cancelled |
| Calcutta Director browser certification | PASS: 390, 430, 820, 1280, 1440px |
| Net Skins readiness browser certification | PASS: 390, 430, 820, 1280, 1440px |
| Production build | PASS; existing CSS/autoprefixer warnings only |
| git diff --check | PASS |
| Certified Calcutta payload preservation | PASS; exact range-diff identity and current runtime blob check |

The initial full run lacked sandbox permission to bind localhost and consequently
reported four browser `listen EPERM` errors. No test/source change was made for
these execution errors. The complete final run above, not a waiver or skipped
selection, includes all four browser tests and passes. React DOM tests are run
without the server-only export condition as required by their existing harness;
every application test is accounted for. Integration tests run separately in
disposable PostgreSQL, not against Production.

Evidence logs:

- `/private/tmp/calcutta-final-all-app-complete.log`
- `/private/tmp/calcutta-final-render.log`
- `/private/tmp/calcutta-final-integrity.log`
- `/private/tmp/calcutta-final-focused17.log`
- `/private/tmp/calcutta-final-pg.log`
- `/private/tmp/calcutta-final-build.log`
- `/private/tmp/calcutta-final-calcutta-ui.log`
- `/private/tmp/calcutta-final-net-skins-ui.log`

Responsive screenshots:

- `/var/folders/1l/c2bdsd7114l3tgslqq4np9qc0000gn/T/bagger-calcutta-ui-UDBmWc`
- `/var/folders/1l/c2bdsd7114l3tgslqq4np9qc0000gn/T/bagger-skins-readiness-ui-qKg99w`

Final disposition: the 29 maintenance corrections and four exact integrity
dispositions are certified. No unknown/product/security defect remains in these
findings. Security/integrity failures: 0. Unexplained failures: 0. Calcutta
configuration, multiple/self ownership, exact prices/fractions, immutable
revisions, canonical future-year private reads and separate publication are
unchanged. No participant read or financial authority is broadened by maintenance.

The final local candidate commit contains this report; its exact SHA is returned
in the final handoff (rather than embedding a self-referential commit hash here).
No push, deployment, Production migration, auction/configuration/publication
operation or Production connection occurred. Production Calcutta revision 2 and
all other Production facts are untouched by this task.

CALCUTTA RELEASE BLOCKER DISPOSITION: PASS

CALCUTTA BUSINESS LOGIC CHANGED: NO

TEST COVERAGE WEAKENED: NO

FINAL REPOSITORY TESTS: 3493 PASS / 0 FAIL / 0 SKIPPED

UNEXPLAINED FAILURES: 0

SECURITY/INTEGRITY FAILURES: 0

POSTGRES INTEGRATION: PASS — 9/9

PRODUCTION BUILD: PASS

DIFF CHECK: PASS

PUSHED: NO

DEPLOYED: NO

PRODUCTION MIGRATION INSTALLED: NO

PRODUCTION MUTATIONS: 0

READY FOR BOUNDED PRODUCTION RELEASE: YES
