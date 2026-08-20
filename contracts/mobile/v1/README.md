# Bagger Mobile API v1

Base path: `/api/mobile/v1`

The v1 API is an additive native-client contract. It does not replace browser Supabase SSR cookies, Player Passport cookies, or scoring-session cookies.

## Environment

Mobile v1 is enabled only in an isolated Vercel Preview runtime where the existing participant identity authority resolves to Supabase and Auth uses the same configured Supabase authority as the protected identity RPC. Production, local development without the Preview authority, mismatched/incomplete Preview configuration, and authority outages return `503 MOBILE_API_UNAVAILABLE`; there is no fallback to Passport, Google Sheets, or another identity authority.

The scoring routes add a second fail-closed gate: both the canonical scoring authority and scoring read source must intentionally resolve to Preview Supabase. Otherwise they return `503 SCORING_UNAVAILABLE`. Mobile scoring never falls back to Google or browser scoring credentials.

## Authentication

Every route except `GET /health` requires a Supabase access token:

```http
Authorization: Bearer <supabase-access-token>
```

The server validates the token with Supabase Auth, uses only the verified Auth user UUID, and resolves that UUID through the existing protected `participant_identity.user_player_links` authority to the canonical `scoring_authority.players.player_id`. Client query parameters, headers other than `Authorization`, and Auth metadata do not select the Player.

A valid Bearer identity is not itself scoring permission. Every scoring operation separately checks canonical tournament membership, Match participation, `can_score`, revocation, permission revision, scoring lock, and Match lifecycle. No separate native scoring credential or long-lived scoring capability exists.

## `GET /health`

Authentication: none.

Preview success (`200`):

```json
{
  "ok": true,
  "apiVersion": "v1",
  "service": "bagger-mobile-api",
  "environment": "preview"
}
```

An incompatible or unavailable environment returns the standard error contract with `503 MOBILE_API_UNAVAILABLE`.

## `GET /session`

Authentication: required Bearer token.

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

All read responses use `{ "ok": true, "apiVersion": "v1", "data": ..., "meta": ... }` and are private to the verified Bearer identity. `meta.generatedAt` is an ISO-8601 UTC response timestamp. `meta.revision` is the existing canonical product fingerprint: participant Home for `/today`, Tournament Live for `/matches`, Leaderboards Core for `/leaders`, and the published Guide delivery fingerprint (falling back to its existing projection revision) for `/schedule`. The same value is a strong `ETag`; matching `If-None-Match` requests receive `304`. No revision store was introduced.

### `GET /today`

Returns bounded tournament and Player context, at most one current match, and at most three published immediate events. Match preference is in-progress, then scheduled, then most recent completed; it is `null` when no canonical match involves the authenticated Player. Standings, storylines, Net Skins, scoring permissions, and full Guide content are excluded.

### `GET /matches`

Returns participant-visible Tournament Live matches ordered by round and canonical match ID. Status is `scheduled`, `inProgress`, or `completed`. Relationships are derived only from the server-resolved Player ID. Scoring permissions/capabilities, hole inputs, internal revisions, and Director controls are excluded.

### `GET /leaders`

Returns overall team and Player standings from Leaderboards Core and its established ranking helpers. Ties retain canonical display ranks. Round scorecards and secondary leaderboard modules are excluded.

### `GET /schedule`

Returns only the published participant itinerary from the current Guide projection. Editorial metadata, raw source rows, contacts, unpublished content, Details copy, and administration fields are excluded.

## Date and time

- Calendar dates are `YYYY-MM-DD`.
- Absolute timestamps are ISO-8601 UTC strings.
- The tournament IANA timezone is explicit as `timeZone`; the safe fallback is `America/Chicago` only when canonical data omits or invalidates it.
- Schedule events include normalized `HH:mm:ss` tournament-local clocks plus UTC instants.
- Match tee times currently lack a canonical calendar date, so they contain `localTime`, `timeZone`, and a presentation `label`; clients must not infer an absolute date.
- Human-readable labels are never the sole machine-readable schedule time.

## Native scoring routes

The mobile transport is a thin adapter over the same `persistParticipantScore` service and authoritative Supabase score/finalization transactions used by the PWA. It does not calculate handicap, strokes, net score, hole winner, Match result, points, lifecycle, or official revisions.

All scoring responses use `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, and `Vary: Authorization`. They do not use ETag or intermediary/shared caching. `meta.generatedAt` is an ISO-8601 UTC response timestamp, not a canonical scoring revision.

### `GET /scoring/current`

Authentication: required Bearer token.

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

Authentication: required Bearer token. Content type: `application/json`. Maximum decoded body size: 16 KiB.

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

Authentication: required Bearer token.

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

Health uses `Cache-Control: no-store`; session uses `private, no-store`. Tournament reads use `private, no-cache`, vary on `Authorization`, and support ETag revalidation. Scoring reads, acknowledgements, conflicts, and finalization responses are private/no-store and never shared-cached.

Machine-readable schemas and synthetic decoding fixtures live beside this document. `scoring-fixtures.json` covers active/read-only/no-Match/final state, successful/idempotent/conflicted/denied hole mutations, cross-device replay, and finalization outcomes. Fixtures contain no Production personal data.
