# Bagger Mobile API v1

Base path: `/api/mobile/v1`

The v1 API is an additive native-client contract. It does not replace browser Supabase SSR cookies, Player Passport cookies, or scoring-session cookies.

## Environment

Mobile v1 is enabled only in an isolated Vercel Preview runtime where the existing participant identity authority resolves to Supabase and Auth uses the same configured Supabase authority as the protected identity RPC. Production, local development without the Preview authority, mismatched/incomplete Preview configuration, and authority outages return `503 MOBILE_API_UNAVAILABLE`; there is no fallback to Passport, Google Sheets, or another identity authority.

## Authentication

Every route except `GET /health` requires a Supabase access token:

```http
Authorization: Bearer <supabase-access-token>
```

The server validates the token with Supabase Auth, uses only the verified Auth user UUID, and resolves that UUID through the existing protected `participant_identity.user_player_links` authority to the canonical `scoring_authority.players.player_id`. Client query parameters, headers other than `Authorization`, and Auth metadata do not select the Player.

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
| `INTERNAL_ERROR` | 500 | The request failed without a participant-safe classified error. |

Health uses `Cache-Control: no-store`; session uses `private, no-store`. Tournament reads use `private, no-cache`, vary on `Authorization`, and support ETag revalidation.

Machine-readable schemas and synthetic decoding fixtures live beside this document. Fixtures contain no Production personal data.
