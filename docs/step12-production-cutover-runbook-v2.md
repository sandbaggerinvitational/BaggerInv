# Step 12 Production cutover runbook v2 — maintenance-window boundary

This runbook is executable only after the `MAINTENANCE_WINDOW_V1` release path
is certified and the owner separately authorizes Step 12. Implementation,
migration, candidate-deployment, or prior rehearsal authorization does not
authorize a Production cutover, scoring-authority commit, participant-identity
transition, public-read cutover, worker activation, or Odds publication.

The maintenance path preserves the installed ADMISSION_V3 lease, authority
epoch, Supabase ingress, revision, stale-client, authorization, audit,
outbox/archive, rollback, resource-isolation, and parity controls. It does not
require a new Vercel WAF or Google Drive ACL rehearsal and it does not alter the
existing provider-fence path.

## Required certified inputs

Bind every payload to the exact frozen SHA, non-authoritative candidate,
Production Supabase project `ymqhhtxaywtqllynrmxe`, Production workbook
`1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4`, Vercel project
`prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU`, canonical domain
`https://baggerinv.com`, tournament, activation revision, authority generation,
admission revision/generation, certification fingerprint, environment-delta
fingerprint, and execution-bundle fingerprint.

Step 12 GO/NO-GO requires:

- the additive maintenance-window migration installed and backward-compatible;
- the exact frozen release and authoritative GitHub tip;
- a clean worktree, affected tests, final suite, Production build, provider
  authentication, and Production/Preview isolation green;
- live starting state `DORMANT / GOOGLE / PASSPORT / admission OPEN` with
  Supabase ingress and workers disabled;
- first Supabase canonical write possible/observed `false/false`;
- current History, tournament, Guide, Draft, Prediction Settings, Published
  Odds, War Room, Auth, PWA, rollback, and worker certifications current;
- no active WAF rule, Drive ACL fence, provider restoration, or other
  nonterminal physical-fence operation.

Rejected, retired, restored, and otherwise terminal Step 11.6 epochs are
historical evidence and do not block `MAINTENANCE_WINDOW_V1`. Do not delete,
rewrite, or reuse them. Do not hydrate payload values from browser memory; read
current values from protected diagnostics and durable receipts.

## Authority progression

The phase progression remains sequential:

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

The scoring boundary is:

```text
GOOGLE canonical / current-app admission OPEN / maintenance NORMAL
-> GOOGLE canonical / current-app admission CLOSING / SCORING_MAINTENANCE
-> GOOGLE canonical / current-app admission CLOSED / SCORING_MAINTENANCE
-> GOOGLE canonical / Supabase prepared / Supabase ingress PAUSED
-> SUPABASE canonical / current-app Google admission CLOSED / ingress PAUSED
-> SUPABASE canonical / Supabase ingress OPEN / maintenance NORMAL
```

Authority and admission are independent. A short explicit scoring pause is
valid. Ambiguous authority, automatic cross-authority retry, and
`GOOGLE admission OPEN + Supabase ingress OPEN` are forbidden.

## Maintenance boundary

`boundary_mode=MAINTENANCE_WINDOW_V1` is persistent, audited, exact-resource
scoped, and service-role controlled. The inspector reports
`maintenance_state=NORMAL|SCORING_MAINTENANCE`. Use these supported operations:

- `begin_production_scoring_maintenance` closes current-application admission
  atomically from `OPEN` to `CLOSING` while Google remains canonical;
- the existing ADMISSION_V3 drain accounts for all admitted operations until
  they are definitively successful, definitively absent, or reconciled;
- `finalize_production_scoring_maintenance_snapshot` binds the drained closure,
  stable Google readbacks, final Google fingerprint, and exact Supabase parity;
- `prepare_production_maintenance_authority_epoch` prepares the exact
  maintenance-bound Supabase authority epoch;
- `commit_production_maintenance_authority_epoch` makes Supabase canonical but
  leaves its scoring ingress paused;
- `resume_production_supabase_scoring` opens Supabase ingress and ends
  maintenance only after the committed runtime passes smoke checks;
- `abort_production_maintenance_authority_epoch` is the explicit precommit
  abort path;
- `begin_production_supabase_rollback_maintenance` atomically pauses Supabase
  ingress before a committed rollback can enumerate or reconcile writes;
- `finalize_production_maintenance_rollback_snapshot` binds the drained
  Supabase write set and exact Google reconciliation result;
- `rollback_production_maintenance_authority_epoch` returns canonical authority
  to Google while Google admission remains CLOSED;
- `resume_production_google_scoring_after_maintenance_rollback` is the only
  committed-rollback reopen path and must satisfy
  `assert_maintenance_google_reopen_safe`.

Provider evidence may be absent only for this exact boundary mode. Existing
provider-mode behavior remains unchanged.

While maintenance is active, participant and Director canonical scoring,
lifecycle, pairing, course/tee, access, lock, Finalize, and Reopen mutations
fail with an explicit temporary-maintenance response. Do not queue a rejected
request for later submission or reinterpret it under another authority.
Read-only pages and separately classified Google authoring such as Guide,
Draft, and Prediction Settings may continue.

## Safety predicates

`assert_maintenance_cutover_snapshot_safe` may pass only when:

- authority is GOOGLE and maintenance is `SCORING_MAINTENANCE`;
- current-app admission is CLOSED with protocol enforcement active;
- Supabase ingress and workers are disabled;
- active, potential, unresolved, ambiguous, partial, and unclassified
  canonical current-app mutations are all zero;
- no canonical queue/backlog can later mutate Google;
- exact project, workbook, tournament, activation and admission generations;
- no conflicting prepared authority epoch;
- two fresh, repeated Production Google readbacks captured after closure have
  the same scoring/current-state fingerprint;
- no mutation exists beyond the closure high-watermark;
- Supabase shadow is synchronized to that exact fingerprint with zero
  unexplained differences;
- first Supabase canonical write possible/observed is `false/false`.

`assert_maintenance_cutover_prepare_safe` additionally requires the final
Google fingerprint durably bound to the maintenance closure, exact match
revisions and checkpoints, unchanged admission/authority generations, exact
Supabase parity, and ingress/workers still disabled.

`assert_maintenance_cutover_commit_safe` additionally requires a valid prepared
CUTOVER epoch bound to the same closure, maintenance still active, admission
still CLOSED, a fresh Google readback still matching the bound fingerprint,
Supabase parity still exact, the exact expected precommit deployment and
configuration, unchanged activation/admission revisions, and first-write
possible/observed still `false/false`.

Authority commit must atomically make Supabase canonical while leaving
Supabase ingress PAUSED. It must not make a canonical Supabase write possible.
Only `resume_production_supabase_scoring` may open ingress and set
first-write-possible true after live runtime verification.

## Sequential execution

### 1. New-Mac preflight and recovery snapshot

Verify repository identity, branch, local SHA, GitHub tip, clean worktree,
Node/npm, GitHub/Vercel/Supabase/Google authentication, exact Production
resources, tests, `git diff --check`, and Production build. Capture `STEP12-R0`
for Vercel, Google, Supabase, Auth, Odds, environment, authority, admission,
ingress, workers, and first-write state. Stop on any mismatch.

### 2. Freshness and final GO/NO-GO

Revalidate completed History, current tournament, roster, rounds, matches,
pairings, lifecycle, scores, Guide, editorial, Prediction Settings, Draft,
Published Odds, and War Room. Synchronize legitimate Production content only
through the certified path. Require zero unexplained differences. Confirm no
actual provider fence/restoration is active.

### 3. Stage through CURRENT_READS

Stage the exact SHA with `boundary_mode=MAINTENANCE_WINDOW_V1`. Sequentially
enter `STATIC_BACKEND`, promote the barrier-aware candidate only after resource
assertions, complete read-source transitions, activate Supabase participant
identity, and enter `CURRENT_READS`. Verify each phase before advancing.
Google remains canonical scoring, current-app admission remains OPEN, and
Supabase scoring ingress remains paused.

### 4. PWA and Director precommit checkpoint

Require the current service worker, old-cache eviction, no caching of
Auth/scoring/admin APIs, Supabase Director `CB01`, healthy Auth/Turnstile/SMTP,
correct Player ID and entitlement, stale Passport rejection, and server-side
stale-client rejection. Do not send another physical OTP without explicit
approval.

### 5. Enter scoring maintenance

1. Announce the short scoring-maintenance window and freeze owner/Director
   canonical current-state changes.
2. Re-read exact authority, admission, ingress, worker, resource, revision,
   generation, and first-write state.
3. Call `begin_production_scoring_maintenance` once with a durable request ID
   and exact optimistic revisions.
4. Require GOOGLE canonical, maintenance `SCORING_MAINTENANCE`, current-app
   admission CLOSING, Supabase ingress disabled, and workers disabled.
5. Verify participant and Director canonical mutations return the explicit
   maintenance response, with no queued or fallback write.

A lost response is recovered by inspecting the same durable request identity;
never submit a differently identified close request speculatively.

### 6. Drain, fingerprint, and reconcile

Drain all ADMISSION_V3 work. Do not treat timer expiry, process exit, or an
ambiguous Google response as completion. Require every potential writer to be
definitively resolved and require admission CLOSED.

Capture two fresh Google scoring/current-state readbacks after closure and
require equal fingerprints. Import/reconcile that exact state into Production
Supabase while Google remains canonical and Supabase ingress remains paused.
Require zero unexplained differences, then call
`finalize_production_scoring_maintenance_snapshot` and require
`assert_maintenance_cutover_snapshot_safe` to pass.

### 7. Prepare Supabase authority

Require `assert_maintenance_cutover_prepare_safe` to pass, then call
`prepare_production_maintenance_authority_epoch` with the exact maintenance
closure and fingerprint. Deploy/bind the exact precommit Supabase configuration
while ingress remains paused. Scoring remains explicitly unavailable.

### 8. Final pre-write check and commit

Immediately before commit require:

- exact frozen SHA, deployment, project, workbook, tournament, and phase;
- maintenance `SCORING_MAINTENANCE` and current-app admission CLOSED;
- every active/potential/unresolved/ambiguous writer zero;
- fresh Google fingerprint equal to the bound final fingerprint;
- Supabase shadow exact with zero unexplained differences;
- prepared epoch, activation revision, and generations exact;
- Supabase ingress paused and workers disabled;
- participant identity, Director, current reads, and PWA healthy;
- first-write possible/observed `false/false`;
- `assert_maintenance_cutover_commit_safe` passes.

Call `commit_production_maintenance_authority_epoch` once with its durable
request ID. Require SUPABASE canonical, Google current-app admission CLOSED,
Supabase ingress still PAUSED, maintenance still `SCORING_MAINTENANCE`, and
first-write possible/observed still `false/false`. Authority commit is not a
scoring mutation.

### 9. Verify and resume Supabase scoring

Verify live SHA, exact Production Supabase, canonical domain, Supabase Auth,
authority epoch, source diagnostics, stale-client denial, current reads,
participant/match authorization, and no unexpected Google or Supabase write.
Then call `resume_production_supabase_scoring` once.

Require Supabase ingress OPEN, maintenance NORMAL, Google admission CLOSED,
first-write-possible true with its timestamp, and first-write-observed false
unless a legitimate tournament mutation has occurred. Never fabricate a score,
Finalize, Reopen, pairing, or other tournament fact.

### 10. Workers, Odds, and observation

Enable only the certified scoring mirror and Round Scorecards archive workers
with the dedicated Production Google identity. Move War Room and Odds
calculation inputs to Supabase. Keep Odds publication authority GOOGLE and
create no publication. Complete website/PWA/Auth/source/isolation/security
smokes and observation. Arm the first-score, first-Finalize, and first-Reopen
checkpoints for legitimate events.

## Historical-deployment residual risk

The maintenance boundary stops current ADMISSION_V3 application mutations; it
does not cryptographically revoke credentials from every pre-ADMISSION_V3
immutable Vercel deployment. Such a deployment could theoretically mutate
Google if a caller knows a retained immutable hostname and legacy request
contract, has usable historical participant/Director authorization, and sends
an eligible mutation. Those origins are not part of normal application
navigation.

Mitigate this consciously by using a short pre-tournament window, freezing
owner/Director current-state changes, avoiding old deployment URLs, checking
Google immediately before commit, and checking it again before maintenance is
released. Repeated fingerprints detect changes completed before readback; they
cannot prevent a delayed legacy mutation after the last read.

Any Google current-state change after Supabase commit is a critical divergence:
keep maintenance active, pause Supabase ingress if opened, preserve both write
sets, classify the first-write boundary from control-plane evidence, and follow
the applicable rollback/reconciliation path. Never restore Google admission by
changing source variables first.

## Rollback matrix

| State | Supabase canonical | Supabase write observed | Maintenance/current-app admission | Safe rollback |
|---|---:|---:|---|---|
| Before maintenance | No | No | NORMAL / OPEN | Normal Google operation |
| CLOSING | No | No | SCORING_MAINTENANCE / CLOSING | Drain or cancel safely; explicit maintenance abort/reopen |
| CLOSED pre-prepare | No | No | SCORING_MAINTENANCE / CLOSED | Verify Google and closure; explicit reopen; return NORMAL |
| Prepared | No | No | SCORING_MAINTENANCE / CLOSED | Abort epoch; verify Google; reopen; return NORMAL |
| Committed/no write | Yes | No | SCORING_MAINTENANCE / CLOSED | Begin rollback maintenance; bind no-write snapshot; roll back authority paused; verify Google; explicitly resume Google; return NORMAL |
| Committed/post-write | Yes | Yes | SCORING_MAINTENANCE / CLOSED | Begin rollback maintenance; drain/enumerate/reconcile; bind exact snapshot; roll back authority paused; explicitly resume Google |

No rollback may reopen Google while Supabase remains canonical, while a
Supabase mutation can begin, or while any Supabase write is unreconciled.
`assert_maintenance_google_reopen_safe` must pass before reopen. A racing
Supabase mutation must be resolved through the ingress pause/drain contract
before authority rollback.

## Lost response and idempotency

Every control-plane mutation uses one stable durable request identity. After a
lost response, inspect authoritative state and replay only that same identity
where the operation contract permits it. Never infer maintenance, authority,
ingress, or first-write state from an HTTP response alone.

## Final no-go rules

Stop for any wrong project/workbook/tournament, Preview contamination, stale
revision/generation, unexpected phase, active or ambiguous writer, unstable
Google fingerprint, Supabase parity drift, active physical fence/restoration,
Director/Auth failure, stale client accepted, hidden Google fallback, dual
authority, first-write marker mismatch, rollback uncertainty, or client-secret
exposure. Choose rollback from database/control-plane evidence, not operator
inference.

The installed PWA shares the Production deployment and backend. It receives no
separate authority cutover. Google remains explicitly retained for approved
authoring, mirror/archive, Odds publication, and rollback; it is not a
simultaneous canonical scoring writer.
