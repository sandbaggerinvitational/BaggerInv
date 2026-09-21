# Build 5 participant certification and current-session logout

Build 5 Production requests advertise `X-Bagger-Certification-Contract: 14d-v1`.
Only after the existing Email/Text OTP completion may the common issuer return a
14-day (1,209,600-second) certificate. Email and Text use the same response shape,
HMAC authority, Supabase session and native Keychain. `v3e` / `v3t` identify the
signed authentication channel so Text's current verified-phone authority can be
revalidated without guessing from Supabase's generic OTP AMR.

Unadvertised clients, including publicly distributed Build 4, keep their exact
12-hour `v2p` contract. Preview and nonparticipant review access are unchanged.
Build 5 accepts legacy responses during deployment, but legacy certificates do
not silently upgrade: their signed context lacks the new session/channel binding.
One fresh Email/Text sign-in establishes the new contract after deployment.

Normal protected requests require online Supabase `getUser`, current canonical
membership/link/runtime/revocation revisions and a valid unexpired certificate.
Extended certificates additionally bind the provider session ID, AAL, verified
Email and identity-provider associations. Text also binds the current canonical
verified-phone identifier/revision and provider confirmation. Full phone values
are used only in server memory for this comparison, never added to tokens or API
responses. The existing approved-phone proof RPC checks current Director approval,
replacement/revocation, provider association and collision constraints.

`POST /api/mobile/v1/auth/certification/renew` has no body or client identity claims.
It requires the bearer, prior extended certificate and negotiated contract header.
The existing certificate signature must verify against current authority even
when its timestamp expired. No other verification is relaxed. The common issuer
rechecks the exact prior signature with its freshly loaded context before issuing
another 14-day certificate. No OTP, Supabase user creation, session creation or
refresh-token response occurs at this endpoint.

Native refreshes its existing Supabase session before renewal. A 60-second local
safety margin starts renewal before server expiry. It retains expired certification
only as evidence in the same Keychain item, never as read/write authorization.
Renewal is coalesced per credential-provider instance; logout/account changes
before completion prevent it from repopulating storage. Temporary failures offer
Retry. Definitive auth/certification rejection uses existing credential invalidation.

Normal PWA sign-out and failed-OTP-login cleanup use `scope: local`. Existing native
sign-out already uses `.local`. Account deletion's administrative delete-user path
and explicit Supabase global revocation remain separate and unchanged.

No access-token lifetime, refresh policy, inactivity, absolute lifetime or
single-session setting changes are required. No SQL migration is required.
