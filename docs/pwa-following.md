# PWA Following — experimental 2026 candidate

Disabled by default. `SPECTATOR_PWA_ENABLED=true` enables the new PWA entry and public read routes. This is not a deployment instruction. A separate attended deployment and hosted certification are required.

The baseline is Release 131's IANA America/New_York schedule correction. No database migration, native change, participant auth change, or scoring authority change is required.

## Routes

- Installed PWA starts at `/home`. The new client entry gate resolves the current session *after* navigation, avoiding a cached signed-out redirect during existing OTP prefetch. A valid participant uses unchanged participant Home. No session goes to `/enter`; existing invalid/transient participant credentials stay on the existing recovery path.
- `/enter`: I’M PLAYING → existing `/participant-auth?next=/home`; I’M FOLLOWING → `/follow/today`.
- `/follow/{today,tournament,matches,leaders,players,more,guide,schedule,courses,rules,history,records,odds}`. Only matches and players accept a second stable-ID segment. Unknown/private destinations are unavailable.
- `/api/entry`: no cookies → `none` without identity/provider calls. Existing participant cookies are resolved through the existing canonical resolver. Errors become `recovery`, not a spectator identity.
- GET `/api/spectator/{tournament,odds,history,records}`: explicit public allowlists only. No other resources, query selectors, or mutation methods. No user identity is accepted or created.

The local `bagger.following.v1=yes` preference is not an authorization credential. Participant Sign In clears it. A valid participant always wins. Existing participant local Sign Out still opens the existing sign-in screen; later PWA entry normally shows the chooser because entering participant sign-in cleared the preference. If a valid participant arose through an independent tab while a Following preference remained, explicit local sign-out leaves that preference intact for the next PWA entry.

## Security boundary

Do not remove authentication from participant endpoints. The public server module calls only fixed canonical read services and emits explicit DTO fields; no generic RPC/SQL proxy or caller-selected identity exists. Existing service credentials remain server-only; they are not intrinsically read-only. No anonymous/authenticated database grants are added. No Net Skins or Calcutta read is invoked by spectator projection construction. The global participant diagnostics component excludes `/enter` and `/follow` so a prior sign-in visit cannot cause diagnostic POSTs while Following.

Portrait policy is fetched on every tournament read. Suppression/unknown assets yield initials. Core and Guide reads have 15-second per-process caches with request coalescing. History/Records use 60 seconds. Odds publication is re-read on every Odds request. API responses are no-store. Visible screens refresh once per minute plus explicit Refresh/focus; the IANA presentation clock updates every second. Failed refresh retains score text with a warning, removes portraits, and removes any prior Odds snapshot. This is not an offline score queue.

## Local certification

- `node --test test/spectator.test.mjs test/spectator-routes.test.mjs test/spectator-service.test.mjs`
- `node --conditions=react-server --test test/spectator-grants-postgres.integration.test.mjs` (disposable local PostgreSQL 17 only).
- Current participant auth/session/scoring/Director tests must also pass; no real delivery or hosted mutation is part of these tests.
- Actual Next Production-build browser evidence, fixture runners, full field inventory, known historical test incompatibilities and screenshots are in `/private/tmp/bagger-spectator-2026/`.

The public read contract can be reused by a future native client. Native UI/preferences/public transport integration would be a separate Version 1.2 / Build 8 task. Native scoring authority must not change.
