# Participant authentication phone ownership

Step 8B.1 adds an additive, protected Participant Identity foundation for
authentication phones. It does not enable SMS login, Supabase Phone Auth, or
Twilio.

## Authority

- Canonical golfer: `scoring_authority.players.player_id`
- Auth ownership: `participant_identity.user_player_links`
- Authentication identifiers: `participant_identity.participant_auth_identifiers`
- Email editorial/import source: existing Participant Identity configuration
- Authentication phone source: protected Supabase Participant Identity only

Guide contacts, Local Guide resources, Google Player rows, and notification
preferences are not authentication-phone sources.

## States

- `ELIGIBLE`: Director approved the identifier; it is not verified.
- `VERIFICATION_PENDING`: reserved for a later provider flow.
- `VERIFIED`: reserved for reconciliation after successful provider/Auth proof.
- `REVOKED`: no longer eligible; retained for audit history.

Director entry can create only `ELIGIBLE` phone ownership. Step 8B.1 has no RPC
that promotes a phone to `VERIFIED`.

## Director workflow

Use Director Mission Control → Player / Participant Identity → Authentication
Methods. Add and Change accept friendly US input and normalize server-side to
E.164. Change and Revoke require confirmation and explicitly preserve email
sign-in. Routine roster responses contain only a masked last-four display.

The selected Player must be active and already have the canonical Auth UUID →
Player link. Missing Auth setup is reported instead of creating a hidden Auth
user.

## Security

- RLS is enabled and anon/authenticated privileges are revoked.
- Reads and mutations use service-role RPCs behind existing Preview Director
  authorization.
- One current phone may map to one Player and one Auth UUID.
- `auth.users.phone` and `phone_change` are checked for collisions but are never
  changed by Step 8B.1.
- Raw E.164 values stay in the protected table and authorized mutation request.
  Lists, audit events, API responses, and logs use an opaque identifier and/or
  the last four digits.
- Lookup uses exact E.164 equality inside the service-role boundary. No weak,
  unsalted phone hash is stored. A keyed fingerprint is intentionally deferred
  because no lookup value leaves that boundary; add one before any future
  architecture exposes deterministic lookup material outside it.

## Email compatibility

Existing links receive a method-neutral EMAIL identifier transactionally. The
migration fails closed if complete link parity cannot be established. The
existing `email_identity_hash`, email OTP routes, session cookies, and approved
tournament resolver remain unchanged.

## Rollback

Disable the Director phone UI and apply a forward rollback migration that drops
the Step 8B.1 RPCs and `participant_auth_identifiers` after verifying no
later SMS work depends on them. The existing email contacts, links, Auth users,
Player IDs, sessions, and tournament data do not require cleanup.

## Step 8B.2 prerequisites

Before provider configuration:

1. Resolve all phone duplicates and Auth `phone`/`phone_change` collisions.
2. Enter only owner-approved authentication phones.
3. Keep every entered phone `ELIGIBLE` and unverified.
4. Confirm the same expected Auth UUID for each phone.
5. Keep `PARTICIPANT_SMS_AUTH_ENABLED=false` until the later login/provider
   implementation is explicitly approved.
