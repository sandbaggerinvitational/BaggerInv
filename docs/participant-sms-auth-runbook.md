# Participant SMS authentication runbook

This runbook operates the final participant sign-in experience introduced in
Step 8B.3. It does not authorize a Production rollout.

## Frozen authority model

- Supabase Auth owns email/phone OTP verification and the persistent session.
- `participant_identity.participant_auth_identifiers` owns approved PHONE and
  EMAIL identifiers.
- `participant_identity.user_player_links` owns Auth user → Player ownership.
- `scoring_authority.tournament_players` owns active tournament membership.
- Existing scoring and Director authorities remain method-neutral. Email and
  phone login to the same Auth UUID receive the same authorization.
- Director Mission Control owns Add Mobile, Change Mobile, and Revoke Mobile.
  The participant login page never enrolls or changes a phone.

The legacy `/activate` route remains an email/Passport rollback path. Do not
remove it as part of SMS rollout.

## Preview physical certification

The owner completed the final protected participant flow on physical iPhone:

- The polished SMS-first screen and email fallback rendered without operator
  jargon.
- Cloudflare Turnstile passed through Supabase's supported CAPTCHA boundary.
- Twilio Verify delivered one branded Bagger message.
- iOS offered the **From Messages** one-time-code suggestion.
- The code UI and phone OTP verification passed.
- The existing Auth user, Player Passport, and canonical Player remained the
  previously certified identity.
- The post-verification transition to Home was fast and passed.

This is a Preview auth-product certification. It does not enable Production SMS
or make unreviewed participant phone data ready for rollout.

## Preview feature controls

All four controls must be ready before SMS appears:

```text
PARTICIPANT_SMS_AUTH_ENABLED=true
PARTICIPANT_SMS_CAPTCHA_REQUIRED=true
PARTICIPANT_SMS_CAPTCHA_CONFIGURED=true
NEXT_PUBLIC_PARTICIPANT_SMS_TURNSTILE_SITE_KEY=<Preview public site key>
```

`PARTICIPANT_SMS_PREVIEW_ROLLOUT=DESIGNATED` permits only the proven rehearsal
identity. Change it to `VERIFIED` only for a reviewed broad-Preview stage.

The application also requires the existing Preview Participant Identity and
Supabase server configuration. Production is hard-blocked by runtime code even
if a flag is set accidentally.

### Safe enable sequence

1. Apply `202608220001_preview_participant_sms_login_product.sql` to Preview.
2. Create a Preview Turnstile widget and configure Supabase CAPTCHA as below.
3. Add the public site key and the three enabled/configured flags to the Vercel
   Preview environment only. Leave rollout `DESIGNATED`.
4. Redeploy Preview and confirm `/participant-auth` defaults to Mobile.
5. Run one owner-initiated physical test. Automated tests never send SMS.

### One-step rollback

Set `PARTICIPANT_SMS_AUTH_ENABLED=false` in Preview and redeploy. The page
defaults to the existing email-code flow. This does not remove phone ownership,
change Player links, revoke sessions, or change Player IDs.

## Cloudflare Turnstile and Supabase CAPTCHA

Supabase Auth validates the Turnstile token. The application does not implement
a second CAPTCHA verifier.

1. In Cloudflare Dashboard, open **Turnstile** and choose **Add widget**.
2. Name it for Bagger Preview, select **Managed**, and allow the stable Preview
   hostname plus any immutable Preview hostname used for physical QA.
3. Put the public site key in Vercel's Preview-only
   `NEXT_PUBLIC_PARTICIPANT_SMS_TURNSTILE_SITE_KEY` variable.
4. In the Preview Supabase project, open **Authentication → Bot and Abuse
   Protection → CAPTCHA protection**. Choose **Cloudflare Turnstile**, enable
   CAPTCHA, and enter the Turnstile secret key there.
5. Set `PARTICIPANT_SMS_CAPTCHA_CONFIGURED=true` only after both sides are saved.
6. Redeploy Preview. Verify a normal token reaches Supabase and a missing or
   invalid token is rejected before SMS provider work.

The secret is never a repository or Vercel client variable. Turnstile tokens
are single-use request material and are reset after each send. The same CAPTCHA
boundary protects email-code initiation once Preview CAPTCHA is configured,
because Supabase's Auth CAPTCHA setting applies at the Auth API boundary.

Official reference: <https://supabase.com/docs/guides/auth/auth-captcha>

## Twilio Verify readiness

Supabase Phone Auth invokes the configured Twilio Verify Service. The app never
stores Twilio credentials or calls Twilio directly.

Current Preview provider readiness is physically certified:

1. The Twilio account is upgraded; the former trial-recipient restriction is
   no longer the rollout blocker.
2. The account's Primary Compliance Profile is approved.
3. The Preview Verify Service delivered the branded message beginning
   `Your Bagger verification code is:` through the protected final UI.
4. iOS recognized the message and offered the **From Messages** one-time-code
   suggestion.
5. Retain Fraud Guard, geographic permissions, Verify logs, and usage alerts
   while expanding the reviewed Preview cohort.

This certifies provider/account readiness for staged Preview Verify delivery.
Broad Preview availability still depends on reviewed VERIFIED phone ownership;
Production requires its own separately configured provider and rollout approval.

Official references:

- <https://www.twilio.com/docs/verify/api/verification>
- <https://www.twilio.com/docs/verify/preventing-toll-fraud/sms-fraud-guard>

## Eligibility and failure diagnosis

An SMS send is allowed only when one protected lookup proves all of the
following: VERIFIED phone ownership, same confirmed phone on the same Auth user,
one phone identity, active Player link, active tournament membership, no
collision, and the current Director/scoring parity snapshot. Public responses
do not disclose which check failed.

Operator-safe classifications distinguish:

- `PHONE_OTP_NOT_ELIGIBLE`: unknown, unverified, revoked, inactive, or outside
  the current rollout.
- `PHONE_OTP_CAPTCHA_FAILED`: missing, stale, or rejected CAPTCHA token.
- `PHONE_OTP_COOLDOWN` / `PHONE_OTP_RATE_LIMITED`: application abuse control.
- `PHONE_OTP_PROVIDER_UNAVAILABLE`: Supabase/Twilio send unavailable.
- `PHONE_OTP_AUTH_MISMATCH`: verified Supabase user differs from canonical user.
- `PHONE_LOGIN_PASSPORT_MISSING`: canonical ownership no longer resolves.
- `PHONE_LOGIN_DIRECTOR_PARITY_MISMATCH`: entitlement changed during login.

If Supabase Auth logs a CAPTCHA rejection with Cloudflare's
`invalid-input-secret`, the browser token reached the supported Supabase Auth
boundary but the Turnstile secret configured in Supabase is invalid. Confirm
that the Vercel public site key and the Supabase CAPTCHA secret are the matching
site-key/secret pair from the same Cloudflare widget. Replace the secret only in
**Preview Supabase → Authentication → Bot and Abuse Protection → CAPTCHA
protection**, then save. Do not put the secret in Vercel, source, logs, or chat.

Never log raw phone, email, OTP, CAPTCHA token, access/refresh token, or service
credentials. Use attempt ID and safe classifications only.

## Rate and abuse controls

- CAPTCHA before Supabase OTP initiation.
- 60-second application resend cooldown.
- Maximum three accepted phone requests per identifier fingerprint per hour.
- Maximum six accepted phone requests per client fingerprint per hour.
- Existing attempt limits remain in force behind the public boundary.
- Supabase project SMS limit remains 30/hour.
- Twilio Fraud Guard remains enabled.
- `shouldCreateUser:false` is mandatory.

Client and identifier rate material is HMAC-fingerprinted with
`PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET`; raw IP/phone values are not stored in
the public rate table. Events older than 30 days are removed opportunistically.

## Staged Preview rollout

1. **Owner:** `DESIGNATED`, one verified rehearsal phone.
2. **Small group:** review ownership/provider reachability, then add a bounded
   verified-golfer cohort through the existing Director workflow.
3. **All intended Preview participants:** use `VERIFIED` only after Twilio can
   reach them and phone data has zero duplicates/Auth mismatches.

Email remains available in every stage. No participant phone is populated from
the Guide, contact data, or another roster source.

## Future Production checklist — do not execute in Step 8B.3

- Review/apply Production Participant Identity migrations.
- Configure a separate Production Supabase Phone provider.
- Configure a separate Production Twilio Verify Service.
- Confirm Twilio account/compliance readiness for every intended recipient.
- Create a Production Turnstile widget and configure its secret in Production
  Supabase Auth.
- Review participant phone ownership; resolve every duplicate/mismatch.
- Prove email fallback and rollback.
- Keep Production SMS feature flags OFF through initial deployment.
- Enable a small controlled cohort only after an explicit approval.
- Monitor safe Auth/Verify diagnostics and retain the email-only rollback.
