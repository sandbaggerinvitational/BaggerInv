# Bagger Mobile API v1

Base path: `/api/mobile/v1`

The v1 API is an additive native-client contract. It does not replace browser Supabase SSR cookies, Player Passport cookies, or scoring-session cookies.

## Environment

Mobile v1 is enabled only when the server proves the complete isolated-development authority combination. The proof requires an ordinary Vercel Preview runtime, the exact Preview Supabase project for both Auth and protected identity RPCs, the isolated Preview workbook, Supabase participant identity and scoring service, every mobile read/write selector set to Supabase, a dedicated native-certification signing key, and the complete Preview native-Auth rate-limit plus Supabase Turnstile configuration. It also requires non-secret deployment attestations that provider-side Supabase signup is disabled and both public OTP mutation paths have dedicated IP edge limits. The assertion requires all Production foundation, cutover, shadow, scoring-rehearsal, scoring-ingress, public-read, Google-mirror, Odds-publication, and Auth-user-creation flags to remain disabled. `VERCEL_ENV=preview` by itself is never sufficient.

Production, Production-shadow, local development without the Preview authority, a Preview runtime pointed at Production Supabase, mismatched Auth/identity origins, incomplete configuration, and authority outages return `503 MOBILE_API_UNAVAILABLE`. There is no fallback to Passport, Google Sheets, Production Supabase, or another identity authority.

The dedicated public native-development Vercel project adds a host boundary. `MOBILE_NATIVE_DEVELOPMENT_ENABLED=true` and `MOBILE_NATIVE_DEVELOPMENT_HOSTNAME=<exact-public-development-host>` are valid only on the source-pinned native-development project; that project returns `404` for every non-mobile-v1 path and for requests whose Host does not exactly match the configured hostname. `VERCEL_PROJECT_ID` is supplied by Vercel and must match the project ID pinned in server code; it is not client configuration. No Vercel protection-bypass secret is part of the mobile contract.

The scoring routes add a second fail-closed gate: both the canonical scoring authority and scoring read source must intentionally resolve to Preview Supabase. Otherwise they return `503 SCORING_UNAVAILABLE`. Mobile scoring never falls back to Google or browser scoring credentials.

## Authentication

The participant data and scoring routes require both a Supabase access token and the Bagger proof returned only after OTP certification:

```http
Authorization: Bearer <supabase-access-token>
X-Bagger-Certification: <opaque-signed-proof>
```

`GET /health`, `GET /auth/captcha`, and `POST /auth/otp/request` are intentionally unauthenticated. `POST /auth/otp/certify` requires the Supabase Bearer token and challenge but cannot require a proof it is responsible for creating.

For protected routes, the server validates the Bearer token with Supabase Auth, requires a bounded `signed-proof-v1` Bagger certification, uses only the verified Auth user UUID, and resolves that UUID through the existing protected `participant_identity.user_player_links` authority to the canonical `scoring_authority.players.player_id`. The proof is HMAC-bound server-side to that exact Auth UUID, Player ID, and tournament and exposes none of them. Client query parameters, Auth metadata, and arbitrary identity headers do not select the Player.

A valid Bearer identity is not itself scoring permission. Every scoring operation separately checks canonical tournament membership, Match participation, `can_score`, revocation, permission revision, scoring lock, and Match lifecycle. No separate native scoring credential or long-lived scoring capability exists.

### Native OTP bootstrap

Native OTP is an additive mobile-v1 boundary. It does not redirect or change browser email OTP, browser phone OTP, Supabase SSR cookies, Player Passport, or browser certification behavior.

Email is ready for isolated native development. Phone is represented by the same `method` discriminator but is reserved: `method: "phone"` currently returns `409 AUTH_METHOD_UNAVAILABLE`. A future phone implementation must resolve to the same preauthorized Supabase Auth UUID, the same `participant_identity.user_player_links` row, and the same canonical Player ID as email; it must not create a second Auth/Player relationship.

#### `GET /auth/captcha`

Authentication: none.

The Preview Supabase project has CAPTCHA protection enabled. The native app loads this narrow no-store HTML response in a `WKWebView`, as recommended for native mobile Turnstile clients, and receives the resulting one-time token only through the `baggerTurnstile` WebKit message handler. The page has a restrictive Content Security Policy, contains only the client-safe Turnstile site key, never places the token in a URL, and is available only after the full isolated-development gate passes.

The token must be used immediately in one `POST /auth/otp/request`. Supabase Auth performs the authoritative server-side Turnstile validation using the secret configured inside Supabase; neither the Turnstile secret nor a Supabase server key enters iOS.

#### `POST /auth/otp/request`

Authentication: none. Content type: `application/json`.

Request:

```json
{
  "method": "email",
  "identifier": "approved.participant@example.com",
  "captchaToken": "opaque-one-time-turnstile-token"
}
```

`captchaToken` is required and bounded. Missing or malformed tokens are rejected before eligibility or provider work. For an approved delivery, it is passed once to Supabase Auth and cryptographically validated there before Supabase sends an OTP. Unknown identifiers receive the same response without invoking Supabase, so a token-shaped value on an unapproved request is not falsely described as provider-validated. The dedicated public edge IP limit plus the server-process hashed-client limiter bound this unauthenticated path before the canonical database limiter; the database remains authoritative for identifier/player cooldown and send limits. Request bodies are read through an 8 KiB streaming ceiling even when `Content-Length` is absent or untrusted. Unknown request fields are rejected. The client cannot submit a Player ID, expected Auth UUID, verification type, enrollment choice, or provider administration value.

The server normalizes the identifier, applies the existing canonical Participant eligibility authorization, computes the existing server-secret client/identifier rate-limit hashes, then re-resolves the authorized Auth UUID through current `user_player_links` and active tournament membership immediately before delivery. It asks Supabase to send an ordinary email sign-in OTP only when the Auth UUID, Player ID, tournament, and active membership still match. Native development accepts only the `email` verification type and invokes Supabase with `shouldCreateUser:false`. Preview Supabase provider-side new-user signup must also be disabled, so bypassing this endpoint with the public project URL/key cannot create an Auth user. Controlled authorized first-login/signup semantics remain a separate browser/Production concern and are disabled for native development.

The public result is intentionally the same shape for approved and unapproved identifiers (`202`):

```json
{
  "ok": true,
  "apiVersion": "v1",
  "data": {
    "accepted": true,
    "method": "email",
    "verificationType": "email",
    "challengeId": "11111111-1111-4111-8111-111111111111",
    "expiresInSeconds": 900,
    "resendAfterSeconds": 60,
    "message": "If that email is approved for The Bagger, a sign-in code will be sent."
  }
}
```

`accepted` acknowledges only that the enumeration-safe request was processed. It does not prove that the identifier exists, is eligible, or received an OTP. `challengeId` is opaque; it never reveals the expected Auth UUID, Player ID, eligibility result, or Supabase administration details.

#### Native Supabase verification

After requesting an OTP, the native client verifies the emailed code directly with the Preview Supabase Auth SDK. A successful provider verification creates the native Supabase session and access token, but raw Supabase authentication is not Bagger participant certification.

Supabase client configuration for the future Preview app consists only of the Preview project URL and its publishable/anon key. Both are **client-safe public configuration** and may be supplied through an uncommitted/generated Preview `.xcconfig`. `SUPABASE_SCORING_MIRROR_SECRET_KEY`, service-role keys, rate-limit secrets, Vercel credentials, and every other secret are **server secrets** and must never be included in iOS.

#### `POST /auth/otp/certify`

Authentication: required Bearer token. Content type: `application/json`.

Request:

```json
{
  "challengeId": "11111111-1111-4111-8111-111111111111"
}
```

The server verifies the Bearer token with Preview Supabase Auth, reads its verified Auth UUID and verified email, applies a server-secret-hashed Auth-user/client limiter, resolves the challenge using the server-side email hash, requires an exact match with the Bagger-authorized Auth UUID, and rechecks the same active tournament membership and canonical Player mapping before and after recording certification. The dedicated edge IP rule independently bounds certification requests before application execution. The challenge is time-bounded and single-use. The body accepts only `challengeId`; no Player or identity value is trusted from client input.

Success (`200`):

```json
{
  "ok": true,
  "apiVersion": "v1",
  "data": {
    "certified": true,
    "certificationToken": "v1.<issued-at>.<expires-at>.<nonce>.<signature>",
    "expiresInSeconds": 43200
  }
}
```

Only after the durable verification audit and post-record identity recheck succeed does the server mint the 12-hour `signed-proof-v1` credential. The proof contains only version, timestamps, a random nonce, and a signature; Auth UUID, Player ID, tournament ID, email, and phone are HMAC inputs but are not encoded into the client-visible value. It remains valid across Supabase access-token refresh for the same Auth UUID, while every request still rechecks the current canonical link and active membership. A signing-key rotation revokes all outstanding proofs.

The native client next calls `GET /session` with the same Bearer token plus `X-Bagger-Certification`. Future Step 2A stores the proof with the native session in Keychain, never logs it, and requires a fresh OTP after expiry. Missing, malformed, tampered, expired, wrong-identity, or wrong-Player proofs return `AUTH_CERTIFICATION_FAILED`; the app must sign out and discard both credentials.

#### Native-development anti-abuse model

`MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE=supabase-turnstile` is the only accepted native-development mode. The exact mode string is necessary but not sufficient: Supabase CAPTCHA-required/configured assertions, the public Turnstile site key, the server-only rate-limit and certification keys, disabled provider-side signup, the dedicated edge-IP-limit attestation, and the full isolated-development authority assertion must all pass. This mode cannot activate in Production or Production-shadow.

The controlled Preview flow requires a one-time Turnstile token that Supabase validates server-side before any approved delivery. Unapproved requests cannot cause a provider send. Dedicated edge IP limits cover both OTP request and certification. OTP requests additionally use a server-process hashed-client limit plus the existing canonical per-identifier/hashed-client limits, 60-second resend cooldown, and Supabase/provider limits. Certification uses its own server-secret-hashed Auth-user/client limit before challenge or audit RPCs. Delivery audit preserves safe CAPTCHA/provider categories. Challenges expire after 15 minutes and are single-use; invalid, expired, reused, and locally rate-limited certification attempts share one error. Approved and unapproved identifiers receive the same acknowledgement shape, message, and minimum public response duration.

Browser Production authentication retains its existing same-origin/Turnstile controls and behavior. Preview native authentication uses the same Supabase-side CAPTCHA enforcement through the mobile WebView challenge, but Production mobile remains fail-closed. App Attest/DeviceCheck can be evaluated as defense in depth during later Production native certification; it is not silently treated as present here.

## `GET /health`

Authentication: none.

Preview success (`200`):

```json
{
  "ok": true,
  "apiVersion": "v1",
  "service": "bagger-mobile-api",
  "environment": "preview",
  "authority": {
    "mode": "isolated-development",
    "authentication": "preview",
    "identity": "preview",
    "reads": "preview",
    "scoringReads": "preview",
    "scoringWrites": "preview",
    "productionShadow": false,
    "nativeAuth": "email-otp",
    "antiAbuse": "supabase-turnstile",
    "sessionCertification": "signed-proof-v1",
    "authUserCreation": "disabled",
    "requestRateLimit": "edge-ip+server-hash"
  }
}
```

An incompatible or unavailable environment returns the standard error contract with `503 MOBILE_API_UNAVAILABLE`. The native client must require every field shown above before continuing. In particular, `authority.productionShadow: false`, the Preview/isolated labels, and the native Auth/anti-abuse modes are server-derived; a deployment that merely reports `VERCEL_ENV=preview` cannot masquerade as ordinary native development.

## `GET /session`

Authentication: required Bearer token plus `X-Bagger-Certification`.

Success (`200`):

```json
{
  "ok": true,
  "apiVersion": "v1",
  "data": {
    "player": {
      "playerId": "CB01",
      "displayName": "Chris B",
      "team": {
        "teamId": "PICKLES",
        "name": "The Pickles"
      }
    },
    "tournament": {
      "tournamentId": "2026",
      "name": "2026 Sandbagger Invitational",
      "year": 2026
    }
  }
}
```

`team` may be `null` and `tournament.year` may be `null` if those values are absent from the canonical context. No email, phone, raw Auth metadata, identity-link records, Director entitlements, match permissions, or scoring data are part of this contract. Handicap is not included because the existing participant identity-context product does not currently expose it.

## Tournament read routes

All read responses use `{ "ok": true, "apiVersion": "v1", "data": ..., "meta": ... }` and are private to the verified Bearer identity with its exact Bagger certification proof. `meta.generatedAt` is an ISO-8601 UTC response timestamp. `meta.revision` is the product representation fingerprint: participant Home for `/today`, Tournament Live for `/matches`, the complete bounded Leaderboards Core projection for `/leaders`, the published Guide delivery fingerprint (falling back to its existing projection revision) for `/schedule`, and the complete bounded participant representations for `/net-skins` and `/calcutta`. The `meta.revision` value is also the strong `ETag`; matching `If-None-Match` requests receive `304`. Response-generation time is intentionally excluded, so an unchanged canonical representation revalidates while any participant-visible product change receives a new validator. No client-selected revision store was introduced.

### `GET /today`

Returns bounded tournament and Player context, at most one current match, and at most three published immediate events. Match preference is in-progress, then scheduled, then most recent completed; it is `null` when no canonical match involves the authenticated Player. Standings, storylines, Net Skins, scoring permissions, and full Guide content are excluded.

### `GET /matches`

Returns participant-visible Tournament Live matches ordered by round and canonical match ID. Status is `scheduled`, `inProgress`, or `completed`. Relationships are derived only from the server-resolved Player ID. Scoring permissions/capabilities, hole inputs, internal revisions, and Director controls are excluded.

### `GET /leaders`

Returns overall team and Player standings from Leaderboards Core and its established ranking helpers. Ties retain canonical display ranks. It also returns `roundStandings` in numeric Round order, with canonical Round name/status and the two team standings for each Round. Only official Match results contribute Round points; an upcoming Round with no official result returns `rank: null` and `points: null` rather than a fabricated zero. Half points remain exact JSON numbers. Native Swift therefore does not sum `/matches` to obtain Round Scores. Round scorecards, Round Player leaderboards, and secondary calculation detail remain excluded.

### `GET /schedule`

Returns only the published participant itinerary from the current Guide projection. Editorial metadata, raw source rows, contacts, unpublished content, Details copy, and administration fields are excluded.

### `GET /net-skins`

Authentication is the same verified Supabase Bearer session plus `X-Bagger-Certification` required by every protected mobile read. The request has no Player, tournament, environment, publication, or revision query selector. The server-resolved canonical Player ID and tournament are the only identity inputs.

The server adapter chooses authority only after the server proves its environment. Exact isolated Preview calls the service-role-only Preview RPC `read_preview_mobile_net_skins_v1(input jsonb)` against Preview Supabase. Production retains the separate `read_production_net_skins_v1(input jsonb)` reader, pinned to Production resources, but the repository-wide mobile health gate still leaves Production native access fail-closed. The client never receives or supplies a service credential and cannot select Player, tournament, environment, publication, or authority. Both readers feed the same participant DTO. The adapter performs no Net Skins calculation and never calls Google; canonical Supabase scoring/configuration and stored official snapshots produce the response.

The stable state values are:

| State | Meaning |
| --- | --- |
| `NOT_CONFIGURED` | No valid tournament-scoped Net Skins configuration exists. This is a successful empty read, not an error. |
| `CONFIGURED` | Valid entries exist, but no provisional payout is published. |
| `IN_PROGRESS` | Canonical scores are in progress. Configuration identity is available, but provisional payout results remain hidden. |
| `OFFICIAL` | The server has finalized and published the official result for every included result. |
| `UNAVAILABLE` | The canonical product is temporarily unable to provide a safe result. No fallback data is returned. |

`publicationPolicy` is always `OFFICIAL_ONLY`. Configuration summaries expose stable `roundId`, canonical `matchIds`, stable configuration `entryId`, and stable `playerIds`; a pairing remains one stable entry containing both canonical Player IDs. Only an `OFFICIAL` round has `officialResults`. Its skins and leaderboard are decorated and validated against those configuration identities; raw calculation payloads and name-only identity are never part of the native contract.

The canonical domain revision is `net-skins-v1:<configuration-revision>:<result-revision-or-0>:<state>` and is returned in `data.revision`. `meta.revision` and the strong `ETag` are an opaque fingerprint over the complete bounded participant representation, including its canonical configuration/result revision, Round states, official facts, Player relationship, and freshness. Freshness exposes bounded configured/calculated/published timestamps, a source fingerprint, and `stale`; clients must not infer authority from timestamps alone.

Transport/Auth/resource failures use the existing enumeration-safe mobile errors (`UNAUTHORIZED`, `INVALID_TOKEN`, `PARTICIPANT_NOT_FOUND`, `AUTH_CERTIFICATION_FAILED`, or `MOBILE_API_UNAVAILABLE`). `NOT_CONFIGURED` and `UNAVAILABLE` are successful domain states, so participant clients can render them without parsing internal PostgREST errors. No email, phone, Auth UUID, Director entitlement, source row, internal job, or service diagnostic is returned.

#### Production activation boundary

This endpoint and `net-skins.schema.json` define one environment-compatible participant DTO. Isolated Preview now serves it through Preview-only authority; the repository-wide mobile authority/health gate keeps the Production route dormant until a separately authorized Production activation. Preview never falls back to the Production reader, and Production semantics are unchanged. Activating Production native transport is separate work.

### `GET /calcutta`

Authentication is the same verified Supabase Bearer session plus `X-Bagger-Certification` required by every protected mobile read. The request has no Player, tournament, environment, publication, or revision query selector. The server-resolved canonical Player ID and tournament are the only identity inputs. Every active authenticated tournament participant receives the same full **published** market; `viewer.playerId` identifies the verified viewer without changing market contents.

The server adapter chooses authority only after the server proves its environment. Exact isolated Preview calls the service-role-only Preview RPC `read_preview_mobile_calcutta_v1(input jsonb)` against Preview Supabase. Production retains the separate `read_production_calcutta_v1(input jsonb)` reader, while the shared mobile gate keeps Production native access fail-closed. Preview publication is held in a server-only, configuration-fingerprint-bound ledger. Its one-time compatibility adoption is limited to an exact current snapshot whose fingerprint matches the approved configuration and whose canonical model was already participant-visible (`available = true`); an approved configuration alone remains unpublished. Every later approved configuration change resets visibility to `UNPUBLISHED`, and only an explicit service-side publication operation can expose that changed market/result. The client never receives a service credential, cannot select authority or publication, and cannot request recalculation. Both internal readers feed the same participant DTO. The mobile adapter only validates and reshapes canonical stored facts; it does not recreate auction, ownership, rank, tie, payout, ROI, settlement, or publication logic.

The versioned lifecycle state is independent from publication:

There is no `AUCTION_OPEN` state: the installed workflow records a completed auction manually and has no live-bidding authority.

| State | Meaning |
| --- | --- |
| `NOT_CONFIGURED` | No valid tournament-scoped Calcutta configuration exists. This is a successful empty read. |
| `CONFIGURED` | The bounded Calcutta rules/configuration exist, but a complete recorded auction does not. No market is exposed. |
| `AUCTION_COMPLETE` | Final purchase prices and exactly reconciled ownership have been recorded. A published market may be shown before any result exists. |
| `IN_PROGRESS` | At least one official completed Round contributes to the server-computed result, but the tournament is not final. |
| `OFFICIAL` | The tournament result and participant-visible financial result are final. |
| `UNAVAILABLE` | The server cannot provide a safe current result. No fallback result is returned. |

`publicationState` is exactly `UNPUBLISHED` or `PUBLISHED`, and `published` is its boolean equivalent. The rule is enforced before the participant DTO is built in both environments. `UNPUBLISHED` always returns `market: null` and `result: null`, even if an auction was recorded or the preserved lifecycle is already `IN_PROGRESS` or `OFFICIAL`. Explicit unpublish changes visibility, not canonical auction/result facts, lifecycle, or their revision bindings; `resultRevision` may therefore remain non-null while the result body is hidden. `PUBLISHED` returns the full bounded market: pot, every purchased Player, purchase price, and every owner's stable Player identity and ownership fraction. A published `IN_PROGRESS` or `OFFICIAL` state requires a result. A published `AUCTION_COMPLETE` market may have `result: null` until a valid calculation exists. `UNAVAILABLE` never returns a result; it may retain the already-published market only while the exact current configuration and auction facts remain valid.

The market and result contain only stable Player IDs and display names. They contain no email, phone, Auth UUID, identity-link row, Director entitlement, source row, raw configuration table, job, audit record, or storyline. The result is bounded to completed Round numbers, golfer rankings and server-computed Round facts, and owner portfolios/investments. It does not expose any mutation, bid, auction administration, or publication control.

`currencyCode` is always `USD`. Every money value, ownership fraction, payout fraction, and ROI is a canonical base-10 string: no currency symbol, grouping separator, exponent, or client-selected precision. This preserves the installed `payout_rounding: NONE` rule and valid sub-cent server results such as `118.125`. Ranks, points, gross/net scores, and course handicaps remain JSON numbers. Native may format the strings for display but must never calculate, settle, round, or redistribute Calcutta value.

The canonical domain revision is `calcutta-v1:<configuration-revision>:<auction-revision>:<publication-revision>:<result-revision-or-0>:<state>:<publication-state>` and is returned in `data.revision`. `meta.revision` and the strong `ETag` are an opaque representation fingerprint over the complete bounded participant response, including the domain revision, publication-safe market/result, canonical Player names, source fingerprint, lifecycle timestamps, and `stale`/`updating` flags. A freshness or visible-name transition therefore cannot incorrectly return `304`. A stale result is eligible only when it was calculated from the exact current configuration and auction revisions. A changed configuration or auction invalidates the old result rather than serving it as stale. There is no Google, browser-route, raw-snapshot, or cross-environment fallback.

#### Production activation boundary

This endpoint and `calcutta.schema.json` define one environment-compatible participant DTO. Isolated Preview now serves it through Preview-only canonical authority. The repository-wide mobile authority and health contract still leave Production mobile fail-closed. Serving this endpoint from Production remains a separate, explicitly authorized Production-native milestone.

## Participant content routes

The participant-content family provides bounded native projections for the More experience. Every route is a protected mobile read: it requires the verified Supabase Bearer session plus `X-Bagger-Certification`, resolves the canonical Player and active tournament membership on the server, and accepts no client-selected Player, tournament, publication, or authority. Isolated Preview reads only Preview Supabase and published Guide authority; there is no Preview-to-Production, Google, rendered-PWA, or Passport-cookie fallback. Production mobile remains disabled by the repository-wide authority gate.

All six representations use `Cache-Control: private, no-cache`, `Vary: Authorization, X-Bagger-Certification`, a deterministic strong `ETag`, and `304` revalidation. `meta.generatedAt` is not part of the representation fingerprint. Native may retain an identity/tournament-partitioned private read cache, but a newer canonical response always replaces the prior representation. In particular, a publication withdrawal cannot be overridden by stale published content.

### `GET /passport`

Returns the Passport for the authenticated canonical Player only. The route does not accept `playerId`. It combines the existing Leaderboards Core current-tournament projection with the existing canonical secondary-history, historical-statistics, Player-intelligence, draft, and corrected record-holder authorities. The completed career source is delivered to the adapter as one bounded 2017–2025 bundle plus the current 2026 projection; the route does not issue one external request per year.

The response includes canonical Player/team identity, current tournament record/standing/handicap and Round performance, career summary and honors, rankings, aggregate scoring and Match-progression profiles, Tournament History, BB/SC/SI performance and bounded Match history, Records Held, Captain Legacy, Biggest Rival, Draft History, and Top Partners. “Hole-by-Hole” is the canonical aggregate career scoring profile currently exposed by the PWA, not a newly invented 18-hole historical engine. Raw scorecards, Auth UUID, email, phone, diagnostics, web navigation fields, and client-selected identity are excluded. The complete participant representation is capped at 128 KiB and all nested collections are contract-bounded. `passport.schema.json` is the authoritative DTO.

### `GET /guide`

Returns the current published participant Guide as structured native content. Schedule is deliberately excluded because `/schedule` remains its sole mobile authority. A published response contains tournament identity, overview sections, structured Rules and Round formats, current Courses and their exact canonical 18-hole tee assignments, Dining, Local Guide, and participant-safe Important Contacts. Safe external-action values are plain email/phone/HTTPS source values; stable repository asset references are relative allowlisted asset keys. The response contains no HTML execution surface, Director controls, publication controls, private notes, or arbitrary URL schemes.

`publicationState` is `PUBLISHED` or `UNPUBLISHED`. The canonical no-publication result is a successful `UNPUBLISHED` representation with `publishedAt` and tournament set to `null` and every content collection empty. Transient/corrupt authority failures remain errors and are never disguised as withdrawal. A `PUBLISHED` to `UNPUBLISHED` transition changes the representation ETag and hides the prior published body. `guide.schema.json` is the authoritative DTO.

The complete Guide representation is capped at 768 KiB in addition to its per-section bounds.

### `GET /history`

Returns a bounded archive summary in canonical descending year order. Each item contains tournament identity/context, lifecycle, the two canonical teams and points, champion/runner-up when final, final score when known, detail availability, and revision. The current tournament remains `inProgress` or `upcoming` until canonical authority declares it final; the adapter never fabricates a champion. The completed-year archive is read as one server aggregate.

### `GET /history/[year]`

Returns one bounded canonical tournament detail for a supported year (currently 2017–2026). The response contains team/roster facts, Round results, Match summaries, Player standings, awards, and available verified historical scorecard projections. Scorecards are optional historical authority, not reconstructed from unrelated mobile data. Unsafe or unsupported year shapes fail closed. `history.schema.json` and `history-detail.schema.json` define the archive and detail representations.

Archive and one-year detail representations are capped at 256 KiB and 1 MiB respectively.

### `GET /records`

Returns the participant-facing global Records catalog grouped in canonical order. It uses the corrected canonical record-holder authority over existing all-time, verified scorecard, and Match-progression records. Each record contains its stable ID/title, direction/unit/presentation value, eligibility context, tied state, and the complete bounded holder set with canonical Player IDs where available. Passport `recordsHeld` is only the authenticated Player subset; `/records` is the global catalog. Native must not detect records or match holders by display name. `records.schema.json` is authoritative.

The complete Records representation is capped at 512 KiB; a canonical empty catalog is a valid response.

### `GET /odds`

Returns only the canonical published Championship Odds snapshots already approved for participants. The mobile adapter does not calculate probability, American odds, expected points, expected record, ranking, or average finish. It validates and bounds the stored snapshots in canonical phase order.

`publication.state` is `UNPUBLISHED` or `PUBLISHED`. `UNPUBLISHED` always has `publishedAt: null`, `currentPhase: null`, and an empty `snapshots` array, even if a prior publication existed. The Preview publication ledger is service-only and explicit; revocation increments its revision and therefore changes the representation ETag. `PUBLISHED` contains only verified stored snapshots and identifies exactly one current phase. Model inputs, Director controls, job state, engine diagnostics, and unpublished payloads are excluded. `odds.schema.json` is authoritative.

The complete Odds representation is capped at 256 KiB.

### Preview participant-content authority

Migration `202608300002_preview_mobile_participant_content_v1.sql` adds one service-role-only Preview reader for bounded History/career bundles and Odds, plus an RLS-protected Odds publication ledger and service-only publication operation. It grants no `anon` or `authenticated` table/RPC access. Guide remains backed by the existing immutable published Guide projection; Passport and Records reuse existing canonical career services. Native never calls Supabase tables or these internal RPCs directly.

## Date and time

- Calendar dates are `YYYY-MM-DD`.
- Absolute timestamps are ISO-8601 UTC strings.
- The tournament IANA timezone is explicit as `timeZone`; the safe fallback is `America/Chicago` only when canonical data omits or invalidates it.
- Schedule events include normalized `HH:mm:ss` tournament-local clocks plus UTC instants.
- Match tee times currently lack a canonical calendar date, so they contain `localTime`, `timeZone`, and a presentation `label`; clients must not infer an absolute date.
- Human-readable labels are never the sole machine-readable schedule time.

## Native scoring routes

The mobile transport is a thin adapter over the same `persistParticipantScore` service and authoritative Supabase score/finalization transactions used by the PWA. It does not calculate handicap, strokes, net score, hole winner, Match result, points, lifecycle, or official revisions.

All scoring responses use `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, and `Vary: Authorization, X-Bagger-Certification`. They do not use ETag or intermediary/shared caching. `meta.generatedAt` is an ISO-8601 UTC response timestamp, not a canonical scoring revision.

### `GET /scoring/current`

Authentication: required Bearer token plus `X-Bagger-Certification`.

This returns the canonical scoring snapshot for the authenticated Player's current Match. Selection preference is writable live Match, other live Match, upcoming Match, then most recent final Match. When no participant Match exists, `data.scoring` is `null`.

An optional `matchId` query selects a particular Match for authoritative refresh after a conflict. It is only a resource identifier: it cannot select Player identity, and the server denies a Match outside the verified Player's canonical participant context.

The response includes:

- normalized Match status, format, Match revision, and permission revision;
- the server-resolved Player and team side;
- immutable snapshot sides and participant slot ordering;
- canonical handicap/stroke context, course, tee, and hole definitions;
- canonical gross, strokes, net, winner, and hole revisions;
- current progress and bounded writable/read-only/finalization state; and
- snapshot ID and revision, but not its internal fingerprint.

It does not include a scoring cookie, Bearer token, capability, permission row, snapshot hash, Director control, or database/Google implementation detail.

### `POST /scoring/hole`

Authentication: required Bearer token plus `X-Bagger-Certification`. Content type: `application/json`. Maximum decoded body size: 16 KiB.

Request:

```json
{
  "matchId": "2026-R2-1",
  "holeNumber": 7,
  "teamOneGrossScores": [4, 5],
  "teamTwoGrossScores": [5, 6],
  "mutationId": "11111111-1111-4111-8111-111111111111",
  "expectedMatchRevision": 12,
  "expectedHoleRevision": 3
}
```

Best Ball (`BB`) requires two gross scores per side. Scramble (`SC`) and Singles (`SI`) require one per side. Array position is the immutable canonical snapshot's Player slot order from `/scoring/current`; the request never contains Player IDs.

Only Match ID, hole number, gross-score intent, mutation ID, and optimistic-concurrency revisions are accepted. Unknown fields are rejected. In particular, the client cannot submit Player identity, handicap, strokes, net score, hole winner, Match winner, points, lifecycle, or official next revisions.

Authoritative acknowledgement:

```json
{
  "ok": true,
  "apiVersion": "v1",
  "data": {
    "mutationId": "11111111-1111-4111-8111-111111111111",
    "accepted": true,
    "idempotent": false,
    "semanticNoop": false,
    "matchId": "2026-R2-1",
    "hole": {
      "holeNumber": 7,
      "revision": 4,
      "gross": { "teamOne": [4, 5], "teamTwo": [5, 6] },
      "strokes": { "teamOne": [1, 0], "teamTwo": [0, 1] },
      "net": { "teamOne": 3, "teamTwo": 4 },
      "winner": "teamOne",
      "updatedAt": "2026-09-25T14:30:00.000Z"
    },
    "match": {
      "revision": 13,
      "status": "inProgress",
      "currentHole": 7,
      "holesRemaining": 11,
      "scorecardComplete": false,
      "statusText": "Team 1 2 UP through 7"
    },
    "refreshRequired": false
  },
  "meta": { "generatedAt": "2026-09-25T14:30:00.000Z" }
}
```

`accepted: true` is the official queue-removal acknowledgement. Gross values echo canonical storage; strokes, net, winner, hole revision, Match revision, progress, and status are authoritative outputs.

### Mutation IDs and retry behavior

`mutationId` must be 1–128 characters and match `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. A lowercase UUID generated once when an offline intent is created is recommended. The client must persist it unchanged through every retry.

The canonical uniqueness scope is `(matchId, mutationId)`. Reusing a mutation ID in the same Match for different hole/gross intent returns `409 IDEMPOTENCY_CONFLICT`; never recycle an ID. The current authority defines no expiration or cleanup job for mutation records: the record remains authoritative while the canonical Match/mutation record exists, but clients must not infer an infinite retention guarantee.

A retry with the same ID, Player, Match, hole, and gross intent returns the stored canonical acknowledgement with `idempotent: true` and creates no second score effect, revision, audit event, or outbox event. This replay remains available when a later lifecycle/permission change would reject a new write. A same-hole request with a different mutation ID must satisfy current revisions and cannot overwrite a newer official score.

### Revision and conflict behavior

`expectedMatchRevision` and `expectedHoleRevision` are required non-negative optimistic-concurrency preconditions. They do not grant authority or determine the next revision. A stale precondition returns:

```json
{
  "ok": false,
  "apiVersion": "v1",
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Official scoring state has changed."
  },
  "data": {
    "matchId": "2026-R2-1",
    "currentMatchRevision": 13,
    "currentHoleRevision": 4,
    "refreshRequired": true
  }
}
```

Only canonical current revisions that the transaction supplies are returned. The client must retain the unresolved mutation, refresh `GET /scoring/current?matchId=...`, and require reconciliation/review; it must not silently rebase over a different official value.

### `POST /scoring/finalize`

Authentication: required Bearer token plus `X-Bagger-Certification`.

The repository uses explicit participant finalization (model A), so the mobile API exposes the existing canonical finalization transaction:

```json
{
  "matchId": "2026-R2-1",
  "mutationId": "finalize:2026-R2-1:30",
  "expectedMatchRevision": 30
}
```

The transaction alone checks participant permission, Match revision, all 18 required holes, scorecard completeness, unresolved mutations, lifecycle, result availability, and transaction integrity. It calculates/retains the official result and points, marks the Match final/locked, advances Match and permission revisions, revokes scoring permission, and creates the canonical audit/outbox records. The client cannot submit completeness, result, points, or final lifecycle state.

Successful finalization returns `accepted: true`, the new Match/permission revisions, final status/result/timestamp, and `refreshRequired: true`. Incomplete or unresolved scorecards return `FINALIZATION_NOT_READY`; stale state returns `REVISION_CONFLICT`; an already final Match returns `MATCH_ALREADY_FINALIZED`.

Finalization should be requested online only after all queued hole mutations are authoritatively acknowledged. Because finalization atomically revokes participant scoring permission, an acknowledgement lost after commit is reconciled by refreshing `/scoring/current?matchId=...` and observing the canonical final state; a post-final retry receives `MATCH_ALREADY_FINALIZED` rather than creating a second lifecycle transition.

### Publication and observability

The canonical transaction atomically preserves existing score revision history, audit events, idempotency record, and Google outbox event. After a successful mobile transaction, the route schedules the same existing outbox/archive and derived-product workers used by scoring. Worker failures never roll back an already committed authoritative score and do not leak internal errors to the client.

No Bearer token, scoring cookie, service-role key, OTP, device fingerprint, or arbitrary client metadata is logged or returned. The transport uses a fixed `Mobile v1 scoring worker` source label for post-commit work.

## Error contract

```json
{
  "ok": false,
  "apiVersion": "v1",
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required."
  }
}
```

| Code | HTTP | Meaning |
| --- | ---: | --- |
| `UNAUTHORIZED` | 401 | The Bearer header is missing or malformed. |
| `INVALID_TOKEN` | 401 | Supabase rejected or could not authenticate the access token. |
| `PARTICIPANT_NOT_FOUND` | 403 | No active, approved canonical participant context is available for the verified Auth UUID. |
| `INVALID_AUTH_REQUEST` | 400 | Native OTP JSON, method, identifier, challenge, or fields are malformed. Do not retry unchanged. |
| `AUTH_METHOD_UNAVAILABLE` | 409 | The requested native identifier method is reserved but not enabled; phone currently returns this response. |
| `AUTH_CERTIFICATION_FAILED` | 403 | The opaque challenge is invalid, expired, reused, or does not match the exact authorized Auth identity. Sign out and discard the native session. |
| `MOBILE_API_UNAVAILABLE` | 503 | Mobile v1 is not enabled in this environment or its required authority is unavailable. |
| `SCORING_UNAVAILABLE` | 503 | Preview Supabase scoring/read authority is unavailable or not intentionally enabled. |
| `MATCH_NOT_FOUND` | 404 | A previously authorized canonical Match no longer exists. |
| `SCORING_NOT_AUTHORIZED` | 403 | The verified Player lacks current membership/Match scoring permission. Refresh authorization; do not retry blindly. |
| `SCORING_READ_ONLY` | 409 | The Match is locked or not in a writable lifecycle. Refresh before further action. |
| `INVALID_SCORE_INPUT` | 400 | JSON, identifiers, revisions, gross scores, slot counts, or fields are invalid. Do not retry unchanged. |
| `REVISION_CONFLICT` | 409 | Official Match/hole state changed. Refresh and reconcile before retry. |
| `IDEMPOTENCY_CONFLICT` | 409 | The same mutation ID represents incompatible intent. Keep both states for manual review; do not generate a replacement silently. |
| `FINALIZATION_NOT_READY` | 409 | Completeness, pending-mutation, or result checks prevent finalization. Refresh and resolve. |
| `MATCH_ALREADY_FINALIZED` | 409 | The Match already completed and no new scoring mutation is permitted. Refresh final state. |
| `INTERNAL_ERROR` | 500 | The request failed without a participant-safe classified error. |

Scoring errors may include a bounded top-level `data` object with `matchId`, canonical current revisions when provided by the transaction, `scoredHoles` when relevant, and `refreshRequired: true`. Internal database/Supabase messages, stack traces, diagnostics, and secrets are never returned.

Health uses `Cache-Control: no-store`; session uses `private, no-store`. Tournament reads use `private, no-cache`, vary on both `Authorization` and `X-Bagger-Certification`, and support ETag revalidation. Scoring reads, acknowledgements, conflicts, and finalization responses are private/no-store and never shared-cached.

Machine-readable schemas and synthetic decoding fixtures live beside this document. Native auth success responses are defined by `auth-otp-request-response.schema.json` and `auth-otp-certify-response.schema.json`. `scoring-fixtures.json` covers active/read-only/no-Match/final state, successful/idempotent/conflicted/denied hole mutations, cross-device replay, and finalization outcomes. Fixtures contain no Production personal data.
