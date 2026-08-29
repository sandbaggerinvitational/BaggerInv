# Bagger Invitational for iOS

This directory contains the native SwiftUI foundation for **Bagger Preview**. Step 2A established the isolated Preview environment, email OTP, Supabase session, Bagger identity certification, canonical participant resolution, secure restoration, and sign-out. Step 2B adds the authenticated mobile read/cache implementation. It is not yet the full tournament application.

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

The app is intentionally presented as **Bagger Preview**, and the bootstrap UI keeps a visible `PREVIEW` indicator.

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
5. Select the connected iPhone as the run destination and press Run.

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
- `Views/` contains temporary bootstrap and diagnostic SwiftUI, not final product screens.

The app does not read canonical Bagger tables through Supabase. Supabase establishes the native Auth session; the mobile v1 API separately certifies that identity and returns the canonical Bagger Player. Protected API calls require both the Supabase Bearer token and the signed Bagger certification.

## Milestones

- **Step 2A — COMPLETE:** native Preview authority, authentication, certification, canonical identity, secure restoration, and sign-out foundation.
- **Step 2B — COMPLETE:** typed mobile read DTOs, authenticated transport, participant-scoped cache, repositories, coordinator, diagnostics, focused tests, and isolated Preview live QA are proven.

## Step 2B mobile read architecture

The shared read foundation consumes only the certified mobile v1 endpoints:

- `GET /api/mobile/v1/today`
- `GET /api/mobile/v1/matches`
- `GET /api/mobile/v1/leaders`
- `GET /api/mobile/v1/schedule`

Every request uses the existing centralized protected transport with both the current Supabase Bearer token and `X-Bagger-Certification`. The credential provider revalidates the active Auth UUID and Bagger proof before returning credentials. The read layer does not use Supabase for direct canonical-table access and does not treat cache metadata as authentication authority.

`TournamentDataCoordinator` owns one repository per product and activates them only after `/session` resolves the canonical participant. Repositories provide a typed value, source, freshness, revision, generated/fetched/validated timestamps, safe error classification, and cache-persistence status. Concurrent refresh calls for one product share the existing in-flight task, and deactivation cancels work before clearing state.

A protected read that returns the structured `MOBILE_API_UNAVAILABLE` code cannot by itself distinguish an invalid authority from an isolated product-source outage. The coordinator therefore hides participant UI, re-runs the exact Step 2A `/health` contract, and resumes the retained participant state only after that attestation succeeds. A failed attestation cancels reads, deletes the active partition, and enters the existing environment-unavailable state. A purely transient foreground health transport failure retains the last verified participant state and eligible offline cache; an incompatible or server-rejected health response still fails closed.

The temporary authenticated diagnostic exposes data-foundation state and an explicit **Refresh All** action. It does not implement the final Today, Matches, Leaders, or Schedule screens.

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

Step 2A intentionally did not include product screens, phone OTP UI, direct Supabase table access, scoring reads or writes, an offline mutation queue, push notifications, TestFlight, or Production native configuration. Step 2B adds only the shared read/cache foundation and a temporary diagnostic; those exclusions otherwise remain in force.

## Next step

**Step 2C — Today** may build the first real product screen after the Step 2B validation gate passes. It should consume the shared repositories rather than constructing HTTP requests in SwiftUI, preserve cached-first and freshness behavior, and follow the approved hierarchy: tournament context, current/next match hero, your matches, tournament score, today's schedule, and optional tournament pulse. It must not introduce scoring mutations or merge the read cache with the future scoring queue.
