# Expired provider-confirmed identity recovery v1

Local candidate only. Installation and real participant recovery are separate owner-authorized operations. Neither is performed by the migration.

## Scope and authority

Recovery class: `EXPIRED_PROVIDER_CONFIRMED_CERTIFICATION_PENDING`.

This contract only accepts tournament 2026 players HM01 and NJ01. It is not normal first-login and not a generic force-certify endpoint. The existing public 30-minute recovery function is unchanged. The expired signup attempt supplies workflow provenance, not current proof of possession or a new authentication session.

The protected operator inspects current state, reviews an exact manifest, registers it, then applies its returned hash. All three functions are private to the existing database operator boundary: `session_user = postgres`, existing Production identity-cutover gate, and no active release attempt. Registration/execution additionally require the existing active adopted Owner capability. Public, anonymous, authenticated and service-role callers have no execution/table privileges. A service-role JWT setting alone is insufficient. There is no HTTP endpoint, participant button or credential in this package.

A manifest binds contract, approval UUID, Player ID, existing Auth UUID, historical request UUID, Owner Player/Auth UUID, fixed safe reason, exact inspected state (including approved Email SHA-256 fingerprint), and expiry no more than 15 minutes away. PostgreSQL hashes its canonical JSONB representation; use the hash returned by registration, not a JavaScript JSON-string hash. The plan-building module performs preliminary validation only; the database independently checks everything.

The operator must have explicit reviewed owner authorization for each exact manifest before registration. Existing deployment approval is not participant-repair authorization. No approvals are shipped or automatically created. A later API/UI exposing these functions is outside this contract and requires separate certification.

## Current eligibility, checked again under locks

- Existing, confirmed provider Email; no deleted/banned Auth user; exact UUID unchanged.
- Provider normalized Email, current approved Director contact, Email identifier and link Email fingerprint agree.
- Provider Player ID/tournament/provisioning metadata and controlled-first-login link method match.
- Canonical player/global status and tournament membership active.
- Contact/configuration/import/workbook authority and consumed enrollment claim match the current revision.
- Link specifically PENDING, Email identifier VERIFICATION_PENDING, no verified timestamp and no existing tournament roles for initial recovery.
- Historical SENT signup belongs to this exact Player/UUID/Email, is older than 30 minutes, and provider confirmation follows its dispatch. Confirmation cannot be future-dated.
- No competing UUID/Player links, duplicate provider Email/Player metadata, Email/contact/identifier collisions, approved phone or provider pending-phone collisions.
- For this narrow class the Director phone remains APPROVED but unverified; the target provider has no phone or pending phone. Recovery neither enrolls nor verifies Text.
- No deletion request, link/identifier/role revocation, changed approval, missing import, unknown or ambiguous identity.

Any failure denies the transaction. A currently eligible but changed manifest must be reviewed again; a stale manifest is not silently refreshed.

## Atomic effect and replay

Only the existing Bagger link and Email identifier become ACTIVE/VERIFIED with revision increments; one normal PARTICIPANT identity role is added. No scoring permission, lease, provider session, Bagger certificate, Auth user, phone, contact, player or tournament record is created/changed. The historical attempt is not marked newly verified. The participant subsequently uses normal fresh Email login and its usual session/certification checks.

The immutable receipt records approval, historical target/actor Player IDs, plan hash, outcome, before/after state hashes, link revisions and timestamp. It contains no Email, Auth UUID, phone, OTP or token. UPDATE, DELETE and TRUNCATE are denied. Private approval bindings cascade away when target or actor Auth is deleted; the minimal historical receipt remains but cannot authorize another recovery.

Same plan registration is idempotent. Same execution after successful recovery revalidates current authority and exact completed-state fingerprint before returning ALREADY_COMPLETE. Revocation, deletion or revision drift denies replay. Normal certification winning the race is recorded as ALREADY_COMPLETED_BY_NORMAL_LOGIN only when the original attempt was actually VERIFIED and exactly the expected link/identifier revision increments occurred. The recovery does not rewrite that identity.

## Serialization and operational limit

The bounded transaction first takes EXCLUSIVE on the Bagger OTP-attempt table. This conflicts with normal certification's initial SELECT FOR UPDATE table lock and avoids a lock-upgrade deadlock. It then takes SHARE on `auth.users` and SHARE ROW EXCLUSIVE on relevant Bagger authority/approval/deletion/release tables. This prevents a provider/identity collision or authority change between validation and completion. Release activity is checked before and after locks.

These are table-wide locks, deliberately limited to this two-player operator repair. They can briefly block other Auth/identity writes. `lock_timeout = 5s`; the operator must also set `statement_timeout = 10s` and a short idle-in-transaction timeout, issue a single bounded transaction, and never pause for human input while holding locks. Timeout/deadlock means rollback, not automatic retry. Reinspect and review before retry. A fresh staged/local test is not proof of hosted lock permission; validate exact hosted operator privileges before any real repair. Do not change Auth ownership/permissions if denied.

## Safe eventual directory presentation

Reason: `EXPIRED_PROVIDER_CONFIRMED_CERTIFICATION_PENDING`

Title: **Identity setup incomplete**

Explanation: **Email was verified, but Bagger account linking did not complete.**

Action: **Protected recovery required.**

After completion: **Email identity linked**.

The constants are defined locally; no deployed directory response or UI is changed. Do not project eligibility from provider confirmation alone or reveal private provider metadata.

## Files and tests

Migration: `supabase/production_migrations/202609220107_expired_identity_recovery_v1.sql`.

Plan/copy module: `lib/expired-identity-recovery.js`.

New tests cover exact review binding, HM01/NJ01-shaped completion, all specified denials, replay, privacy, concurrency in both completion orders, the real predecessor normal-certification/public recovery functions, and unchanged function definitions across the full predecessor migration chain. Isolated behavior fixtures stub only runtime cutover/global-status/Owner gates; hosted acceptance must validate those real gates. Full-schema installation checks do not claim live participant execution.
