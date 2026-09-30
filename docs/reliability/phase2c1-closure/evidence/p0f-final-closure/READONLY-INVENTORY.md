# Narrow P0-F before-state: read-only reproduction and proof design

Base/observed HEAD: `7b6ca99510dc2f44cc411bfe7769e7f0c05ed962`.
Worktree: `/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv`.
Branch: `codex/reliability-phase2c1-capability-closure`.
Environment: LOCAL NON-PRODUCTION, Node v26.7.0. Worktree remained clean. No runtime source, tests, or historical evidence changed. No remote network, Production, hosted staging, real Google, native, or competitive data action.

## Reproduced tests

| Invocation | Result | Proof limit |
|---|---:|---|
| Existing original routing two-file selection | 11 PASS / 3 FAIL / 14 total / 0 skip | UNIT / API adapter substitutions; not hosted proof |
| Existing routing-safety file | 0 PASS / 3 FAIL / 3 total / 0 skip | Required expected-red admission assertions |
| Existing three capability model/source files + Director DI handler file | 57 PASS / 0 FAIL / 0 skip | Does not close seven missing isolated capabilities |
| Temporary shipping-handler / actual-selector characterization | Seven required gaps reproduced; five unsupported control operations reproduced | Synthetic authorization stub; no security PASS or SQL proof |

Each test invocation scrubbed provider environment variables and used the existing `phase2-network-deny.cjs` socket guard. The historical evidence runner was inspected but not invoked because it overwrites the closure evidence namespace. The same Node test arguments were used, omitting only its historical-output redirection wrapper. Temporary files hold raw TAP, command/source hashes and receipts. No test expectation changed.

## Three original routing identities

| ID | Existing test and caller | Current observation | Expected context / canonical authority |
|---|---|---|---|
| ROUTE-01 / BROAD-NEW-109 | `step10b-production-shadow-read-routing.test.mjs`: `all migrated candidate selectors resolve only certified Production shadow reads`; domain selectors for tournament/foundation/home/scoring/matches/side games/history/Guide/derived views | First tournament selector returns `unavailable` instead of `supabase`. The separately tested diagnostic transport still admits its existing exact legacy fixture. | A request-bound, exact host/SHA/project/auth/captcha/rate-limit read-only diagnostic context, propagated through `productionShadowCandidateDataEnvironment`, domain selectors and `scoringShadowRpc` read allowlist. Canonical PostgreSQL authority, not workbook authority. |
| ROUTE-02 / BROAD-NEW-112 | Same file: `candidate can never acquire Odds publication authority`; Odds input selector + publication admission | Positive `inputSource=supabase` assertion fails first. Does not itself demonstrate publication grant. | Diagnostic candidate may select approved canonical read inputs only. Publication/scoring/control/job/import mutations remain denied, including caller-enabled publication. |
| ROUTE-03 / BROAD-NEW-150 | `step11-pwa-network-boundaries.test.mjs`: `representative candidate Supabase services fail closed with zero Google fallback`; current tournament, completed History, Guide, Draft, Published Odds, Home services | Completed History returns `COMPLETED_HISTORY_SUPABASE_CONFIGURATION_REQUIRED` rather than intended `DATA_AUTHORITY_SUPABASE_OUTAGE_INJECTED`; fixture confirms zero unexpected network calls before assertion. | Approved request-scoped adapter reaches canonical transport outage interception. Typed feature outage with diagnostics identifying canonical source; no Google fallback. |

`canonicalReadEnvironment` recognizes protected Production cutover or ordinary isolated database selection, but does not recognize the existing exact diagnostic read lane. `productionShadowCandidateEnvironment` still requires a configured workbook and Google scoring label. Its server overlay still supplies those legacy scoring/publication labels. This is an admission/context mismatch; it is not solved by enabling writes.

Supplemental `NA-CANONICAL-ROUTING-01` fails because missing Google configuration means diagnostic eligibility=false. `NA-CANONICAL-ROUTING-02` fails at canonical input availability before write-denial assertions. The third supplemental test fails specifically for an invalid diagnostic transport URL that is otherwise a valid ordinary Preview URL.

An independent selector-only observation confirms this latter fallthrough: requested diagnostic lane remains ineligible, but ordinary canonical selection resolves `supabase`; Odds publication selector also becomes eligible with the fixture's caller-selected `supabase` publication value. **This is selector-level context confusion, not proof of successful unauthorized publication.** No API mutation or database call was attempted. See `routing-independent-selector.json`.

The original BROAD-NEW-109 test also contains a later, currently unreachable assertion expecting `odds.publicationAuthority === 'google'`. That is obsolete provider behavior and must be separately accounted for if approved routing changes expose it. The test is left unchanged here; restoring Google would violate the owner decision.

## Pending approval boundary

Explicit owner approval remains pending following two automatic approval-review rejections. The narrow task is not approval. These five files are unchanged:

- `lib/canonical-runtime-source.js`
- `lib/production-shadow-candidate.js`
- `lib/production-shadow-candidate-server.js`
- `lib/odds-calculation-source.js`
- `app/api/preview-environment/route.js`

Source inspection, unchanged test reproduction and a local selector observation are safe independent evidence. Applying equivalent logic in another module, rewriting admission fixtures, or weakening the red assertions would evade this boundary and is not done.

## Seven required capability identities

The temporary route loader executes actual shipping function bodies with explicit import substitutions. Production-only routes return before authorization or canonical dependencies; these requests characterize admission, not complete valid client payloads. The canonical overview uses an actual mutation helper with a synthetic authorized Director entitlement. Authentication-provider verification is deliberately not exercised. Global fetch is an exception-throwing spy and the socket guard remains active.

| ID | Caller / route / canonical authority | Actual isolated observation | Existing coverage / missing proof |
|---|---|---|---|
| BROAD-NEW-007 | `ProductionTournamentSetupPanel` → `/api/director/tournament-setup` → `mutateProductionTournamentSetup` → course/setup/handicap ledgers and prepared-context readback | `upsert-course` POST404 before auth/database; isolated overview advertises setupAuthoring=false | Normalizer + retained setup PostgreSQL tests. Missing isolated client/API binding to the same ledger, exact course/tee/hole/handicap prepared authority. |
| BROAD-NEW-008 | Setup panel / canonical console → setup route + `/api/director/canonical-overview` → operation receipt/readback | Setup GET404 before auth/database. Canonical overview supports only Finalize/Reopen, not full setup operations | Finalize/Reopen chain passes scoped tests. Missing generic required setup operation lifecycle, CAS/identity/receipt/readback and unknown-result recovery. |
| BROAD-NEW-009 | Setup panel → setup route → `mutate_production_round_pairings_v1` / REPLACE_ROUND_PAIRINGS | `replace-round-pairings` POST404 before auth/database | Existing model preserves format slots/revisions; scoped SQL proves roster/context/atomicity. Missing isolated batch adapter bound to approved handicap/setup authority. |
| BROAD-NEW-010 | `ProductionNetSkinsEntries` → `/api/director/net-skins-entries` → `save_production_net_skins_entries_v1` | POST404 before auth/database | Existing model + actual SQL entry authority. Missing isolated immutable entry ledger/ancestry contract. Preview configuration import is not equivalent: rewrites financial/configuration rows and creates jobs. |
| BROAD-NEW-011 | `CalcuttaManagementEditor` → `/api/admin/production-calcutta-v1` → auction-fact and clear operations | `management-entry` POST404 before auth/database | Price/ownership model + server/clear SQL. Missing isolated auction revision/clear/receipt contract preserving financial privacy and rule/config separation. Preview configuration importer cannot clear final entry and changes different authority. |
| BROAD-NEW-012 | `ProductionDirectorOperations` / canonical console → `/api/director`, `/api/live-matches`, canonical overview → canonical control/readiness and receipts | Canonical overview scoring-lock POST400 `DIRECTOR_CANONICAL_INPUT_INVALID`; actual Preview control selector409 unsupported | Model plus scoped Finalize/Reopen. Missing Mark Live/Lock/Resume/access client/API/SQL proof through the shared context; no reduced readiness predicate. |
| BROAD-NEW-174 | Production control component → Director/live-matches → MARK_LIVE and distinct scoring lock/access authority | Canonical overview mark-live POST400; actual selector denies MARK_LIVE, SCORING_LOCK, SCORING_UNLOCK, ACCESS_ACTIVATE, ACCESS_REVOKE with409 `OPERATION_NOT_SUPPORTED_UNDER_SUPABASE_AUTHORITY` | Model preserves separated authority; no isolated implementation. Need existing frozen context/current handicap/readiness, locks/CAS/receipt/access transition semantics. |

Seven rows are required capability gaps, not stale assertions. They must not be marked PASS because the 57 existing tests pass. All seven remain PARTIAL. Odds publication, scoped authorization and Finalize/Reopen receipt recovery are separate already-scoped capability identities and are not reopened here.

## Minimum independent proof and future acceptance design

Already safe/proven here: reproduce exact missing API/selector capability; preserve established Production-only denial; characterize retired-provider absence; inventory current source/domain contracts and prior SQL proof; check unchanged original red routing tests. No source change is needed to establish those facts.

After a reviewed explicit isolated writer context exists, each capability requires actual shipping client → route → unchanged canonical domain command/ledger → disposable PostgreSQL → canonical readback. The context must bind actor, tournament, verified isolated resource, operation identity and release/activation as applicable. It must not spoof Production identity, use the diagnostic read lane for writes, install a second calculator, or reuse broad importers as individual domain mutations.

Required new acceptance coverage by family:

- Course/setup/pairings: complete holes, exact prepared setup/handicap revision, unchanged-match preservation, stale revision, concurrent roster/pairing edits, freeze/lease denial, whole-batch rollback, same-request replay and lost-readback recovery.
- Net Skins entries: BB/SC/SI and exact round scope; immutable entry history and pairing ancestry; stale consent never revived; no scoring/pairing/financial configuration/job/publication changes; role/scope/lease/result/active-job denial; CAS/replay/concurrency.
- Calcutta auction: purchase value and complete ownership committed together; final-entry clear supported; immutable predecessors; rules/configuration unchanged; exact publication/result predecessors; save/clear/publish races; private response fields; replay and audit rollback.
- Lifecycle: current prepared readiness, server-owned handicap/strokes, distinct Mark Live/scoring-lock/access semantics; same command receipt after lost response; score-versus-Lock/Finalize races; role/scope/release denial; no Google or derived completion gate.
- Routing (only after explicit owner approval): positive exact read context without Google; every host/SHA/project/Auth/captcha/rate-limit/transport mismatch denies; invalid requested lane never falls into Preview; read allowlist works; scoring/control/finalization/reopen/job/import/publication deny pretransport; canonical feature outage with zero Google; no ordinary Preview/Production authority relaxation.

Production and physical proof remain NOT PROVEN. Existing scoped SQL tests can be rerun later in disposable databases without remote access, but they do not alone close absent client/API adapters. No PostgreSQL suite was rerun for this read-only characterization.
