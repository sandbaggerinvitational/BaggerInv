# Step 11.6 Production Google writer-fence rehearsal

This document certifies the Production legacy-writer boundary. It does not
authorize or perform Step 12. Production must finish this rehearsal in
`DORMANT` with Google scoring, Passport identity, legacy Google admission
`OPEN`, Supabase scoring ingress disabled, workers disabled, and no Supabase
canonical write possible or observed.

## Certified mechanism

The writer fence is the exact Production workbook Drive permission of the
legacy Google service account. The forward transition is:

```text
legacy service account: writer -> reader
```

The restoration transition used only by this Step 11.6 rehearsal is:

```text
legacy service account: reader -> writer
```

No cell value, formula, worksheet structure, score, pairing, lifecycle fact, or
protected range is changed. The dedicated Production Google service account
remains a writer for approved authoring and later mirror/archive work. Preview
identities and workbooks are rejected.

An old deployment cannot bypass this boundary: its retained credential may
still authenticate, but the provider no longer grants that principal edit or
reshare capability. Application-local state, DNS, hostname routing, stale
clients, and deployment age therefore cannot restore canonical Google write
authority.

## Two different WAF configurations

`BASELINE` is the exact pre-rehearsal Vercel firewall configuration. It is
compatible with normal legacy scoring at `baggerinv.com` and is the state that
must be restored when Step 11.6 ends.

`CRITICAL_WINDOW` is a temporary five-group configuration used only while a
Drive ACL transition could be in flight:

1. allow only the exact signed candidate-control `POST` on the certified
   candidate alias and immutable candidate hostname;
2. deny all other requests on noncanonical hosts;
3. deny non-safe methods on the canonical apex;
4. deny safe-method requests to the audited historical writer routes on the
   canonical apex;
5. allow ordinary safe reads on the canonical apex.

Group order, exact host/path sets, project ID, active firewall version, and the
absence of an earlier broad bypass are attested. The critical-window rule is
not a permanent launch rule. Treating it as permanent would block Supabase
scoring `POST`s after Step 12.

The two configurations are joined by one durable
`CRITICAL_WINDOW_WAF_V1` epoch. Its legal lifecycle is:

```text
ACTIVATION_PENDING
-> ACTIVE_UNBOUND
-> FENCE_BOUND
-> RESTORE_PENDING
-> BASELINE_RESTORED
```

There is no reusable `VERIFIED` receipt and no separate restore epoch. The
epoch binds the full ordered active configuration, rule count, provider
version/etag, captured zero-draft baseline, exact run-owned five-group rule,
candidate deployment/SHA/target, control-host fingerprint, purpose, and signed
provider observations. `critical_active_at` comes only from signed active
provider readback. A drain timestamp or caller boolean is not activation proof.

## Provider prerequisites

Before any mutation, require all of the following:

- exact Vercel project `prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU`;
- exact Production Supabase project `ymqhhtxaywtqllynrmxe`;
- exact workbook `1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4`;
- exact candidate SHA, branch, deployment ID, alias, and immutable hostname;
- Supabase Director `CB01` with active `DIRECTOR` entitlement for `2026`;
- exact legacy Drive permission at role `writer` before the rehearsal;
- exact legacy-principal fingerprint from the database ACL intent/proof, equal
  to the final `DORMANT` ADMISSION_V3
  `provider_principal_fingerprint` (a key-generation fingerprint is provenance,
  not a substitute);
- exact dedicated Production identity retained at role `writer`;
- no additional non-owner editor that could act as a canonical legacy writer;
- `canEdit=false` and `canShare=false` after the legacy role becomes `reader`;
- `writersCanShare=true` only for the exact dedicated/legacy pre-fence writer
  set so the dedicated identity can perform the permission transition; after
  fencing, the legacy identity must prove `canEdit=false` and
  `canShare=false`, with no other non-owner editor present;
- owner/provider-admin freeze explicitly recorded for the active window;
- `CRITICAL_WINDOW` WAF attested and its activation time durably recorded.

The Drive permission-management scope is limited to the supported
`drive.file` contract. Metadata inspection uses `drive.metadata.readonly`. Do
not broaden scopes or weaken sharing policy to make the rehearsal pass.
The Step 11.6 receipt accepts only the exact purpose-bound statement
`I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS REHEARSAL`. It cannot be
replayed as a Step 12 cutover freeze.

## Candidate control boundary

The candidate-only control page is:

```text
/admin/step11-6-production-google-writer-fence
```

The protected API is:

```text
/api/admin/step11-6-production-google-writer-fence
```

The ACL rehearsal aliases are:

- `inspect-drive-acl-rehearsal`;
- `downgrade-drive-acl-rehearsal`;
- `restore-drive-acl-rehearsal`.

They map to the same provider-fence implementation with
`lifecycle_mode=REHEARSAL`. That mode is legal only against the certified
`DORMANT / GOOGLE / PASSPORT` state. It must not stage, prepare, commit, enable
ingress, enable workers, or change application authority.

The route accepts only same-origin HTTPS requests on the exact candidate alias
or immutable candidate hostname and validates the exact candidate SHA, branch,
deployment, Vercel project, Production workbook, Production Supabase project,
and server-side Director entitlement before reading a request body or invoking
provider code. Passport, a generic Preview session, and a copied browser token
are not sufficient.

That same exact Project Preview candidate is the sole control runtime for later
`CUTOVER` and `ROLLBACK` provider operations. The distinct
`productionWriterFenceCandidateCutoverEnvironment` contract keeps the candidate
non-authoritative, binds its SHA/project/Production resources and eligible
phase, and rejects `VERCEL_ENV=production`; lifecycle purpose never changes the
candidate deployment target from `PREVIEW`.

## Controlled rehearsal sequence

1. Inspect read-only Production control state and Drive ACL. Capture distinct,
   signed `BASELINE_CAPTURE` WAF evidence for the exact full active
   configuration, provider version/etag, ordered rules, zero pending draft, and
   exact legacy permission fingerprint. Begin one fresh rehearsal epoch.
2. Record the owner's current freeze confirmation. Reserve and start exactly
   one `CRITICAL_RULE_INSERT` provider dispatch. Its exact module-owned response
   confirms the staged rule and records the provider-assigned rule identity;
   do not preselect that identity or fabricate a signed draft observation.
   Reserve and start one `CRITICAL_DRAFT_ACTIVATE` dispatch, then require
   distinct signed `CRITICAL_ACTIVE` evidence. The epoch is now
   `ACTIVE_UNBOUND`, and its provider-observed time is the only WAF activation
   timestamp.
3. Atomically bind that exact `ACTIVE_UNBOUND` epoch, quiesce evidence, and one
   Drive ACL fence. Reinspect the Drive ACL and issue one durable, idempotent
   forward dispatch.
   Require provider result `TARGET_CONFIRMED` and fresh readback showing the
   exact legacy identity at `reader`, `canEdit=false`, and `canShare=false`.
4. Treat that confirmation as `T0`. After at least 190 database-clock seconds,
   perform readback 1. After at least another 10 seconds, perform independent
   readback 2. Both must prove the same permission identity, role, capability
   state, workbook, authority generation, and activation revision.
5. Run the safe old-deployment, immutable-host, alias, stale-tab, stale-PWA,
   and low-level writer fault injections. Google canonical writer calls and
   Supabase canonical writes must both remain zero.
6. Keep `CRITICAL_WINDOW` active and the legacy permission at `reader` for at
   least 1,810 seconds from the database-recorded WAF activation timestamp.
   Refresh owner/provider freeze evidence before it expires. The 1,810-second
   horizon bounds already-running legacy functions; it is not evidence that an
   ambiguous Drive permission request resolved.
7. Record fresh, distinct signed `CRITICAL_REATTEST` evidence on the same
   `FENCE_BOUND` epoch. Reinspect exact source state. Issue one durable ACL
   restore dispatch. Require
   provider result `TARGET_CONFIRMED` and fresh readback of that same permission
   at `writer` with the exact baseline `canEdit=true` and `canShare=true`
   capabilities. Record the explicit intermediate state
   `ACL_RESTORED_WAF_ACTIVE`; this is not a restored/PASS state.
8. Reserve and start one `BASELINE_VERSION_ACTIVATE` dispatch on the same
   epoch. Require distinct signed `BASELINE_RESTORED` evidence whose full
   semantic configuration matches the captured baseline. Only then finalize
   the fence to `REHEARSAL_RESTORED` and reopen the rehearsal control record.
9. Prove live Production returned to `DORMANT / GOOGLE / PASSPORT`, admission
   `OPEN`, zero active writers, ingress disabled, workers disabled, first
   Supabase write possible `false`, and first Supabase write observed `false`.

The 190+10 settlement and the 1,810-second critical-window hold are independent
requirements. Neither substitutes for an exact Drive provider result.

Every WAF provider mutation uses a durable reserve → mark-started → result
contract. A committed-but-lost provider response is `OUTCOME_UNKNOWN`. That
dispatch remains terminal and inspect-only; it cannot be retried after a TTL,
reused by another fence, or cleared by baseline restoration guesses.

## Ambiguous Drive result

Drive v3 permission updates do not provide a supported compare-and-swap token
for this transition. A lost or ambiguous ACL dispatch result is therefore
`OUTCOME_UNKNOWN`, not success and not a safe retry condition.

For either direction, `OUTCOME_UNKNOWN` means:

- keep `CRITICAL_WINDOW` active;
- keep the durable dispatch reservation;
- do not issue attempt 2;
- do not reopen legacy admission;
- do not begin another close or Step 12;
- inspect only through the certified provider recovery path;
- stop for owner/provider recovery authorization if the exact result cannot be
  proven.

Waiting 1,810 seconds does not clear `OUTCOME_UNKNOWN`. A delayed restore request could
otherwise re-enable an old writer after a later close. The rehearsal may pass
only when both ACL transitions are `TARGET_CONFIRMED`.

## Evidence split

The historical artifact remains immutable historical evidence:

```text
docs/evidence/step11-6-historical-production-google-writer-scope-v1.json
acceptedAsPrimaryProof = false
unexplainedConcurrencyWindowCount = 1
```

Do not edit or reinterpret it as accepted primary proof. Step 11.6 readiness
instead loads a separate ACL-v2 acceptance record from the fixed repository
path:

```text
docs/evidence/step11-6-production-google-drive-acl-v2-acceptance-v1.json
```

The manifest must exactly equal that artifact. Its self-hash is only an
integrity check and is not provenance. The file must be generated from the
protected provider and database receipts after the real rehearsal has restored
Production; it must not be handwritten from expected values. Readiness remains
false while the artifact is absent. The record requires:

- schema `step11-6-production-google-drive-acl-v2-acceptance-v1`;
- `acceptedAsPrimaryProof=true`;
- `unexplainedConcurrencyWindowCount=0`;
- the exact historical artifact fingerprint as a provenance input;
- exact migration/SHA/deployment/resource bindings;
- exact fence, install, quiesce, restoration, dispatch, settlement-readback,
  and transition-proof identities from the durable receipts;
- exact `BASELINE` and `CRITICAL_WINDOW` WAF fingerprints;
- exact forward and reverse Drive dispatch IDs/results;
- exact database timestamps for reader confirmation, restore critical-window
  activation, writer restoration, and rehearsal restoration;
- the exact legacy-principal fingerprint, equal to the final `DORMANT`
  ADMISSION_V3 `provider_principal_fingerprint`;
- both settlement readbacks and the 1,810-second hold proof;
- all origin/stale-client/low-level writer tests;
- zero Google data writes and zero Supabase canonical writes;
- exact restored Production snapshot.

The implementation candidate that performs the rehearsal is SHA A. After the
provider/DB-derived artifact is committed, SHA B becomes the certification
frozen SHA. The artifact records SHA A, not its own eventual commit. The
external execution bundle binds SHA B and proves the A-to-B diff contains only
approved evidence/binding paths and zero unexpected paths. This avoids a
self-referential commit while preserving immutable provenance.

The operator bundle refuses readiness if this independent ACL-v2 record is
missing, differs from the fixed artifact, is caller-invented, reports
`OUTCOME_UNKNOWN`, or reports any unexplained window.

## Failure and recovery

- Failure before a Drive dispatch commits: preserve `BASELINE`; no ACL recovery
  is needed.
- Forward dispatch `TARGET_CONFIRMED` but later certification failure: retain
  `CRITICAL_WINDOW` and `reader`, complete the 1,810-second hold, then perform
  the exact confirmed restoration sequence.
- Either ACL dispatch `OUTCOME_UNKNOWN`: fail closed and request provider recovery; do
  not retry or restore WAF baseline.
- Restore `TARGET_CONFIRMED` but database response lost: inspect the durable
  request identity, then resume finalization idempotently; do not dispatch a
  second Drive update.
- Any Preview substitution, principal mismatch, sharing-policy mismatch, WAF
  drift, active writer, ambiguous Google call, or Production authority drift is
  a STOP condition.

## End-state invariant

Step 11.6 is complete only when Production is observably back at:

```text
phase                         DORMANT
scoring authority             GOOGLE
participant identity          PASSPORT
legacy Google admission       OPEN
legacy Drive permission       writer / canEdit=true / canShare=true
Vercel WAF                    BASELINE (exact restored fingerprint)
critical WAF epoch            BASELINE_RESTORED (terminal/nonreusable)
provider fence                REHEARSAL_RESTORED
active legacy writers         0
Supabase scoring ingress      disabled
workers                       disabled
first Supabase write possible false
first Supabase write observed false
```

Step 12 still requires a separate explicit owner authorization.
