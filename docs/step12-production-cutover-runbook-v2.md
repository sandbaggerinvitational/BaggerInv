# Step 12 Production cutover runbook v2 — ACL writer boundary

This runbook is executable only after Step 11.6 passes and the owner separately
authorizes Step 12. The Step 11.6 rehearsal authorization does not authorize any
Step 12 phase, deployment promotion, identity transition, scoring authority
commit, worker activation, or public read cutover.

## Required certified inputs

Bind every payload to the exact Step 11.6 frozen SHA, non-authoritative
candidate deployment, Production Supabase project
`ymqhhtxaywtqllynrmxe`, Production workbook
`1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4`, Vercel project
`prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU`, `https://baggerinv.com`, activation
revision, authority generation, admission revision/generation, final
certification fingerprint, environment-delta fingerprint v2, and execution
bundle fingerprint v2.

Step 12 GO/NO-GO additionally requires:

- the historical writer-scope artifact preserved as historical evidence
  with `acceptedAsPrimaryProof=false` and
  `unexplainedConcurrencyWindowCount=1`;
- the fixed immutable ACL-v2 artifact at
  `docs/evidence/step11-6-production-google-drive-acl-v2-acceptance-v1.json`,
  exactly matched by the manifest, with `acceptedAsPrimaryProof=true` and
  `unexplainedConcurrencyWindowCount=0`;
- rehearsal implementation SHA A recorded by that artifact, frozen
  certification SHA B bound by the execution bundle, and an independently
  verified A-to-B evidence-only diff with zero unexpected paths;
- exact old-deployment and Production-capable-origin enforcement proof;
- exact Drive identity/capability and WAF baseline/critical-window proofs;
- the exact ACL-intent legacy-principal fingerprint equal to the ending
  ADMISSION_V3 `provider_principal_fingerprint`;
- no unresolved or `OUTCOME_UNKNOWN` ACL dispatch;
- Step 11.6 ending snapshot `DORMANT / GOOGLE / PASSPORT / OPEN`;
- all affected tests, Production build, provider authentication, and resource
  isolation green.

Do not hydrate placeholders from browser memory. Read current revisions and
fingerprints from protected diagnostics and durable receipts immediately before
rendering each payload.

Every `REHEARSAL`, `CUTOVER`, and `ROLLBACK` provider-control request executes
from the one exact non-authoritative Project Preview candidate. Its signed
scope is always `candidateDeploymentTarget=PREVIEW` plus the exact deployment
ID, frozen commit, branch alias, immutable origin, Vercel project, Production
Supabase project, and Production workbook. The purpose/transition mode names
the lifecycle; it never relabels this control runtime as a Production-target
deployment. The protected executor uses
`productionWriterFenceCandidateCutoverEnvironment`, requires at least
`CURRENT_READS` for Step 12 actions, and rejects a Production runtime so the
critical WAF cannot accidentally expose a second control origin. Live domain
promotion and live application phase changes remain separate sequential
operations.

## Authority progression

```text
DORMANT
-> STAGED
-> STATIC_BACKEND
-> READ_CUTOVER
-> IDENTITY
-> CURRENT_READS
-> SCORING_PREPARE
-> SCORING_COMMIT
-> WORKERS
-> ODDS_WAR_ROOM
-> OBSERVATION
```

Canonical authority and mutation admission are independent facts. The only
legal scoring progression is:

```text
GOOGLE canonical / legacy admission OPEN
-> GOOGLE canonical / legacy admission CLOSING
-> GOOGLE canonical / legacy admission CLOSED
-> GOOGLE canonical / Supabase prepared / Supabase ingress paused
-> SUPABASE canonical / legacy admission CLOSED
```

`GOOGLE admission OPEN + Supabase scoring ingress OPEN` is forbidden. A short,
explicit participant-facing scoring pause is valid; ambiguous or dual authority
is not.

## WAF lifecycle

Two WAF configurations must never be conflated:

- `BASELINE`: exact legacy-compatible pre-cutover configuration;
- `CRITICAL_WINDOW`: temporary five-group containment used while a Drive ACL
  update, drain, fingerprint, prepare, commit, or rollback restoration can race
  an old function.

`CRITICAL_WINDOW` consists of the exact signed-candidate control exception,
noncanonical deny, canonical non-safe-method deny, canonical historical
safe-method writer-route deny, and canonical safe-read allow groups. Record its
database activation timestamp. The critical WAF is not the canonical writer
fence; the Drive ACL is.

Each cutover or rollback window creates one fresh, immutable
`CRITICAL_WINDOW_WAF_V1` epoch:

```text
ACTIVATION_PENDING
-> ACTIVE_UNBOUND
-> FENCE_BOUND
-> RESTORE_PENDING
-> BASELINE_RESTORED
```

The same epoch carries distinct signed `BASELINE_CAPTURE`, `CRITICAL_ACTIVE`,
fresh `CRITICAL_REATTEST`, and `BASELINE_RESTORED` evidence. Rule insertion is
proven by its exact module-owned provider response and does not invent draft
evidence. Each provider mutation uses a durable reserve → mark-started → result
record. `OUTCOME_UNKNOWN` is terminal and inspect-only; never retry it after a
TTL. The epoch binds atomically to one Drive ACL fence while
`ACTIVE_UNBOUND`. `BASELINE_RESTORED` is terminal and cannot authorize another
fence, close, or rollback.

After a successful Supabase scoring commit, keep the legacy Drive permission at
`reader` but restore the exact `BASELINE` WAF so canonical Supabase scoring
`POST`s can reach the application. Before any rollback ACL restoration, first
reinstall and re-attest `CRITICAL_WINDOW`.

## Sequential execution

### 1. New-Mac preflight and recovery snapshot

Verify exact repository/branch/local SHA/GitHub tip, clean worktree, Node/npm,
GitHub/Vercel/Supabase/Google authentication, Production resource isolation,
critical tests, `git diff --check`, and Production build. Capture `STEP12-R0`
for Vercel, Google, Supabase, Auth, Odds, and environment state. Stop on any
provenance or resource mismatch.

### 2. Freshness and final GO/NO-GO

Revalidate History, current tournament, roster, rounds, matches, pairings,
lifecycle, scores, Guide, editorial, Prediction Settings, Draft, Published
Odds, and War Room. Synchronize legitimate Production content only through the
certified path. Require zero unexplained differences and the exact ACL-v2
acceptance binding.

### 3. Stage through CURRENT_READS

Sequentially stage the exact release, enter `STATIC_BACKEND`, promote only
after resource assertions, complete read-only source transitions, activate
Supabase participant identity, and enter `CURRENT_READS`. At each phase capture
the control-plane state and authority matrix. Google remains canonical scoring,
legacy admission remains `OPEN`, and Supabase scoring ingress remains paused.

### 4. PWA and Director precommit checkpoint

Require current service worker, old caches evicted, no auth/scoring/admin API
caching, Supabase Director `CB01`, healthy Auth/Turnstile/SMTP, correct Player
ID/entitlement, stale Passport rejection, and server-side rejection of stale
clients. Do not send an OTP without explicit approval if another physical email
is required.

### 5. Install the singular-writer boundary

1. Reinspect exact `BASELINE` WAF and Drive permission state.
2. Record the current owner/provider-admin freeze.
3. Start a new `purpose=CUTOVER` critical-WAF epoch after the recorded Step 12
   start. Require signed baseline evidence, reserve/start/resolve the one
   run-owned rule insertion, reserve/start/resolve draft activation, and require
   distinct signed `CRITICAL_ACTIVE` readback. Record its database activation
   time, new evidence identities, new install/fence run identities, and an
   unexpired owner freeze. Require `baselineWafRestored=false` and no restored
   WAF fingerprint. The restored Step 11.6 rehearsal receipt and run identities
   are historical and must not be reused.
   The purpose-bound owner statement must be exactly
   `I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS PRODUCTION CUTOVER`;
   the rehearsal-only statement is rejected.
4. Call the supported persistent-fence install with the same exact
   `critical_waf_epoch_id`, which atomically consumes its single
   `ACTIVE_UNBOUND` binding opportunity, plus
   `lifecycle_mode=CUTOVER`, one stable request ID, exact candidate/resource
   tuple, exact quiesce evidence, and exact baseline fingerprints.
5. Require the Drive legacy permission dispatch result `TARGET_CONFIRMED` and
   fresh readback showing `reader`, `canEdit=false`, `canShare=false`.
6. After at least 190 database-clock seconds, record settlement readback 1.
   After at least another 10 seconds, atomically record readback 2, finish the
   provider fence, and transition legacy admission `OPEN -> CLOSING`.

If the Drive result is `OUTCOME_UNKNOWN`, stop. Keep the WAF, permission reservation,
and admission state fail-closed. Never retry the ACL update, reopen, or proceed
because 1,810 seconds elapsed.

A lost response may be recovered only by inspecting and replaying the same
durable request identity. Restoring `BASELINE` terminally consumes this
critical-window epoch. A consumed receipt cannot install another fence or
authorize a later rollback; that requires a new active provider-attested epoch.

### 6. Drain and close

Call the protected drain operation using the exact closure and external-fence
IDs. Require:

- active/potential legacy writers `0`;
- unresolved, ambiguous, partial, and unclassified Google writers `0`;
- unresolved legacy outbox/archive work `0` where it affects rollback safety;
- no ACL `OUTCOME_UNKNOWN`;
- exact admission and authority generations unchanged.

Only then capture two stable readbacks and the final Google-authoritative
fingerprint. Atomically finalize admission `CLOSED`. Require:

```text
FINAL_GOOGLE_AUTHORITY_SNAPSHOT_SAFE = true
```

No old deployment, immutable URL, alias, stale tab, or installed PWA may create
a Google canonical write after this point.

### 7. Prepare Supabase authority

Reconcile the final Google fingerprint to the Production Supabase shadow while
Google remains canonical and legacy admission remains `CLOSED`. Require exact
parity and:

```text
SUPABASE_AUTHORITY_PREPARE_SAFE = true
```

Call `prepare_production_authority_epoch(CUTOVER)`. Deploy the exact precommit
configuration while Supabase ingress remains paused. Scoring must be visibly
and explicitly unavailable during this pause; do not queue or reinterpret a
legacy request.

### 8. Final pre-write check and commit

Immediately before commit require:

- exact frozen SHA/project/workbook/deployment/phase;
- legacy Drive role `reader` and ACL dispatch `TARGET_CONFIRMED`;
- legacy admission `CLOSED`;
- active/potential/unresolved/ambiguous/partial writers all `0`;
- final Google fingerprint stable and Supabase shadow exact;
- prepared epoch valid;
- Supabase ingress paused and workers disabled;
- participant identity, Director, current reads, and PWA healthy;
- `FIRST_SUPABASE_CANONICAL_WRITE_POSSIBLE=false`;
- `FIRST_SUPABASE_CANONICAL_WRITE_OBSERVED=false`;
- `SUPABASE_AUTHORITY_COMMIT_SAFE=true`.

Call `commit_production_authority_epoch` once with its durable request ID.
After success, Supabase is the sole canonical scoring authority, legacy
admission and the Drive permission remain closed/reader, ingress becomes
available, and first-write possible becomes true. Authority commit is not an
actual scoring mutation.

### 9. Restore normal network routing

Once the Supabase authority commit is proven, Google canonical mutation is
impossible, and `CRITICAL_WINDOW` has remained active for at least 1,810
database-clock seconds from its signed provider activation time, record fresh
`CRITICAL_REATTEST` evidence on the same `FENCE_BOUND` epoch. Reserve/start the
single `BASELINE_VERSION_ACTIVATE` dispatch, then require signed
`BASELINE_RESTORED` evidence whose full semantic configuration equals the
captured baseline. Do not restore the legacy Drive permission. If the minimum
hold has not elapsed, keep scoring explicitly paused and wait; do not shorten
the horizon. Verify apex Supabase scoring routes work and all noncanonical/old
routes still fail the application authority contract. Baseline restoration
terminally consumes the epoch; no later operation may reuse it.

### 10. Workers, Odds, and observation

Enable only certified scoring mirror and Round Scorecards archive workers with
the dedicated Production Google account. Move War Room and Odds calculation
inputs to Supabase. Keep Odds publication authority Google and create no new
publication. Complete website/PWA/Auth/source/isolation/security smokes and
immediate observation. Do not fabricate a score, Finalize, Reopen, pairing, or
publication.

## Lost response and idempotency

Database operations use stable durable request identities and are rediscovered
through read-only diagnostics after a lost response. Drive ACL dispatch is
stricter: the same dispatch may be inspected, but a second provider update is
forbidden. Only a provider-module-issued `TARGET_CONFIRMED` result plus exact
readback may advance. Caller-supplied result JSON, cloned capabilities, and
`OUTCOME_UNKNOWN` are never authoritative.

## Rollback matrix

| State | Supabase canonical | Supabase write observed | Legacy ACL/admission | Safe rollback |
|---|---:|---:|---|---|
| Before close | No | No | writer / OPEN | Normal legacy operation |
| CLOSING | No | No | reader / CLOSING | Drain or abort; hold critical WAF; confirmed ACL restore; reopen; baseline WAF |
| CLOSED pre-prepare | No | No | reader / CLOSED | Confirm safe abort; confirmed ACL restore; reopen; baseline WAF |
| Prepared | No | No | reader / CLOSED | Abort epoch; confirmed ACL restore; reopen; baseline WAF |
| Committed/no write | Yes | No | reader / CLOSED | Install critical WAF; pause ingress; roll back authority; confirmed ACL restore; reopen; baseline WAF |
| Committed/post-write | Yes | Yes | reader / CLOSED | Install critical WAF; pause/drain Supabase; enumerate and reconcile; roll back authority; confirmed ACL restore; reopen; baseline WAF |

No rollback may reopen Google while Supabase remains canonical or any Supabase
write is unreconciled. No rollback may restore the ACL while an ACL result is
`OUTCOME_UNKNOWN`. A racing Supabase mutation must be resolved by the ingress
pause/drain contract before authority rollback. A rollback that needs a new
`CRITICAL_WINDOW` epoch must provider-attest that fresh epoch and hold it for at
least 1,810 database-clock seconds before the legacy Drive permission is
restored to `writer`; restoring `BASELINE` then consumes that epoch.

## Step 11.6 rehearsal versus Step 12

Step 11.6 uses `lifecycle_mode=REHEARSAL`, returns the legacy ACL to `writer`
with its exact baseline capabilities, and restores `BASELINE` while Production
remains `DORMANT`. Its restored quiesce evidence is certification history, not
an active Step 12 fence.

Step 12 uses `lifecycle_mode=CUTOVER`, keeps the legacy ACL at `reader` through
prepare, commit, workers, and observation, and restores only the normal WAF
routing after commit. Google remains authoring/mirror/archive/Odds-publication
and explicit rollback infrastructure; it is not a simultaneous canonical
scoring writer.

## Final no-go rules

Stop for any wrong project/workbook/principal, Preview contamination, stale
revision/generation, unexpected phase, active or ambiguous writer, ACL
`OUTCOME_UNKNOWN`, WAF drift, Director/Auth failure, stale client accepted, fingerprint
drift, direct Google canonical mutation, first-write marker mismatch, or client
secret exposure. Choose the rollback procedure from database evidence, never
from operator inference.

The installed PWA shares the same deployment and backend. It receives no
separate datastore or authority cutover.
