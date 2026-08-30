# Bagger Invitational for iOS

This directory contains the native SwiftUI application for **Bagger Preview**. Step 2A established isolated Preview authentication and canonical participant identity. Step 2B added the authenticated mobile read/cache engine. Step 2C added Today and the five-tab application shell. Step 2D added the cached-first Match Center and read-only Match Detail. Step 2E added the first canonical owned-Match scoring reader and a native, read-only official Scorecard. Step 2F adds durable, identity-partitioned scoring intent and foreground replay without changing server scoring authority or enabling finalization.

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
- `SUPABASE_PUBLISHABLE_KEY`: the Preview client-safe publishable/anon key

`Preview.xcconfig` is intentionally ignored by Git, while `Preview.xcconfig.example` is reproducible and safe to commit. Supabase project URLs and publishable/anon keys are client-safe public configuration; they do not grant server authority.

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
- `Models/` contains the Step 2A identity contracts, complete Step 2B read DTOs, and the complete scoring-current DTO.
- `Presentation/` maps canonical read DTOs to UI-ready Today, Matches, and scoring values without changing match, identity, schedule, standings, scoring permission, handicap, net, winner, or result authority.
- `Design/` contains the small native Bagger palette, spacing, card, and typography treatment shared by Today and Matches.
- `Views/` contains the authentication UI, five-tab shell, real Today, Matches, and Score destinations, read-only Match Detail and Scorecard, and restrained placeholders for later products.
- `Debug/` contains allowlisted, Debug-only synthetic Today, Matches, and scoring fixture launchers for deterministic UI/accessibility testing. An ordinary app launch cannot enter this mode.

The app does not read canonical Bagger tables through Supabase. Supabase establishes the native Auth session; the mobile v1 API separately certifies that identity and returns the canonical Bagger Player. Protected API calls require both the Supabase Bearer token and the signed Bagger certification.

## Milestones

- **Step 2A — COMPLETE:** native Preview authority, authentication, certification, canonical identity, secure restoration, and sign-out foundation.
- **Step 2B — COMPLETE:** typed mobile read DTOs, authenticated transport, participant-scoped cache, repositories, coordinator, diagnostics, focused tests, and isolated Preview live QA are proven.
- **Step 2C — COMPLETE:** native five-tab shell, cached-first Today product experience, Simulator validation, and physical-device online/offline validation.
- **Step 2D — COMPLETE:** cached-first Matches tab, canonical Round selection, authenticated golfer Match hero, participant-visible selected-Round list, and native read-only Match Detail.
- **Step 2E — COMPLETE:** memory-only canonical scoring-current reader, owned-Match scoring orientation, format-specific BB/SC/SI controls with explicitly ephemeral drafts, and an official read-only native Scorecard. No official score submission is enabled.
- **Step 2F — COMPLETE:** SQLite-backed scoring intent, atomic local Save & Next, identity/tournament/Match partitioning, stable mutation IDs, ordered foreground replay, retry/backoff, crash recovery, stale-policy enforcement, retained unresolved intent across sign-out, database auditing, and physical-device acceptance are proven.

## Step 2B mobile read architecture

The shared read foundation consumes only the certified mobile v1 endpoints:

- `GET /api/mobile/v1/today`
- `GET /api/mobile/v1/matches`
- `GET /api/mobile/v1/leaders`
- `GET /api/mobile/v1/schedule`

Every request uses the existing centralized protected transport with both the current Supabase Bearer token and `X-Bagger-Certification`. The credential provider revalidates the active Auth UUID and Bagger proof before returning credentials. The read layer does not use Supabase for direct canonical-table access and does not treat cache metadata as authentication authority.

`TournamentDataCoordinator` owns one repository per product and activates them only after `/session` resolves the canonical participant. Repositories provide a typed value, source, freshness, revision, generated/fetched/validated timestamps, safe error classification, and cache-persistence status. Concurrent refresh calls for one product share the existing in-flight task, and deactivation cancels work before clearing state.

A protected read that returns the structured `MOBILE_API_UNAVAILABLE` code cannot by itself distinguish an invalid authority from an isolated product-source outage. The coordinator therefore hides participant UI, re-runs the exact Step 2A `/health` contract, and resumes the retained participant state only after that attestation succeeds. A failed attestation cancels reads, deletes the active partition, and enters the existing environment-unavailable state. A purely transient foreground health transport failure retains the last verified participant state and eligible offline cache; an incompatible or server-rejected health response still fails closed.

The Step 2B diagnostic is no longer the primary authenticated experience. The app enters the tab shell and Today consumes the same repositories; participant views still never inspect ETags, credentials, cache files, or URL requests.

## Step 2C Today and app shell

The authenticated app uses the fixed native information architecture:

```text
Today | Matches | Score | Leaders | More
```

Today, Matches, and Score are implemented; Leaders and More remain intentionally restrained placeholders. `Score` means owned-Match score entry and review—not Tournament Score. Step 2E exposes canonical scoring state and ephemeral interaction only; no official submission exists yet.

Today preserves the approved product hierarchy:

```text
tournament context
→ server-selected current/next match
→ relationship-filtered personal matches
→ canonical team standings / Tournament Score
→ bounded published schedule for the tournament-local day
```

`TodayPresenter` is deterministic presentation logic. It uses `/today.currentMatch` exactly, filters personal matches only with `authenticatedPlayer.involved`, preserves the server's standings order/ranks/records, formats half points without changing numeric values, and filters schedule-day membership in the IANA tournament timezone. When the full schedule has no event for that local day, the server-projected `/today.immediateSchedule` may appear as **Up Next**. It never selects a different match, calculates standings, infers scoring authority, or accesses Google/Supabase tables.

Each section handles content, loading, empty, and temporary unavailable states independently. Eligible cached content remains visible during refresh and transient failure; a restrained banner communicates cached/stale/offline status. Pull to refresh delegates once to `TournamentDataCoordinator.refreshAll()`. Global environment or authentication invalidation remains owned by the Step 2A coordinator and still fails closed.

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

It uses the existing protected transport, so every request requires the current Supabase Bearer token and signed `X-Bagger-Certification`. The service supports the contract's optional canonical `matchId` scope, uses `Cache-Control: no-store`, sends no ETag, and adds no scoring POST method. The scoring store is memory-only and activates only after the Step 2A participant session has established the current Auth identity. Sign-out, identity change, or environment re-attestation cancels work and erases its snapshot.

The server remains authoritative for Match selection, participant slots and side order, format, handicap values, strokes, gross and net scores, hole winner, Match progress/result/revisions, and permission. The presentation layer preserves this structure and supports canonical Best Ball (`BB`), Scramble (`SC`), and Singles (`SI`) row shapes. An unknown format remains available for official read-only review but cannot expose editable controls.

Score controls use the contract-compatible gross range `1...20`, 56-point no-keyboard targets, and canonical slot order. Changes are deliberately ephemeral, in-memory UI drafts labeled **Edited · Not saved**. They are neither official nor durable, never change canonical net/winner/result presentation, and are discarded by explicit refresh, structural/snapshot/permission change, sign-out, or app termination. The disabled **Save & Next** control explains that official submission is not available in this build.

The native Scorecard is canonical-only and groups the phone layout into Front 9 and Back 9 vertical sections. It displays only server-returned gross, strokes, net, winner, progress, and final result values. Selecting a Scorecard hole returns to that hole without creating a draft.

Unlike the Step 2B read products, scoring-current is never written under `ReadCache/v1` or any other disk product cache. During a transient network failure, the current in-memory official snapshot may remain visible for orientation with an explicit offline/scoring-unavailable warning, but editing is disabled and no persistence is implied.

This boundary is deliberate:

- **Step 2E:** canonical read UI plus disposable interaction drafts.
- **Step 2F:** durable SQLite-backed local scoring intent, partitioning, ordered replay, retry, and quarantine semantics from the approved Step 1D reliability specification.
- **Step 2G:** real `/scoring/hole` and `/scoring/finalize` mutation authority, acknowledgements, revision conflicts, corrections, and finalization.

Debug scoring fixtures cover no Match, upcoming/active BB, active SC, active SI, read-only, completed, unknown format, official/unscored holes, long content, and offline orientation. Fixture mode remains explicit, synthetic, Debug-only, and disconnected from credentials and live transport.

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

Step 2F may exercise the typed `/api/mobile/v1/scoring/hole` transport only through injected deterministic tests unless an isolated Preview mutation is separately authorized. Finalization is not part of this queue and `/api/mobile/v1/scoring/finalize` remains online-only future work for Step 2G. The queue requires no background-execution entitlement: launch and foreground restoration revalidate environment, identity, snapshot, and canonical scoring state before eligible replay resumes.

## Participant-scoped read cache

Replaceable read snapshots live under:

```text
Application Support/BaggerInv/ReadCache/v1/<SHA-256 partition>/<product>.json
```

The partition digest is SHA-256 over the exact isolated environment, Supabase Auth UUID, canonical Bagger Player ID, and tournament ID. Raw identity values are not used as directory names. This prevents Player A, another Auth account, or another tournament from reusing the active participant's cache.

Each schema-v1 cache envelope records its schema version, partition digest, product, decoded mobile response, ETag, fetch time, and last validation time. Cache reads fail closed unless the envelope, product, partition, contract, and tournament are structurally compatible. Incompatible or corrupt product entries are removed rather than displayed.

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

All four products refresh after activation. The diagnostic's explicit refresh revalidates all products, while foreground refresh revalidates products whose last validation is at least five minutes old. Refresh operations support per-product request deduplication and explicit cancellation. Cancelling the shared product request affects its current waiters, keeps an existing value intact, clears the in-flight slot, and permits a later refresh. Environment re-attestation invalidates and cancels every in-flight product generation so a late transport completion cannot publish or persist while authority is uncertain.

Nullable properties that the mobile JSON Schemas mark as required use a small Codable wrapper: an explicit JSON `null` remains valid, but an omitted required key fails decoding. HTTP 200 envelopes are also rejected before repository publication when `ok`, API version, or product structure is incompatible.

## READ CACHE versus SCORING QUEUE

These mechanisms are intentionally separate:

- **READ CACHE:** replaceable, server-derived snapshots for Today, Matches, Leaders, and Schedule. It may be discarded and rebuilt from canonical mobile reads.
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

Step 2A intentionally did not include product screens, phone OTP UI, direct Supabase table access, scoring reads or writes, an offline mutation queue, push notifications, TestFlight, or Production native configuration. Steps 2B–2D added the shared read/cache foundation and Today/Matches surfaces; Step 2E added the isolated Preview scoring read surface; Step 2F adds durable local scoring intent and guarded replay. Phone Auth, participant-facing conflict/finalization workflows, Production scoring, push, release distribution, direct canonical-table access, and Production native configuration remain out of scope.

## Future Leaders product requirement

Before Step 2H, native Leaders must receive a fresh participant-facing PWA parity audit. The eventual native experience must include:

- Tournament Score;
- Player Leaders;
- Round Scores when canonical mobile support exists;
- Net Skins from a participant-safe canonical server projection;
- Calcutta from a participant-safe published server projection, without Director/admin controls.

Native must not recreate leaderboard, Net Skins, Round Score, Calcutta auction, settlement, or publication authority in Swift. If Net Skins or Calcutta are not yet available through mobile v1, the smallest safe read contract must be classified and established before Step 2H rather than silently narrowing the native Leaders product.

## Next step

**Step 2G — Official scoring mutations, conflicts, corrections, and finalization** is next after Step 2F final acceptance. It should connect the proven queue to the existing `/api/mobile/v1/scoring/hole` and `/api/mobile/v1/scoring/finalize` contracts, preserve stable mutation IDs across uncertain outcomes, reconcile canonical acknowledgements and revisions, expose Keep Official and explicit Reapply flows, and keep finalization online-only. It must not weaken Preview authority, identity partitioning, server permission, or canonical scoring ownership.
