# Bagger Invitational for iOS

This directory contains the native SwiftUI application for **Bagger Preview**. Step 2A established isolated Preview authentication and canonical participant identity. Step 2B added the authenticated mobile read/cache engine. Step 2C added the first real participant product surface, Today, inside the approved five-tab application shell. Step 2D replaces the Matches placeholder with a cached-first native Match Center and read-only Match Detail.

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
- `Data/` owns participant-scoped read credentials, cache storage, cached-first repositories, and tournament-data lifecycle orchestration.
- `Networking/` owns typed async HTTP transport and centralized protected headers.
- `Security/` stores the Bagger certification and sensitive session state in Keychain-backed storage.
- `Models/` contains the Step 2A identity contracts and complete Step 2B read DTOs.
- `Presentation/` maps canonical read DTOs to UI-ready Today and Matches values without changing match, identity, schedule, or standings authority.
- `Design/` contains the small native Bagger palette, spacing, card, and typography treatment shared by Today and Matches.
- `Views/` contains the authentication UI, five-tab shell, real Today and Matches destinations, read-only Match Detail, and restrained placeholders for later products.
- `Debug/` contains allowlisted, Debug-only synthetic Today and Matches fixture launchers for deterministic UI/accessibility testing. An ordinary app launch cannot enter this mode.

The app does not read canonical Bagger tables through Supabase. Supabase establishes the native Auth session; the mobile v1 API separately certifies that identity and returns the canonical Bagger Player. Protected API calls require both the Supabase Bearer token and the signed Bagger certification.

## Milestones

- **Step 2A — COMPLETE:** native Preview authority, authentication, certification, canonical identity, secure restoration, and sign-out foundation.
- **Step 2B — COMPLETE:** typed mobile read DTOs, authenticated transport, participant-scoped cache, repositories, coordinator, diagnostics, focused tests, and isolated Preview live QA are proven.
- **Step 2C — COMPLETE:** native five-tab shell, cached-first Today product experience, Simulator validation, and physical-device online/offline validation.
- **Step 2D — COMPLETE:** cached-first Matches tab, canonical Round selection, authenticated golfer Match hero, participant-visible selected-Round list, and native read-only Match Detail.

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

Today and Matches are implemented; Score, Leaders, and More remain intentionally restrained placeholders. `Score` means future score entry—not Tournament Score—and exposes no scoring action in Step 2D.

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

These are future product/contract enhancements, not reasons to calculate unofficial values in Swift. Owned-Match scoring context remains explicitly deferred to Step 2E.

### Deterministic Matches UI validation

Debug-only Matches fixtures cover canonical-current-Round selection, scheduled/live/completed Match states, Round switching, a Round without an involved Match, long participant/team/course content, and cached-offline presentation. As with Today fixtures, they require the explicit allowlisted UI-test launch path, construct no live credentials or participant cache, and are excluded from Release behavior.

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

## READ CACHE versus future SCORING QUEUE

These mechanisms are intentionally separate:

- **READ CACHE:** replaceable, server-derived snapshots for Today, Matches, Leaders, and Schedule. It may be discarded and rebuilt from canonical mobile reads.
- **FUTURE SCORING QUEUE:** durable private mutation intent governed by the scoring reliability specification. It must preserve local-vs-official state, idempotency, retries, conflicts, and acknowledgements.

The read cache is never a score source of truth, mutation journal, outbox, or evidence that a score is official. Step 2B does not implement scoring reads, scoring writes, or the Step 1D durable mutation queue.

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

Step 2A intentionally did not include product screens, phone OTP UI, direct Supabase table access, scoring reads or writes, an offline mutation queue, push notifications, TestFlight, or Production native configuration. Steps 2B–2D add only the shared read/cache foundation and the Today/Matches read surfaces; phone Auth, scoring, push, release distribution, direct canonical-table access, and Production native configuration remain out of scope.

## Next step

**Step 2E — Native scoring read UI + Scorecard** is the next planned implementation. It should consume `GET /api/mobile/v1/scoring/current` to establish the owned-Match scoring context, hole navigation, format-specific player score rows, prior-hole review, and canonical read-only/final scorecard states. It must preserve the Step 2A authority/session boundary and remain separate from Step 2F's durable offline mutation queue and Step 2G's scoring mutation, conflict, correction, and finalization behavior.
