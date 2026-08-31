# Bagger Invitational for iOS

This directory contains the native SwiftUI application for **Bagger Preview**. Step 2A established isolated Preview authentication and canonical participant identity. Step 2B added the authenticated mobile read/cache engine. Step 2C added Today and the five-tab application shell. Step 2D added the cached-first Match Center and read-only Match Detail. Step 2E added the first canonical owned-Match scoring reader and a native, read-only official Scorecard. Step 2F added durable, identity-partitioned scoring intent. Step 2G completed the isolated-Preview scoring loop with canonical mutation acknowledgements, mandatory refresh, participant-controlled conflict resolution, corrections, and online-only finalization logic. Step 2H added the complete V1 participant Leaders experience: Tournament Score, canonical Round Scores, Player Leaders, official-only Net Skins, and published Calcutta. Step 2I completes the all-native More experience: full Schedule, Player Passport, Tournament Guide, Courses, Rules, History, Records, Published Odds, Dining, Local Guide, Important Contacts, and Settings.

## Requirements

- macOS with Xcode 26.6
- iOS 26.5 Simulator runtime
- An iPhone 17 Pro Max simulator for the primary validation destination
- iOS 16.0 or newer for the app deployment target
- Access to the client-safe Preview Supabase configuration

The project uses Swift 6 and the official Supabase Swift package through Swift Package Manager. Xcode resolves package dependencies when the project is opened or built.

## Open the project

Open `ios/BaggerInv.xcodeproj` in Xcode, select the shared `BaggerInv` scheme, and choose an iPhone simulator. The development app uses the reversible bundle identifier:

`com.sandbaggerinvitational.bagger.preview`

The app is intentionally presented as **Bagger Preview**, and both authentication and the participant shell keep a visible `PREVIEW` indicator.

## Configure isolated Preview

Create the local configuration from the checked-in example:

```sh
cp ios/Config/Preview.xcconfig.example ios/Config/Preview.xcconfig
```

Keep these values in `Preview.xcconfig`:

- `BAGGER_API_BASE_URL`: `https://native-preview.baggerinv.com`
- `SUPABASE_URL`: the isolated Preview Supabase project URL from the approved configuration
- `SUPABASE_PUBLISHABLE_KEY`: the Preview client-safe publishable key

`Preview.xcconfig` is intentionally ignored by Git, while `Preview.xcconfig.example` is reproducible and safe to commit. Supabase project URLs and publishable keys are client-safe public configuration; they do not grant server authority.

Never place any of the following in the iOS project or local client configuration:

- Supabase service-role or server secret keys
- Bagger certification signing secrets
- rate-limit hashing secrets
- Turnstile secrets
- Vercel tokens or protection-bypass credentials
- Google credentials
- Apple private keys
- OTPs, access tokens, refresh tokens, or Bagger certification proofs

Do not add a Production API, Production Supabase project, runtime discovery mechanism, or fallback. Authentication remains disabled until the app receives the exact certified isolated-development `/api/mobile/v1/health` authority response.

## Run in Simulator

In Xcode:

1. Select the `BaggerInv` scheme.
2. Select **iPhone 17 Pro Max (iOS 26.5)**.
3. Press Run.

The same build can be exercised from the command line:

```sh
xcodebuild \
  -project ios/BaggerInv.xcodeproj \
  -scheme BaggerInv \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max,OS=26.5' \
  build
```

The app must remain on isolated Preview throughout the flow. A configuration error or authority mismatch fails closed and prevents login.

## Run tests

Run the focused native unit tests in Xcode with Product > Test, or use:

```sh
xcodebuild \
  -project ios/BaggerInv.xcodeproj \
  -scheme BaggerInv \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max,OS=26.5' \
  test
```

Tests use injected transports and stores where appropriate. They do not require or authorize Production access.

## Run on a physical iPhone

Physical-device testing uses normal automatic development signing only:

1. Connect and unlock the iPhone, then trust the Mac if prompted.
2. In Xcode Settings > Accounts, sign in with the development Apple ID.
3. Select the `BaggerInv` target, open Signing & Capabilities, enable automatic signing, and choose the development team.
4. Enable Developer Mode on the iPhone if Xcode requests it.
5. For physical UI tests, also enable Settings > Developer > Enable UI Automation.
6. Select the connected iPhone as the run destination and press Run.

A paid Apple Developer Program membership is not required for Simulator use. Do not create distribution signing, TestFlight builds, App Store Connect records, push-notification entitlements, or Production provisioning during Step 2A.

## Architecture and security boundaries

- `App/` owns the single state machine and coordinates launch, authentication, restoration, and sign-out.
- `Configuration/` loads and validates the fixed Preview environment and exact authority attestation.
- `Auth/` owns official Supabase Swift OTP verification and session lifecycle.
- `Captcha/` contains the tightly allowlisted WKWebView used only for Turnstile.
- `Data/` owns participant-scoped read credentials, cache storage, cached-first repositories, the memory-only scoring-current store, and tournament-data lifecycle orchestration.
- `ScoringQueue/` owns the versioned SQLite scoring-intent repository, queue policies, ordered replay, retry scheduling, crash recovery, and conflict/action-required/quarantine states. It contains no credentials and remains separate from the disposable read cache.
- `Networking/` owns typed async HTTP transport and centralized protected headers.
- `Security/` stores the Bagger certification and sensitive session state in Keychain-backed storage.
- `Models/` contains the Step 2A identity contracts, complete protected-read, Leaders, and Step 2I participant-content DTOs, and the complete scoring-current DTO. Calcutta base-10 strings retain their canonical digits as the display/authority representation; `Decimal` is only a bounded convenience value and never replaces those digits.
- `Presentation/` maps canonical read DTOs to UI-ready Today, Matches, Leaders, More, and scoring values without changing match, identity, schedule, standings, career statistics, History, Records, Odds, Net Skins, Calcutta, scoring permission, handicap, net, winner, result, or financial authority.
- `Design/` contains the small native Bagger palette, spacing, card, and typography treatment shared throughout the participant app.
- `Views/` contains the authentication UI, five-tab shell, real Today, Matches, Score, Leaders, and More destinations, read-only Match Detail and Scorecard, full Schedule, Player Passport, Guide/Courses/Rules, History/Records/Odds, local-information products, and Settings.
- `Debug/` contains allowlisted, Debug-only synthetic Today, Matches, scoring, Leaders, and More fixture launchers for deterministic UI/accessibility testing. An ordinary app launch cannot enter this mode.

The app does not read canonical Bagger tables through Supabase. Supabase establishes the native Auth session; the mobile v1 API separately certifies that identity and returns the canonical Bagger Player. Protected API calls require both the Supabase Bearer token and the signed Bagger certification.

## Milestones

- **Step 2A — COMPLETE:** native Preview authority, authentication, certification, canonical identity, secure restoration, and sign-out foundation.
- **Step 2B — COMPLETE:** typed mobile read DTOs, authenticated transport, participant-scoped cache, repositories, coordinator, diagnostics, focused tests, and isolated Preview live QA are proven.
- **Step 2C — COMPLETE:** native five-tab shell, cached-first Today product experience, Simulator validation, and physical-device online/offline validation.
- **Step 2D — COMPLETE:** cached-first Matches tab, canonical Round selection, authenticated golfer Match hero, participant-visible selected-Round list, and native read-only Match Detail.
- **Step 2E — COMPLETE:** memory-only canonical scoring-current reader, owned-Match scoring orientation, format-specific BB/SC/SI controls with explicitly ephemeral drafts, and an official read-only native Scorecard. At that milestone, no official score submission was enabled.
- **Step 2F — COMPLETE:** SQLite-backed scoring intent, atomic local Save & Next, identity/tournament/Match partitioning, stable mutation IDs, ordered foreground replay, retry/backoff, crash recovery, stale-policy enforcement, retained unresolved intent across sign-out, database auditing, and physical-device acceptance are proven.
- **Step 2G — COMPLETE:** official hole-mutation transport, acknowledgement-before-refresh durability, same-ID lost-response recovery, conflict comparison, Keep Official, explicit Reapply with a new mutation ID, correction overlays, and online-only finalization logic are implemented and proven. The isolated-Preview hole workflow was certified through normal acknowledgement, ordered replay, lost-response/idempotent recovery, correction, revision conflict, Keep Official, canonical restoration, and physical-device acceptance. No live finalization was authorized; finalization success, blockers, and lost-response reconciliation remain deterministically verified with injected transport.
- **Step 2H — COMPLETE:** the four-product native Leaders destination presents canonical Tournament Score and Round Scores, overall Player Leaders, official-only Net Skins, and published participant-safe Calcutta with participant/tournament cache isolation, ETag revalidation, publication invalidation, precision-safe financial decoding, Simulator coverage, live isolated-Preview read acceptance, and physical-iPhone online/offline, relaunch, accessibility, and sign-out isolation acceptance.
- **Step 2I — COMPLETE:** the all-native More directory presents full Schedule, authenticated Player Passport, published Tournament Guide/Courses/Rules/Dining/Local Guide/Contacts, canonical Tournament History and year detail, Records, Published Odds, and Settings. Typed participant-bound reads, lazy cached-first loading, per-product and per-year private cache keys, ETag/304 revalidation, fail-closed Guide/Odds publication revocation, safe system handoffs, deterministic coverage, live isolated-Preview acceptance, and physical-iPhone online/offline, relaunch, external-action, and sign-out isolation acceptance are proven.
- **Next — Step 2J:** universal-link-ready routing, app-wide polish and accessibility, approved native identity assets, restrained haptics/animation, and outdoor one-handed usability.

## Step 2B mobile read architecture

The shared read foundation consumes only the certified mobile v1 endpoints:

- `GET /api/mobile/v1/today`
- `GET /api/mobile/v1/matches`
- `GET /api/mobile/v1/leaders`
- `GET /api/mobile/v1/schedule`
- `GET /api/mobile/v1/net-skins`
- `GET /api/mobile/v1/calcutta`
- `GET /api/mobile/v1/passport`
- `GET /api/mobile/v1/guide`
- `GET /api/mobile/v1/history`
- `GET /api/mobile/v1/history/{year}`
- `GET /api/mobile/v1/records`
- `GET /api/mobile/v1/odds`

Every request uses the existing centralized protected transport with both the current Supabase Bearer token and `X-Bagger-Certification`. The credential provider revalidates the active Auth UUID and Bagger proof before returning credentials. The read layer does not use Supabase for direct canonical-table access and does not treat cache metadata as authentication authority.

`TournamentDataCoordinator` owns one repository per product and activates them only after `/session` resolves the canonical participant. Repositories provide a typed value, source, freshness, revision, generated/fetched/validated timestamps, safe error classification, and cache-persistence status. Concurrent refresh calls for one product share the existing in-flight task, and deactivation cancels work before clearing state.

A protected read that returns the structured `MOBILE_API_UNAVAILABLE` code cannot by itself distinguish an invalid authority from an isolated product-source outage. The coordinator therefore hides participant UI, re-runs the exact Step 2A `/health` contract, and resumes the retained participant state only after that attestation succeeds. A failed attestation cancels reads, deletes the active partition, and enters the existing environment-unavailable state. A purely transient foreground health transport failure retains the last verified participant state and eligible offline cache; an incompatible or server-rejected health response still fails closed.

The Step 2B diagnostic is no longer the primary authenticated experience. The app enters the tab shell and Today consumes the same repositories; participant views still never inspect ETags, credentials, cache files, or URL requests.

## Step 2C Today and app shell

The authenticated app uses the fixed native information architecture:

```text
Today | Matches | Score | Leaders | More
```

Today, Matches, Score, Leaders, and More are implemented. `Score` means owned-Match score entry and review—not Tournament Score. `Leaders` owns the tournament competition products, while `More` owns Schedule, Passport, curated participant content, and Settings. Step 2E established the canonical scoring read surface; Step 2F made local Save & Next durable; Step 2G added official isolated-Preview replay, conflict/correction handling, and online-only finalization logic without changing Production authority.

Today preserves the approved product hierarchy:

```text
tournament context
→ server-selected current/next match
→ relationship-filtered personal matches
→ canonical team standings / Tournament Score
→ bounded published schedule for the tournament-local day
```

`TodayPresenter` is deterministic presentation logic. It uses `/today.currentMatch` exactly, filters personal matches only with `authenticatedPlayer.involved`, preserves the server's standings order/ranks/records, formats half points without changing numeric values, and filters schedule-day membership in the IANA tournament timezone. When the full schedule has no event for that local day, the server-projected `/today.immediateSchedule` may appear as **Up Next**. It never selects a different match, calculates standings, infers scoring authority, or accesses Google/Supabase tables.

Each section handles content, loading, empty, and temporary unavailable states independently. Eligible cached content remains visible during refresh and transient failure; a restrained banner communicates cached/stale/offline status. Today pull to refresh delegates to the bounded four-product Today surface and does not eagerly load optional Leaders products. Global environment or authentication invalidation remains owned by the Step 2A coordinator and still fails closed.

The visual treatment translates the current PWA's warm paper, deep evergreen, muted gold, serif display hierarchy, compact cards, strong Tournament Score surface, and accessible status copy into native SwiftUI. The Preview app is deliberately constrained to its audited light appearance until a full native dark palette is designed; this avoids unsafe automatic inversion. System fonts preserve Dynamic Type, and status/winner/offline meaning never relies on color alone.

No player, team, course, or tournament images are bundled in Step 2C. Mobile v1 does not provide canonical image references for every surface (notably match-team IDs), and repository asset licensing is not yet documented well enough to copy marks blindly. Text and neutral initial roundels are the accessible fallback. Asset ownership and a canonical ID registry should be reviewed before shipping branded marks.

### Deterministic Today UI validation

Debug builds accept fixture mode only with both explicit allowlisted arguments:

```text
--bagger-ui-testing --bagger-ui-test-scenario today.standard
```

Other synthetic scenarios cover live/final/no-match, cached-offline, no-cache-offline, and long-content layouts. Missing or unknown scenarios fail to a controlled fixture error and never fall back to live dependencies. Fixture mode constructs no URL session, Supabase client, Keychain state, credentials, OTP, or participant cache. Release builds do not compile the launcher.

The user-mediated live acceptance harness separately adds `--bagger-acceptance-probes`. Only an explicit Debug launch may then expose participant-safe repository readiness and canonical-context equality through accessibility values for XCTest. Ordinary Debug launches and all Release builds expose neither probe; normal VoiceOver labels remain participant-facing.

Run the deterministic Today UI suite with:

```sh
xcodebuild \
  -project ios/BaggerInv.xcodeproj \
  -scheme BaggerInv \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max,OS=26.5' \
  -only-testing:BaggerInvUITests/BaggerInvTodayUITests \
  test
```

The opt-in live Preview tests remain user-mediated and never request an OTP unless the run is separately authorized. Step 2C does not require or authorize Production authentication, participant reads, or scoring.

## Step 2D Matches and Match Detail

The Matches tab follows the approved native hierarchy:

```text
Round selector
→ Your Match hero
→ every participant-visible Match in the selected Round
→ read-only Match Detail
```

`MatchesRepositoryView` observes the existing Step 2B Matches repository. SwiftUI does not construct requests, inject credentials, inspect ETags, decode JSON, or access Supabase. The product uses only the existing protected `GET /api/mobile/v1/matches` projection; Round switching and Match Detail operate from that one loaded DTO and never create per-Match requests. Match Detail uses a typed canonical Match-ID destination, which keeps it suitable for future deep-link routing without coupling navigation to a list-cell instance.

`MatchesPresenter` is deterministic presentation logic. It groups Matches by the contract's canonical Round fields while preserving first-seen server ordering inside each Round. The tournament's `currentRound` is the default when that Round is available. A session-local golfer selection remains stable while navigating to Match Detail and back. If refresh removes that Round, resolution fails safely to the canonical current Round, then the nearest available numbered Round, then the first canonical available Round. The selector is generated only from Rounds actually present in the response; it never hardcodes a tournament schedule or derives Round membership from Match IDs or the device clock.

The Your Match hero trusts only `authenticatedPlayer.involved`. It never matches names, guesses from team membership, or recalculates participant relationships. When more than one Match is unexpectedly marked involved in a Round, the first canonical Match is shown and a generic non-PII Debug diagnostic records the contract anomaly. When none is involved, the selected Round's all-Matches section remains usable. The canonical all-Matches collection stays in server order and includes the involved Match with an explicit **Your Match** treatment so the list remains complete.

Scheduled, live, and completed presentation uses the server's `scheduled`, `inProgress`, and `completed` state plus only contract-supported progress and result values. Known format codes use the existing trusted Bagger mapping (`BB` to Best Ball, `SC` to Scramble, and `SI` to Singles); unknown values remain visible rather than being guessed. Course, tee, tee-time label, player/team names, progress, and final result remain nullable exactly as projected by mobile v1. The app does not infer an absolute tee-time date, calculate a Match winner, derive live golf status, or expose score-entry permissions.

The read-only Match Detail is powered by the same cached Match representation and shows the available Round, format, state, sides/players, course, tee, tee time, progress, and final result. It can subtly identify the authenticated participant from the canonical relationship fields, but it exposes no scoring controls, mutation state, hidden score details, or administrative data. Step 2D does not call `/scoring/current`, create a Match-detail endpoint, or access canonical tables directly.

Matches inherits the Step 2B cached-first lifecycle. Eligible cache is displayed only after Preview authority and participant certification are established, and revalidation continues through the shared authenticated repository. A refresh does not blank populated content. Transient/offline failure keeps a valid cached selected Round and permits cached Match Detail while displaying a restrained stale/offline notice; no-cache failure provides a controlled retry state. Pull to refresh and foreground revalidation delegate to the existing coordinator. Global environment or authentication invalidation still cancels reads, hides participant content, and fails closed through the Step 2A/2B coordinator.

### Current Matches contract boundaries

The current mobile projection is sufficient for the Step 2D Match Center and read-only detail, with these bounded presentation gaps:

- participant-visible non-owned Matches may not include richer golf differential language such as `2 UP`, dormie, or holes remaining, so native does not invent it;
- the projection does not provide a separate participant-facing Match number, Round catalog/status object, or canonical Match-detail image registry;
- an empty Round absent from the `/matches` collection cannot be manufactured for the selector;
- tee-time clock/timezone values do not by themselves authorize inferring a calendar timestamp;
- logos/team colors remain optional design enhancements and are not identity authority.

These are future product/contract enhancements, not reasons to calculate unofficial values in Swift. Owned-Match scoring context is supplied separately by Step 2E's no-store scoring-current service.

### Deterministic Matches UI validation

Debug-only Matches fixtures cover canonical-current-Round selection, scheduled/live/completed Match states, Round switching, a Round without an involved Match, long participant/team/course content, and cached-offline presentation. As with Today fixtures, they require the explicit allowlisted UI-test launch path, construct no live credentials or participant cache, and are excluded from Release behavior.

## Step 2E scoring reader and Scorecard

The Score tab consumes only:

```text
GET /api/mobile/v1/scoring/current
```

Step 2E introduced this reader through the existing protected transport, so every request requires the current Supabase Bearer token and signed `X-Bagger-Certification`. The service supports the contract's optional canonical `matchId` scope, uses `Cache-Control: no-store`, and sends no ETag. The scoring store remains memory-only and activates only after the Step 2A participant session has established the current Auth identity. Sign-out, identity change, or environment re-attestation cancels work and erases its snapshot. Step 2G added scoring POST operations only through the separate durable queue/finalization coordinators described below; the reader itself remains no-store and read-only.

The server remains authoritative for Match selection, participant slots and side order, format, handicap values, strokes, gross and net scores, hole winner, Match progress/result/revisions, and permission. The presentation layer preserves this structure and supports canonical Best Ball (`BB`), Scramble (`SC`), and Singles (`SI`) row shapes. An unknown format remains available for official read-only review but cannot expose editable controls.

Step 2E introduced score controls with the contract-compatible gross range `1...20`, 56-point no-keyboard targets, canonical slot order, and explicitly ephemeral drafts. The current architecture keeps edits ephemeral only until Save & Next: Step 2F then commits the intent atomically to the separate SQLite queue before advancing. Pending intent remains visibly distinct from canonical values, and Step 2G may submit it only through the guarded queue path after exact isolated-Preview authority and participant context are proven. Canonical net, winner, result, permission, and Scorecard values are never changed by an editor draft or queue overlay.

The native Scorecard is canonical-only and groups the phone layout into Front 9 and Back 9 vertical sections. It displays only server-returned gross, strokes, net, winner, progress, and final result values. Selecting a Scorecard hole returns to that hole without creating a draft.

Unlike the Step 2B read products, scoring-current is never written under `ReadCache/v1` or any other disk product cache. During a transient network failure, the current in-memory official snapshot may remain visible for orientation with an explicit offline/scoring-unavailable warning, but editing is disabled and no persistence is implied.

This boundary is deliberate:

- **Step 2E:** canonical read UI plus disposable interaction drafts.
- **Step 2F:** durable SQLite-backed local scoring intent, partitioning, ordered replay, retry, and quarantine semantics from the approved Step 1D reliability specification.
- **Step 2G:** real `/scoring/hole` and `/scoring/finalize` mutation authority, acknowledgements, revision conflicts, corrections, and finalization.

Debug scoring fixtures cover no Match, upcoming/active BB, active SC, active SI, read-only, completed, unknown format, official/unscored holes, long content, offline orientation, and durable-offline queue presentation. Separately gated Step 2G workflow fixtures cover revision-conflict review, Keep Official, Reapply with a replacement mutation ID, a pending correction overlay, finalization readiness/confirmation, and unknown-finalization refresh-only recovery. These fixtures are explicit, synthetic, Debug-only, disconnected from credentials and live transport, and cannot submit an official score.

## Step 2F durable offline scoring queue

Step 2F replaces ephemeral Save & Next drafts with a private SQLite outbox for unresolved golfer scoring intent. The stable live database path is:

```text
Application Support/BaggerInv/ScoringQueue/scoring-queue.sqlite3
```

The queue is explicitly versioned as schema `1`. Schema creation and supported migrations run in place inside transactions. Records that cannot be migrated or decoded safely are quarantined; unresolved scoring intent is never silently discarded to repair an incompatible schema.

SQLite runs in WAL journal mode with `synchronous = FULL`, foreign-key enforcement, a bounded busy timeout, and immediate transactions for inserts and state transitions. Save & Next is successful only after the local transaction commits. Only then may the app say **Saved on iPhone** and advance to the next hole. A failed durable write leaves the editor on the current hole and never implies that the score was saved.

The database, WAL, and sidecar files live in the application-private container with `completeUntilFirstUserAuthentication` data protection. The queue directory is excluded from device backup to keep unresolved intent bound to predictable single-device replay semantics. Credentials remain in Keychain; the scoring queue never stores Bearer or refresh tokens, Bagger certification, OTP or Turnstile values, email, phone, Supabase secrets, or service-role credentials.

Every record is partitioned by the exact verified identity context:

```text
Supabase Auth UUID
→ canonical Bagger Player ID
→ tournament ID
→ Match ID
```

A different Player, a different Auth UUID for the same Player, a tournament switch, or a Match reassignment cannot replay the old partition. Hidden partitions remain durable for review but are not visible or actionable from another identity. Unresolved intent is retained across sign-out: replay stops, the user receives an explicit warning, auth secrets are removed, and the old queue partition remains hidden rather than being deleted.

Queue records use these durable states:

- `queued`: committed locally and eligible for guarded replay.
- `syncing`: one leased request is in flight for the Match.
- `retryable`: a transient or unknown-outcome failure retains the same mutation ID and a persisted retry time.
- `acknowledged`: `accepted: true` is durable, but required canonical refresh may still be pending.
- `conflict`: official state must be refreshed and compared before participant resolution.
- `actionRequired`: authentication, identity, lifecycle, stale-tournament, read-only, or other non-automatic recovery is required.
- `quarantined`: the record is unsafe to submit automatically, including corrupt/unsupported data, idempotency conflict, or stale idempotency uncertainty.
- `resolved`: the intent was explicitly kept official, reapplied as a new mutation, superseded before transmission, abandoned, or proven official-equivalent.

`draft` is not a queue state. It remains unsaved editor state. **Saved on iPhone** means SQLite durably committed the intent; **Syncing**, **Offline**, **Waiting to sync**, and **Needs Review** report queue truth. **Official** is reserved for canonical server acknowledgement followed by the required no-store scoring refresh. The official Scorecard remains server-derived and is never silently overwritten by queued intent.

A stable lowercase UUID mutation ID is created once per new durable intent. An exact duplicate unresolved save reuses its record and mutation ID. A changed same-hole intent may supersede a provably never-transmitted record only by resolving the old record and creating a new record with a new mutation ID. An intent that may have reached the server is retained and retried with its original mutation ID.

Replay is oldest sequence first per Match, with at most one in-flight mutation per Match and a global maximum of two Match workers. A conflict, action-required state, quarantine, unresolved predecessor, queue-health problem, or unsafe identity/snapshot mismatch blocks later mutations for that Match. An accepted acknowledgement is persisted before the mandatory `GET /api/mobile/v1/scoring/current?matchId=...` refresh; if the app exits after acknowledgement, relaunch performs refresh only and does not resubmit. An expired `syncing` lease becomes retryable with unknown outcome and reuses the same mutation ID.

Transient foreground retry delays are approximately 2 seconds, then 5 seconds, followed by `min(15 minutes, 10 seconds × 2^(attemptIndex-3))` with ±20 percent jitter. A longer valid `Retry-After` wins. After eight consecutive transient failures in one foreground session, aggressive retry pauses until a due time, foreground/resume, credible connectivity change, or manual retry. Manual retry requires at least two seconds since the prior attempt. Reachability is only a hint; request outcome remains authoritative.

Age policy is explicit and never silently deletes unresolved intent:

- under 6 hours: normal bounded automatic retry;
- 6–24 hours: mandatory canonical refresh and safe reconciliation before replay;
- 24 hours–7 days: automatic replay stops in `actionRequired/stale`;
- 7 days or more: quarantine as stale idempotency-uncertain and never auto-submit;
- 30- and 90-day ages add maintenance/support metadata, not destructive cleanup.

Revision and snapshot metadata are retained as preconditions, never incremented or treated as official by the client. Safe automatic rebase is bounded to three deterministic metadata-only attempts and only when refreshed official state proves the target blank or unchanged. A real local/official mismatch remains a conflict; idempotency conflict is quarantined and never receives a silent replacement mutation ID.

Step 2F originally exercised the typed `/api/mobile/v1/scoring/hole` transport only through injected deterministic tests. Step 2G connected that transport to the same guarded queue and certified the hole path against isolated Preview. Finalization is still not part of the queue: Step 2G keeps `/api/mobile/v1/scoring/finalize` online-only behind an explicit confirmation and canonical reconciliation probe. Its behavior is deterministically covered with injected transport, but no live finalization was authorized or performed during Step 2G certification. The queue requires no background-execution entitlement: launch and foreground restoration revalidate environment, identity, snapshot, and canonical scoring state before eligible replay resumes.

Scene activity is a shared synchronous safety gate owned above the read, queue, and finalization coordinators. Entering an inactive/background scene immediately makes scoring transport ineligible and then cancels or suspends asynchronous work. Returning to the foreground does not reopen replay merely because a scene event arrived: the app first repeats the exact Preview health attestation and completes the canonical scoring revalidation barrier for the current identity generation. Obsolete activation, health, refresh, queue, or finalization tasks cannot resume transport after a newer background or identity transition.

## Step 2G official scoring workflow

Step 2G keeps the Step 2F ordering rule even on a fast network:

```text
durable SQLite commit
→ ordered Match worker
→ POST /api/mobile/v1/scoring/hole
→ durable acknowledgement
→ GET /api/mobile/v1/scoring/current?matchId=...
→ canonical value agrees
→ Official
```

The central authenticated transport constructs the exact mobile-v1 hole payload from the durable record: stable mutation ID, canonical Match ID, hole, immutable side/slot gross ordering, and expected Match/hole revisions. It never sends client-computed strokes, net, winner, permission, lifecycle, or participant identity. A retry after timeout, process interruption, token refresh, 5xx response, or unknown outcome reuses the original mutation ID. Both a normal acknowledgement and an idempotent acknowledgement are persisted before the mandatory no-store canonical refresh. If the app terminates after acknowledgement, restoration performs refresh only and cannot submit that mutation again.

The official Scorecard always remains server-derived. Pending or conflicted intent is shown as a separate local overlay such as **Saved on iPhone**, never substituted for the official gross value. A correction to an existing official hole is a new durable record with a new mutation ID and current canonical revision preconditions. It remains ordered behind every older unresolved record in the Match.

On `REVISION_CONFLICT`, replay stops for that Match and refreshes canonical scoring state. Canonically equivalent intent resolves without another write. A provably blank/unchanged target may receive at most three metadata-only safe rebases under the Step 1D rules. A real value mismatch remains **Needs Review** and presents the current Official value beside **Your saved score**. **Keep Official** performs no server write. **Reapply My Score** first refreshes and revalidates identity, Match, snapshot, permission, and lifecycle, resolves the original conflict, then atomically creates a new record with a new mutation ID and current revisions. Changed canonical evidence must be shown again before either explicit decision is accepted. `IDEMPOTENCY_CONFLICT` and invalid intent remain quarantined and cannot manufacture replacement IDs.

Known authorization and lifecycle rejections remain durable Match-wide admission blockers. A failed or contradictory follow-up read cannot make scoring writable. Authentication or canonical participant invalidation fails the authenticated shell closed; read-only, authorization-revoked, missing-Match, finalized, stale, conflict, and quarantine states preserve local intent for review rather than deleting it or letting a later hole leapfrog.

Finalization is deliberately separate from the offline hole queue. It is online-only, uses `POST /api/mobile/v1/scoring/finalize`, and requires an explicit confirmation plus an acquired Match guard proving that every local queue state is clear and canonical `canFinalize` is true. A tiny protected finalization probe records its schema version, local probe ID, exact identity partition, Match ID, stable mutation ID, expected Match revision, outcome phase, created/updated timestamps, and an optional bounded server error code. It contains no score payload and is not an offline retry queue. An accepted response is persisted before refresh. An unknown outcome always reconciles through `GET /scoring/current`; canonical final means success, while an active/finalizable Match requires a fresh explicit confirmation before any further POST. No automatic finalization retry loop exists.

The finalization probe is stored privately under Application Support with `completeUntilFirstUserAuthentication` protection and is excluded from backup. Like the scoring queue, it contains no Bearer token, refresh token, certification, OTP, Turnstile token, email, phone, or server credential. Sign-out and environment invalidation cancel transport ownership, preserve unresolved proof, release the Match guard, and prevent a late response from publishing into a new identity lifecycle.

Official hole transport is a permanent capability only for the single compiled isolated-Preview environment. It remains gated by the exact Step 2A health authority, the restored Supabase session, signed Bagger certification, canonical participant/Match identity, server scoring permission, and the queue's identity/tournament/Match partition. There is no environment picker, Production URL, Production Supabase configuration, runtime discovery, or fallback. A failed authority check disables scoring transport. Production mobile remains absent and fail-closed, and native scoring never writes directly to Supabase or another data source.

Release behavior contains no QA Match, hole, gross-score baseline, OTP, credential, or fixture activation path.

## Participant-scoped read cache

Replaceable read snapshots live under:

```text
Application Support/BaggerInv/ReadCache/v1/<SHA-256 partition>/<product>.json
```

The partition digest is SHA-256 over the exact isolated environment, Supabase Auth UUID, canonical Bagger Player ID, and tournament ID. Raw identity values are not used as directory names. This prevents Player A, another Auth account, or another tournament from reusing the active participant's cache.

Each schema-v1 cache envelope records its schema version, partition digest, product, decoded mobile response, ETag, fetch time, and last validation time. Cache reads fail closed unless the envelope, product, partition, contract, and tournament are structurally compatible. Incompatible or corrupt product entries are removed rather than displayed.

Step 2I keeps static products in distinct `<product>.json` files and adds validated `historyDetail-<year>.json` keys for the supported 2017–2026 archive range. The requested year is part of both the cache filename and envelope discriminator, and a History detail response must prove that same canonical year before it can publish.

Writes use Foundation atomic replacement. Cache directories and files use `completeUntilFirstUserAuthentication` file protection, and partition directories are excluded from device backup. A cache-write failure does not replace a valid in-memory network response, but it is surfaced as cache-persistence status.

Sign-out clears memory and makes the active partition inaccessible before the protected auth state is discarded, then deletes the entire partition. Disk deletion first atomically moves the digest directory to a strictly validated hidden quarantine name, so an interrupted or temporarily failed physical deletion cannot be restored by the current or a later process. Partition removal receives one immediate retry; any remaining cleanup failure is retained as a privacy-safe diagnostic and retried on the next data activation. Identity or tournament changes deactivate the old context and prevent its data from becoming current. Definite authentication or authorization failures invalidate access and clear participant state rather than exposing cached private content; a transient Supabase refresh transport failure retains eligible cache as offline data without treating it as new authority.

## Cached-first and HTTP revalidation

Activation follows this sequence:

```text
load compatible participant-scoped cache
→ publish it immediately when available
→ refresh with If-None-Match
→ 304: keep the current DTO and update validation metadata
or
→ 200 + new response: validate and atomically replace the cache envelope
```

ETags are opaque and round-trip exactly. A `304 Not Modified` with no usable cache triggers one unconditional retry; a second `304` is treated as a cache inconsistency. A transport failure preserves an existing value as offline cache. Other safe failures preserve an existing value as stale where appropriate; no cached value is invented when none exists.

The six launch-critical protected-read repositories activate and begin a bounded refresh with the verified participant context, so switching among Leaders products does not create avoidable blank states. The four Today-surface products refresh through the existing bounded Today pull-to-refresh workflow; optional Leaders reads are not re-requested merely because Today refreshes. Step 2I's Passport, Guide, History, Records, Odds, and per-year History-detail repositories activate lazily when their destination is opened: an eligible cache publishes first, one shared request revalidates it, sibling Guide destinations reuse one repository, and unopened optional products create no eager network fan-out. Foreground revalidation refreshes core products older than five minutes and any optional product already activated in the current participant lifecycle. Score and Players share one `/leaders` repository, and all concurrent calls for one product deduplicate. Refresh operations support per-product request deduplication and explicit cancellation. Cancelling a shared product request keeps an existing value intact, clears the in-flight slot, and permits a later refresh. Environment re-attestation invalidates and cancels every in-flight product generation so a late transport completion cannot publish or persist while authority is uncertain.

Nullable properties that the mobile JSON Schemas mark as required use a small Codable wrapper: an explicit JSON `null` remains valid, but an omitted required key fails decoding. HTTP 200 envelopes are also rejected before repository publication when `ok`, API version, or product structure is incompatible.

## READ CACHE versus SCORING QUEUE

These mechanisms are intentionally separate:

- **READ CACHE:** replaceable, server-derived snapshots for Today, Matches, Leaders (including Round Scores), Schedule, Net Skins, Calcutta, Passport, Guide, History and its year details, Records, and Odds. It may be discarded and rebuilt from canonical mobile reads.
- **SCORING QUEUE:** durable private mutation intent governed by the scoring reliability specification. It preserves local-vs-official state, stable idempotency, retry timing, ordering, identity isolation, conflicts, acknowledgements, and crash recovery.

The read cache is never a score source of truth, mutation journal, outbox, or evidence that a score is official. Step 2E's scoring reader deliberately bypasses this cache. Conversely, unresolved scoring intent is never put in `ReadCache/v1`, deleted under the read-cache sign-out policy, or presented as a cached canonical score. The scoring queue is durable user intent; the read cache is replaceable server data.

## Step 2A scope retained

Step 2A includes:

- exact Preview health/authority verification
- native Turnstile challenge
- server-mediated email OTP request
- Supabase Swift OTP verification and secure session restoration
- Bagger certification stored securely in Keychain
- canonical participant `/session` validation
- temporary signed-in diagnostic UI
- secure sign-out

Step 2A intentionally did not include product screens, phone OTP UI, direct Supabase table access, scoring reads or writes, an offline mutation queue, push notifications, TestFlight, or Production native configuration. Steps 2B–2D added the shared read/cache foundation and Today/Matches surfaces; Step 2E added the isolated Preview scoring read surface; Step 2F added durable local scoring intent and guarded replay; Step 2G added participant-facing conflict review, corrections, official isolated-Preview hole replay, and online-only finalization logic; Step 2H added full native Leaders; Step 2I added the all-native More directory and bounded participant-content family. Phone Auth, Production scoring, push, release distribution, direct canonical-table access, and Production native configuration remain out of scope.

## Step 2H full Leaders

Step 2H deliberately integrates only the certified shared handoff commit `a33055fb2fcfbdd018deeb0ee19ac554533d42bd`; it does not merge the website branch. That handoff adds canonical Round Scores to `/api/mobile/v1/leaders` and exposes isolated-Preview `/api/mobile/v1/net-skins` and `/api/mobile/v1/calcutta` through the same participant-safe DTOs used by their server authority. Its presence in native ancestry does not enable Production native operation.

The Leaders tab uses a phone-first four-product selector:

```text
Score    → Tournament Score + canonical Round Scores
Players  → canonical overall Player standings
Net Skins → canonical official-only results
Calcutta → canonical published participant view
```

Score and Players observe the same `LeadersRepository`; switching between them cannot duplicate or locally reconstruct `/leaders`. Round cards display `roundStandings` exactly, including canonical `upcoming`, `inProgress`, and `final` lifecycle and nullable future rank/points. Player order and tied ranks remain in server order, while the authenticated golfer receives only an ID-based visual/accessibility emphasis.

Net Skins and Calcutta use dedicated typed repositories through the existing authenticated `MobileAPIClient`. Net Skins preserves the server's `NOT_CONFIGURED`, `CONFIGURED`, `IN_PROGRESS`, `OFFICIAL`, and `UNAVAILABLE` states and never derives net scores, winners, carryovers, rankings, or value. Calcutta preserves the separate publication and lifecycle states; `UNPUBLISHED` contains no visible market/result. Cache replacement tracks each participant-visible official Net Skins Round plus the published Calcutta representation, so any canonical visibility reduction atomically replaces or fail-closed invalidates the older disk entry.

Calcutta monetary, ownership, and ROI values decode from canonical base-10 strings while retaining their exact original digits and scale. Native currency/percentage formatting groups and decorates those canonical digits directly—even beyond Foundation `Decimal` precision—and does not calculate ownership, purchase price, payout, tournament value, ROI, profit/loss, projection, or settlement. The participant screen contains no Director, publication, auction-management, settlement, War Room, or diagnostic controls.

All three endpoint families use `private, no-cache` with representation ETags. Eligible participant-private cache appears immediately, then revalidates with the actual received `If-None-Match` validator. `304` retains the representation and updates validation metadata; a changed `200` validates and atomically replaces it. Transient offline failure keeps eligible content with explicit stale copy—especially for financial data. Cache identity remains:

```text
Preview environment
→ Supabase Auth UUID
→ canonical Bagger Player ID
→ tournament ID
→ product
```

Sign-out deletes the disposable Leaders, Net Skins, and Calcutta read partition without touching unresolved durable scoring intent. Account and tournament switches cannot reuse another partition.

The asset audit considered the existing Bagger and team marks, but `/leaders` does not project canonical asset keys. Step 2H therefore uses authoritative text and neutral initials rather than fragile name-to-logo matching. No new image asset is bundled and app-size impact is effectively zero.

The V1 parity audit intentionally defers Round Player leaderboards and richer team-Round details until a bounded participant mobile contract exists. Net Skins/Calcutta storylines remain PWA presentation; Step 2I promotes Published Odds from deferred curated content to a bounded native read, while narrative Championship Insights remains deferred. Match Center intelligence remains in Today/Matches, and all War Room/Director surfaces are admin-only. Those documented Post-V1 or separate-product boundaries do not require Swift to acquire server authority.

## Step 2I all-native More and participant content

Step 2I deliberately imports only the certified shared participant-content handoff chain; it does not merge the website branch. The shared commits and their native cherry-picks are:

- `d1419a7` → `2009446` — export the bounded participant-content contracts and Preview readers;
- `5fa76af` → `51ec5e6` — require every participant-content authority in the native Preview gate;
- `c367522` → `e9840e3` — accept the canonical Guide Round labels; and
- `1ee626d` → `357be51` — restore canonical History-detail ranks.

Their presence in native ancestry does not enable Production native operation. Every protected participant-content request still requires the current Supabase Bearer token plus `X-Bagger-Certification`; the server alone resolves the verified Auth UUID to the canonical Player and active tournament. The client cannot select a Player, tournament, publication state, environment, or authority. There is no direct Supabase-table access and no fallback to Production, Google, rendered PWA content, browser Passport cookies, or another identity source.

The More tab is now a native SwiftUI directory:

```text
Tournament  → Schedule, Tournament Guide, Courses, Rules & Formats
My Bagger   → Player Passport, Tournament History, Records
Competition → Published Odds
Local       → Dining, Local Guide, Important Contacts
App         → Settings
```

Every listed destination is native. Tournament Guide, Courses, Rules, Dining, Local Guide, and Contacts share the one structured `/guide` representation; Schedule remains solely `/schedule`. The app embeds neither web content nor an authenticated token bridge. Validated HTTPS, phone, text, email, and Apple Maps actions may deliberately leave the app through the corresponding system handler, but arbitrary URL schemes and malformed source values do not become actions.

`/passport` is bound to the authenticated canonical Player and presents current tournament context plus the server-supplied career summary, honors, rankings, aggregate scoring and Match-progression profiles, Tournament History, BB/SC/SI performance, Records Held, Captain Legacy, Biggest Rival, Draft History, and Top Partners. `/history` preserves the canonical archive order, while bounded `/history/{year}` destinations for 2017–2026 show only server-projected teams, rosters, Rounds, Matches, standings, awards, and available verified scorecards. `/records` preserves the canonical category, record, and complete holder order and uses stable identifiers rather than display-name matching. `/odds` displays only explicitly published stored snapshots in canonical phase order.

Swift performs presentation formatting, safe grouping, and accessibility labeling only. It does not recalculate career statistics, rankings, records, holder identity, historical winners, probabilities, American odds, expected points, expected records, or average finishes. It does not derive Odds from Matches or scores. Full Schedule preserves the canonical event order and tournament timezone; absolute timestamps may drive `Now`, `Next`, and ended display state, but local clocks or the device clock never become tournament authority.

Passport, Guide, History, Records, Odds, and year details use the shared cached-first repository and opaque representation ETags. They load on demand, publish compatible private cache immediately, send the actual validator through `If-None-Match`, retain the DTO and update validation metadata on `304`, and validate plus atomically replace it on a changed `200`. Transient failure retains eligible content with explicit cached/stale/offline messaging; no-cache failure remains a controlled retry state.

Guide and Odds add publication-revocation safety. A canonical `PUBLISHED` → `UNPUBLISHED` response has a changed representation ETag and an empty hidden-content shape. Native treats that visibility reduction as security-sensitive: it atomically replaces the older cache, or removes that product (and, if necessary, quarantines the disposable partition) before publishing the reduced representation. A failed persistence operation cannot leave previously published Guide or Odds content eligible for a later offline relaunch.

All Step 2I snapshots remain private inside the existing SHA-256 partition over Preview environment, Supabase Auth UUID, canonical Bagger Player ID, and tournament ID. Files retain complete-until-first-user-authentication protection and backup exclusion. Account or tournament changes cannot reuse another partition. Settings shows only the signed-in participant/tournament summary, a Player Passport link, the explicit Preview environment, app version/build, and Sign Out. Sign Out first closes scoring admission and warns rather than silently discarding unresolved scoring intent; after confirmation it clears in-memory participant content, atomically makes the disposable read partition inaccessible, removes certification/Auth state, and returns to the native sign-in screen. Durable unresolved scoring intent remains separately partitioned and is not deleted as read cache.

Step 2I intentionally adds no downloaded or bundled player, team, tournament, or course artwork. The Guide contract's validated repository asset keys are preserved as inert future presentation metadata; Swift does not interpret them as filesystem paths or arbitrary remote URLs. Current More screens use authoritative text and SF Symbols, keeping asset-size impact effectively zero. A curated native catalog requires canonical ID/key mapping plus ownership/licensing review and remains Step 2J work.

Deterministic unit and UI coverage exercises rich and empty Passport states, full and offline Schedule, published/withdrawn Guide, deep native Guide sections, long content and accessibility sizes, History archive/year detail, Records, published/unpublished Odds, cache identity/year validation, lazy request sharing, ETag/304 behavior, publication withdrawal, environment cancellation, and sign-out deletion. Live isolated-Preview acceptance proved all Step 2I reads and real ETag/304 revalidation. Physical-iPhone acceptance proved cached offline browsing after force-quit/relaunch, refresh recovery after connectivity returned, system Directions/Phone/Email/website handoffs, and sign-out/relaunch with no participant content visible.

Round Player leaderboards, richer non-owned Match/scorecard detail, a separate Player directory/profile product, narrative Championship Insights, notifications and notification settings, phone/SMS Auth, and all Director/War Room/editing/publication controls remain deferred or excluded. Production native activation remains a separate explicit release gate.

## Next step

**Step 2J — deep links, polish, accessibility, and assets** is next. It should complete universal-link-ready routing, broader app-wide Dynamic Type/VoiceOver/contrast/Reduce Motion review, an approved canonical native identity-asset catalog, restrained haptics and motion, final empty/error copy, and one-handed outdoor usability without changing mobile authority or enabling Production.
