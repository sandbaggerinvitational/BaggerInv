# Odds equivalence proof boundaries

**Current disposition:**R2 passes at its accepted local scope. The owner accepts irreproducible048/057 exact historical positive adoption/publication as NOT PROVEN; the scoped failures/limitations below remain unchanged. No reconstruction, fabricated authority or live account access occurred. See [current certification](CERTIFICATION.md).

Environment: owned socket-only PostgreSQL 17 and synthetic authority. No hosted,
Production, Google, or participant service is contacted.

## Final local131–152 refresh — 2026-10-03

**PASS at the stated local layers:** expanded Certification27/27, two-part
freshness9/9, exact same-result publication11/11, protected calculation and
no-adoption denial2/2: **49/49, zero failures/skips**. The combined consumed-source
manifest is unchanged before/after. Evidence:
[final152 receipt](implementation-evidence/odds152-proof-receipt.json) and
[source manifest](implementation-evidence/odds152-run-source-receipt.json).
The run executes the real Director API, calculator,112 expanded RPCs, two
independent databases and concurrency/atomicity/recovery negatives. Original
149/150 counterevidence and successful receipts remain preserved.

Positive historical Production publication/adoption remains **NOT PROVEN**.
The protected test proves actual canonical calculation/replay and unchanged
missing-adoption rejection; it does not manufacture historical evidence. These
local results do not certify hosted operation or Production.

## Canonical engine

The proof uses the shipping durable calculator, then independently executes the
existing synchronous `simulateTournamentOdds` reference over the stored input.
It requires exact logical result equality and matching stored result fingerprint.
The test also compares these modules byte-for-byte with base
`7cec5128409286f5b4a5f3524d4c5488124a7be7`:

- `lib/tournament-odds.js`
- `lib/prediction-engine.js`
- `lib/tournament-context.js`
- `lib/championship-odds-resilience.js`
- `lib/championship-odds-supabase.js`
- `lib/published-odds-supabase.js`
- `lib/mobile-v1-odds.js`

This proves equality for the exercised synthetic input and algorithm source. It
does not substitute for every possible domain input or hosted performance proof.
The two existing public read mappers are also unchanged. Their actual projection
of the new canonical publication must omit private Certification provenance.
The existing participant freshness fields `authorityEpochId` and
`resourceBindingFingerprint` remain as the unchanged prior contract; the raw
service-only publication RPC is not presented as a public DTO.

## Production publication prerequisite

**PROVEN — SOURCE:** the unchanged frozen-2026 Production publication contract in
`supabase/production_migrations/202608290057_production_odds_publication_authority_v1.sql`
requires a publication revision of at least one and an existing adopted current
publication. Its public publisher starts at line 789; input validation rejects
first-publication revision zero. Its current-pointer lookup at line 879 is strict.
The later canonical publisher for future tournaments is
a distinct contract and must not be used to bypass the frozen-2026 policy.

The same migration's private adoption operation starts at line 485. It binds one
specific retained historical snapshot, exact payload/import/Google fingerprints,
and original publication timestamp (lines 520–536), then requires those retained
rows and the original adoption state (lines 571–623). This is not a generic
synthetic first-publication capability.

The repository's `step13c-odds-publication-migration.test.mjs` checks that source
contract. The examined behavioral fixtures do not create a legitimate historical
adoption by replaying the real contract over synthetic data. A fake imported
snapshot, fake historical publication, altered guard, or fabricated FinalRecap
would invalidate the proof and is prohibited.

**NOT PROVEN:** positive frozen-2026 Production historical publication and the
dependent complete Production annual chronology in a wholly synthetic fixture.
The executed test instead proves real local Production-shaped request, replay,
worker completion, canonical reference equality, and unchanged rejection of a
first publication without adopted authority. It does not label that rejection as
positive publication proof.

## Certification boundary

Certification is independently admitted and uses truthful first publication:
`NEVER_PUBLISHED`, revision `0`, snapshot `null`. Migration 143 calls the same
private canonical domain cores while keeping historical Production admission,
function OIDs, owners, ACLs, security mode and search paths unchanged. Existing
core attributes are captured and asserted during migration installation; private
cores are unavailable to PUBLIC, anon, authenticated and service_role.

Source invalidation tests append a valid synthetic canonical input revision while
preserving prior configuration and result evidence. Only real requests create
jobs; only the actual engine creates results; only an explicit admitted Director
operation creates a publication. The synthetic source-invalidation fixture is not
claimed as current-year authoring UI certification.

## Tests and execution

- `test/reliability-phase2dr2-odds.integration.test.mjs`: Certification API,
  negative authorization, resource isolation, replay/conflict, worker recovery,
  atomic receipt/audit, publication, immutable provenance, domain equality,
  source invalidation, and bounded exact-query plans.
- `test/reliability-phase2dr2-production-odds.integration.test.mjs`: genuine local
  protected Production admission, actual request/worker/retry, domain equality,
  and unchanged missing-adoption rejection.

**PROVEN — LOCAL API / POSTGRESQL / INTEGRATION / CONCURRENCY:** the expanded
Certification test passes 27/27 (26 behavioral subtests plus enclosing test),
112 actual RPCs, two independently installed databases, eight-way replay and
lease races, zero Google calls/jobs, and zero automatic publication. This run
includes the recovery correction described below. The actual reference result
and durable result match exactly at 10,000 iterations; all seven compared source
modules remain byte-identical to the base. The complete receipt is
`implementation-evidence/odds-expanded-runtime.json`, including source manifest,
raw-log hash/path and exact proof limitations.

**PROVEN — LOCAL PRODUCTION-SHAPED POSTGRESQL / RPC:** the focused protected
Production test passes 2/2, exercising 20 actual RPCs, a 10,000-iteration job with
ten checkpoints, same-request retry and duplicate worker delivery. No admission,
readiness or drain guard is substituted. The migration057-installed
`UNPUBLISHED` revision0/null-snapshot pointer remains exactly unchanged when
first publication is denied. No historical adopted snapshot is invented.
`implementation-evidence/production-odds-equivalence.json` contains its exact
result equality and limitations; `odds150-proof-receipt.json` records the source
manifest and raw-log hash/path for the successful combined run. The canonical
result fingerprint also matches the independently admitted Certification
fixture's corresponding normalized initial input exactly.
The refreshed profile includes every migration131–150, including the separately
owner-approved144 correction. This Odds proof installs that release boundary;
its complete behavioral release recertification is a separate test.

**PROVEN — LOCAL POSTGRESQL/API/CONCURRENCY:** forward148 adds a separate9/9
focused freshness proof. Genuine source advancement rejects/supersedes stale
unpublished requests/work; both score/publication transaction orders are tested.
An actual concurrent team change waits for the publication lock boundary and
then fails the existing setup dependency rule. Published jobs and snapshots stay
immutable under later worker retries and source/configuration advancement.
Original Production fingerprint body/attributes and all four replaced core
identities/privileges/dependencies are checked during installation. See
`implementation-evidence/odds-two-part-freshness.json` and the approved
`ANNUAL-ODDS-FRESHNESS-APPROVAL-BLOCK.md` contract. Full successor annual
chronology remains independently required.

**PROVEN — LOCAL second-publication guard:**149 fixes the retained057
Production-only lookup for Certification snapshot flag updates. A genuine second
owner publication creates revision2; the predecessor changes only its two
existing current-selection flags. Receipt fault injection rolls back those flag
changes and the new publication together. Immutable payload/source/revision and
forged binding/class changes are denied; all retired Google metadata stays
immutable. Missing/worker/fake-GUC contexts and direct runtime-role writes are
denied. Installation proves exact function attributes, OID, trigger identity,
stored dependencies and reversal of the sole authority-lookup change. The
original Production lookup and every original immutable predicate remain intact.
The preceding test-only SQL-spacing failure is preserved, not counted as PASS.

**PROVEN — LOCAL same-result publication:** release run7's actual23505 is
preserved in `implementation-evidence/release-transition-2026-10-03T01-29-40.988Z.json`.
Forward150 closes that exact case without changing the retained nine-field index:
new Certification snapshots identify both the unchanged configuration source and
148's independently validated live source. Versioned immutable provenance retains
both components. A genuine score advance followed by the same10,000-iteration
calculation produces an identical numerical result, then a distinct explicit
publication revision with unchanged configuration and predecessor facts.

The focused test passes11/11, including lost client acknowledgement, exact replay,
changed-request conflict, same-source deduplication, concurrent CAS, stale-source
and authorization denials, atomic audit/receipt rollback, actual public freshness
and PWA/Build10 projections. Evidence:
`implementation-evidence/odds-publication-identity-2026-10-03T01-50-45-011Z.json`.
That test and the focused freshness test record unchanged before/after source
hashes. The additional full150 combined rerun passes38/38: expanded27, freshness9,
protected wrapper2. See `implementation-evidence/odds150-proof-receipt.json`.
The protected fixture still proves calculation/replay and the unchanged
missing-adoption rejection only; positive historical Production publication is
NOT PROVEN. Final-profile annual/release and global certification remain separate.

## Recovery non-impersonation counterevidence

**PROVEN — API / POSTGRESQL, before correction:** the API rejected boolean
impersonation, but the two service-only SQL committed replay/status branches
accepted a nonempty `authorization.impersonating_player_id` for the same original
Director's receipt. New mutations already rejected that spelling. No canonical
mutation occurred and no other actor's receipt was returned, but the recovery
behavior violated the required non-impersonation invariant.

The precise before evidence is
`implementation-evidence/odds-recovery-impersonation-cdda46ff5eec.json`, bound to
migration143 SHA256
`cdda46ff5eec5ae4b011828fccf1ddf153c404e08c3bbe959f7280aa9df03c80`.
The expanded local run had 24 passing behavioral subtests and this one failing
subtest (Node counts the failed enclosing test separately).

The correction adds only the already-existing nonempty impersonating-player
denial to `read_certification_odds_operation_v1` and the committed replay branch
of `dispatch_certification_odds_v1`. Migration143 now hashes to
`d01dad65c168666ef19e31d708cbcdf8bbaf3d8d7a63502d2085d55e32371295`.
Removing exactly these two additions reconstructs the prior hash. There is no
Production predicate change, new actor authority, receipt-scope change, or
domain/replay semantic change.

**PROVEN — API / POSTGRESQL, after correction:**
`implementation-evidence/odds-recovery-impersonation-d01dad65c168.json` records
both explicit SQL impersonation paths denied, ordinary committed replay/status
passing, and exactly one canonical snapshot retained. Required audit/receipt
rollback, actor/resource isolation, public projections, and actual worker
calculation remained green in the same run.

## Local operation timings and query plans

`implementation-evidence/odds-performance-query-plans.json` records single-call
wall times for actual request, real calculation, explicit publication and receipt
recovery, plus exact job/current-publication/receipt query plans and indexes.
These include owned `psql` transport/process overhead. Sample counts are one per
operation; p95/p99 are explicitly NOT PROVEN. The low-history plan fixture proves
exact current keys, not large-history performance or hosted capacity.

## FinalRecap cross-resource equivalence limits

**PROVEN — SOURCE:** `implementation-evidence/final-recap-domain-source-equivalence.json` records exact
equality to the base for `finalGate`, `calculateIntelligenceDerivedFromData`, and
the five underlying published-Odds/editorial/recap modules. Certification and
Production select distinct admitted read/write transports but invoke this same
calculation. The gate still requires 24 Final matches, 24 complete scorecards, a
published Final Results snapshot and an official winner.

**NOT PROVEN — CROSS-RESOURCE FULL OUTPUT:** a complete positive protected
frozen 2026 Production FinalRecap cannot be inferred from the Certification
chronology because the former lacks legitimate historical publication adoption
in this synthetic fixture. This limitation is not repaired with fabricated
publication, seeded FinalRecap or weakened gate. Actual Certification FinalRecap
failure/recovery/output evidence is recorded separately by the annual proof.
Resource-specific receipt IDs, provenance and dependency fingerprints are not
expected to be equal; competitive result semantics are the relevant shared
calculation boundary.

The expanded Odds test additionally captures semantic inbound/outbound
`pg_depend` edges for all 14 functions touched by migration143, including the installed job
trigger's function binding, and records owner/ACL/security/search_path. The
capture is included in the successful150 expanded run and preserved in
`implementation-evidence/odds-pg-depend-graph.json`. It does not treat PostgreSQL catalog edges as a complete
PL/pgSQL call graph; actual nested RPC execution remains separate evidence.
