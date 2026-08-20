# Bagger Mobile API v1

Base path: `/api/mobile/v1`

The v1 API is an additive native-client contract. It does not replace browser Supabase SSR cookies, Player Passport cookies, or scoring-session cookies.

## Environment

Mobile v1 is enabled only in an isolated Vercel Preview runtime where the existing participant identity authority resolves to Supabase and Auth uses the same configured Supabase authority as the protected identity RPC. Production, local development without the Preview authority, mismatched/incomplete Preview configuration, and authority outages return `503 MOBILE_API_UNAVAILABLE`; there is no fallback to Passport, Google Sheets, or another identity authority.

## Authentication

`GET /session` requires a Supabase access token:

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

Responses use `Cache-Control: no-store`; session responses are private and vary on `Authorization`.

Machine-readable schemas live beside this document.
