# PN-8A isolated server correction

Base: `bfe99fabc6739d5ba3e4ea639bbf2b2c7d8f2be3` (Production release 68).
This package does not change configuration, database objects, web Auth routes,
scoring, workers, destinations or release-control operations.

## Authority and certificate contract

Production `v2p` now signs the existing canonical `contextRevision` returned by
`read_participant_identity_context` through the current Production context
adapter. It is the identity-context revision, not a newly invented native
counter or a claim that the frozen context exposes a per-link revision.
Auth UUID, canonical player, current tournament and active membership must also
agree. The same context is re-read before returning an admitted read/304.
Presentation fields and read timestamps are excluded from the signed context.

Existing project/environment, expiry, revocation generation, pointer/lifecycle
and runtime/authority/admission-generation bindings remain. Old `v2p` proofs
without the new signed revision fail closed. Production capabilities remain OFF;
this correction does not provision a signing key or issue a live certificate.
Preview `v1` signing remains unchanged.

## Existing controlled enrollment

Production native OTP requests now select the same
`authorizeProductionParticipantEmailOtpEligibility` adapter as web enrollment.
The database-approved claim selects provisioning/recovery and the canonical
player; the caller cannot select that mode. Existing claim completion, cleanup,
recovery, collision handling, rate limits and provider CAPTCHA handling remain.
Preview remains existing-user-only.

The private canonical mode selects signup resend or existing-user email OTP.
Public acknowledgements always say `verificationType: email`, without revealing
first-login status. Supabase's generic email verification supports signup and
signin (see installed auth-js `GoTrueClient.verifyOtp` documentation); the native
SDK continues using `.email`. This is not public `signUp` or `shouldCreateUser`.
For a PREPARED first-login identifier, canonical verification is recorded before
requiring the VERIFIED identity context. Certificate issuance always requires
that final canonical context and a fresh certification-admission check.

## Local certification

`test/pn8a-auth-integration.test.mjs` covers revision changes, revoked context,
response rechecks, approved first login, existing recovery claims, generic
denial/failure behavior, cleanup, CAPTCHA/input bounds and default-OFF admission.
All external operations are injected fakes; no test contacts an Auth provider.

Compile `scripts/pn8a-certification-probe.swift` in the paired isolated iOS
candidate with its actual NativeEnvironment/KeychainStore/BaggerCertificationStore
sources, then run:

```sh
node --conditions=react-server scripts/pn8a-certification-integration.mjs /path/to/compiled-probe
```

The synthetic proof travels only through stdin to an in-memory Swift secure-store
fake. Output contains PASS/REJECTED classifications, not the proof.

## Release dependency

Next: PN-8B, revalidate current Production and release this server correction
through the established normal-release protocol with READS/AUTH/CERTIFICATION/
SCORING all OFF. Separately reconcile the iOS correction in PN-8C. Neither mixed
version ordering grants access while gates remain OFF. Live E2E requires both
corrections plus separately authorized provider/signing setup and bounded
Auth/certification/read activation. Scoring remains OFF.
