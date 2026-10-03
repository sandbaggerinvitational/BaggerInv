# Successor Odds input freshness: bounded decision required

## Completed successor chronology — 2026-10-03

**PROVEN — owned local PostgreSQL / integration:** the owner-approved two-part freshness contract now passes the complete first and later chronology in [annual run22](implementation-evidence/annual-transition-2026-10-03T02-08-24-102Z.json), migrations131–152. Both actual432-hole/24-Final tournaments reached explicit Odds publication, automatic FinalRecap, canonical CLOSE/drain and activation (2026→2097→2098). Four missing/malformed structural-evidence cases and11 structural invalidators fail closed; ten invalidators change the fingerprint and fail the canonical read, while participant-side collision fails the existing constraint earlier. The unchanged Production fingerprint is not inferred to have positive historical publication proof. Focused final-profile races and protected rejection checks are indexed separately in [EVIDENCE.md](EVIDENCE.md).

The final focused131–152 refresh additionally passes freshness9/9,
expanded27/27, same-result publication11/11 and protected calculation/denial2/2
(49/49 total), sourceStable. See
[final Odds receipt](implementation-evidence/odds152-proof-receipt.json).

All proposal/pending language below describes preserved earlier checkpoints. It is not a current approval request or an override of the completed run.

Status: **OWNER APPROVED — forward148 implementation and local runtime proof in progress.** No completed certification is claimed.

## Owner approval addendum

The owner explicitly approved both parts exactly as documented: the versioned structural configuration fingerprint, excluding only mutable gameplay lifecycle status, **and** independent current canonical live-source validation through request/job execution/completion/explicit publication with concurrency protection. Normal runtime approval still applies. The approval does not authorize backfill, Production fingerprint changes, broader current settings authoring, algorithm/publication/scoring/financial/role changes, Google restoration or hosted action. The proposal and counterevidence below remain the historical decision record.

Forward148 creates three owner-only helpers and replaces four existing function bodies without changing their OIDs, ACLs, owners, security modes, search paths, volatility or stored dependencies. Installation reverses the four bounded body changes and compares them to their predecessors, and checks that the legacy Production fingerprint body and attributes remain identical. Future Certification native commits capture additive structural diagnostics only on the newly created configuration.

Calculation jobs retain their existing immutable engine `input_snapshot.metadata.sourceRevision`. An additional **internal** `certificationLiveSourceFingerprint` records the existing canonical Leaderboards core data minus measurement-only `query_ms`; the old revision alone does not enumerate team/roster/round inputs. The already-admitted SQL input read supplies this digest, the server adds it to immutable invocation metadata, and SQL compares both pieces against its own fresh canonical read. No browser field, new data authority or engine formula is introduced.

Sorted target match `FOR SHARE` locks precede live reads and job locks and remain held until transaction end, conflicting with existing score/Finalize `FOR UPDATE` locks. Initial2026 also takes the existing access-governance then tournament-setup advisory locks, in their existing order; future structural writes are excluded by the shared admission fence. The Publication advisory acquired by143 has no opposite acquisition in063/097/130/132 setup paths.097's rare table locks use `NOWAIT`. Existing setup policy already blocks TEAM/ROSTER changes while Odds jobs are pending/ready or published; the race test must prove this actual denial and unchanged data, not fabricate an otherwise forbidden structural write. Already-published Certification jobs return the existing terminal claim/result-conflict outcomes before fresh configuration checks, preserving published history. Production branches are unchanged. Full successor/structural proof is still pending. No score-path trigger or algorithm changes are introduced.

**PROVEN — LOCAL POSTGRESQL/API/CONCURRENCY, focused scope:** [freshness evidence](implementation-evidence/odds-two-part-freshness.json) is9/9 (eight behavioral cases plus enclosing test), source-stable at148 hash `d2c7e20327392826882e3451daab8594fd1187ea2672cece7889cbeb4768d245`. Real score advancement invalidates request, claim, checkpoint, completion and new publication. Writer-first publication waits then rejects; publication-first score waits until commit. A concurrent actual `UPDATE_TEAM` waits then receives the existing dependency denial, with its canonical team unchanged. Published claim/complete/checkpoint retries preserve job/snapshot history. All three private helpers reject direct runtime roles. A test-only wrong snapshot column in the preceding run is preserved in `r2-odds148-freshness-second.log`; the corrected test passes without another runtime change.

**PROVEN — LOCAL expanded/compatibility scope:** [full148 receipt](implementation-evidence/odds148-proof-receipt.json) records26/26 expanded Certification tests and2/2 protected wrapper tests. These include a real10000-iteration protected Production-shaped calculation, replay/duplicate delivery, unchanged first-publication rejection and exact domain result equality with Certification. Metadata changes immutable job identity, but the unchanged engine derives its random seed from year/phase/version and does not consume metadata in its math. Published history also remains unchanged after the explicitly labeled synthetic input-revision invalidation fixture. Successor chronology and its structural fault cases remain separate pending proof; these local tests do not infer historical positive Production publication.

The owned-local chronology completed864 canonical holes and48 real Finals across2026 and2097. Actual shipping2026 History survived the first annual activation. The2097 Final Results calculation then failed before creating a job. No result, publication, FinalRecap or closed successor state was fabricated to continue.

## Demonstrated failure

**PROVEN — OWNED LOCAL POSTGRESQL / RPC / SHIPPING DIRECTOR ADAPTER.** Evidence: [annual run16](implementation-evidence/annual-transition-2026-10-03T00-08-59-014Z.json), `failedOdds`.

| Item | Exact result |
|---|---|
| Current synthetic target |2097, after genuine432/432 holes and24/24 Finals |
| UI/API operation | Canonical Director `calculate`, `Final Results`,10000 iterations |
| Failed RPC | `public.dispatch_certification_odds_v1` |
| Failed operation | `ODDS.read_production_odds_calculation_inputs` |
| SQLSTATE / domain error |55000 / `PRODUCTION_ANNUAL_PREDICTION_SETTINGS_NOT_CURRENT` |
| Rejecting function |143 `current_canonical_odds_inputs_v2`, line15 |
| Nested path | `canonical_odds_dispatch_v2` → `dispatch_certification_odds_v1` |
| Client containment |409 `CERTIFICATION_DOMAIN_REJECTED`; no job/publication claimed successful |

The initial Director jobs/publication GET passes because it does not validate the calculation-input configuration. It must not be cited as evidence that these inputs were usable. The captured failure is the subsequent input read, not the job insertion. The test now retains the actual SQLSTATE/domain/function context without copying credentials, request headers or complete SQL input statements.

## Root cause and existing refresh inventory

**PROVEN — SOURCE.** The future configuration created through139 records `pairing_fingerprint = annual_odds_pairing_fingerprint_v1(target)`.073's manifest contains genuine structural authority: setup revision, promotion revision/fingerprint, match identity/round/format, prepared scoring snapshot ID/hash, prepared setup revision/configuration fingerprint, and participant identity/team/slot/handicap revision. It also includes the mutable `match.status`.

143 requires that stored setup-time fingerprint to equal the current live manifest on every successor calculation-input read. Ordinary Open/Finalize progression changes `match.status`, despite unchanged approved settings, pairings, handicaps and scoring context. That makes the setup configuration stale by the existing check. The073 comment says the intended revalidation trigger is a **structural setup/pairing change**; the implemented hash is broader.

**PROVEN — SOURCE:** no supported refresh operation closes this gap after activation.

| Existing mechanism | Why it cannot legitimately repair ordinary current-year progress |
|---|---|
|073 `materialize_future_annual_odds_inputs_v1` | Explicitly rejects `target = current` and ACTIVE lifecycle. It materializes future configuration from an annual projection binding. |
| Production future synchronization wrapper |080 explicitly retires Prediction-settings Google synchronization. Restoring it is prohibited. |
|139 Certification `ANNUAL.PREDICTION_STAGE/VALIDATE/COMMIT` | Public gateway admits future DRAFT/CONFIGURING/READY_FOR_ACTIVATION targets only; target<=current is denied. Do not widen that admission merely to refresh Odds. |
| Native current-target settings commit core | An unchanged-settings commit is rejected (`changedSettingCount =0`). Its current-target branch retains the prior pairing fingerprint and writes `annualSetupRevision:null`, so it is not a supported current-year structural refresh either. This is a distinct limitation, not a reason to exercise an unadmitted private core. |
| Initial fixture | Correctly supplies initial normalized input before scoring. Editing it after Finals would conceal the defect and falsify source freshness. |
| Score/milestone/worker hooks | No inspected automatic hook refreshes this configuration fingerprint. Creating a new automatic settings mutation would be a separate design choice. |

No owner no-op save, hidden settings change, fixture update after scoring, direct private-core call, Production-shaped context or Google operation is a valid workaround.

## Minimum proposed correction

**APPROVED PROPOSAL — IMPLEMENTATION REMAINS SUBJECT TO NORMAL RUNTIME REVIEW AND PROOF.** Separate *configuration compatibility* from *calculation-result freshness* for the existing Certification successor Odds path only. The canonical authority remains the existing database settings, setup, pairing, handicap, scoring-context and score/result rows. A fingerprint is evidence of those rows; it is not a new authority source.

1. Add a private, versioned structural fingerprint helper, conceptually `production_control.certification_odds_pairing_structure_fingerprint_v1(text)`. Preserve every structural field in073's manifest; exclude only mutable gameplay lifecycle status. Do not change the existing Production fingerprint function or its semantics.
2. Capture that fingerprint when the already-admitted future native Prediction-settings commit creates its configuration. Store the version/fingerprint/setup revision in additive Certification-only validation diagnostics on that existing configuration revision. Retain the original pairing fingerprint, bundle fingerprint, configuration history and original readiness checks. Do not relabel an older installed configuration as certified by backfilling from a later live state. Missing versioned evidence must fail closed; the synthetic fresh-install chronology can create it through the real existing future authoring operation.
3. For an admitted Certification successor calculation, compare that recorded structural fingerprint and setup revision to current canonical structure, in addition to all current resource/actor/generation/configuration/hash predicates. A changed participant, side, slot, handicap revision, scoring snapshot, course/configuration, promotion or setup revision must still invalidate calculation eligibility. Ordinary score/lifecycle progression may then supply new inputs without requiring a settings mutation.
4. Keep mutable scoring/lifecycle state in the actual calculator inputs and their immutable job identity. Independently verify the job's captured canonical live source revision at request, claim/completion and explicit publication. The existing canonical input bundle already exposes match revisions/status/Final state and hole revisions; the existing engine invocation captures it in `input_snapshot.metadata.sourceRevision` and hashes the complete inputs. The Certification path must compare that captured revision against a fresh canonical read, not merely trust a client hash or unchanged settings configuration. A changed source must supersede/reject the old job using established stale/source-advanced outcomes. Publication must recheck atomically under the appropriate existing canonical locking discipline so a concurrent mutation cannot slip between freshness validation and commit. This is a required acceptance property, not permission to remove the present guard without a replacement.

The fourth requirement matters: simply dropping `status` from eligibility can otherwise permit an earlier calculation to outlive the source state it observed.143 currently checks configuration identity/revision and result integrity at completion/publication; it does not independently compare the full current live source revision there. The proposed change therefore needs both layers and explicit tests. The original application helper `readPublishableOddsCalculation` already demonstrates the live-input comparison principle, but that JavaScript check alone is not sufficient transaction-level enforcement for the Certification gateway.

The owner decision explicitly approves this versioned **Certification-only two-part freshness contract**. It is a material change to invalidation semantics, beyond merely fixing a resource pointer or missing adapter. Its approval is the new decision above, not an inference from the earlier routing approvals.

## Exact scope and exclusions

- Existing operation names stay `ODDS.read_production_odds_calculation_inputs`, `ODDS.request_production_odds_calculation_job`, worker claim/checkpoint/complete/fail, and `ODDS.publish_production_championship_odds_v1`. No new browser capability or settings-edit operation is proposed.
- Expected touched code: one forward Certification migration for the helper and bounded existing core branches; the already-admitted139 future settings commit's Certification diagnostics;143 Certification input/job/publication validation; the provider-neutral Odds server's internal source-revision envelope if needed; focused tests and evidence. Keep old migrations/historical artifacts intact under the repository's chosen migration convention.
- No new role, account entitlement, current settings authoring admission, annual target, provider, event family, publication trigger or financial authority. No calculator formula, golf rule, Odds rule, ownership or publication-approval change.
- No score transaction trigger or synchronous score-path work. Input validation belongs to owner-requested calculation, worker completion and explicit publication.
- No automatic calculation or publication. Workers never gain publish capability.
- No change to Production predicates, operation identities, existing fingerprints, first-publication adoption requirements, historical data, wrapper ACLs/OIDs or application behavior. Preserve old Production branches and prove equivalence.
- Do not solve the unrelated current-native-settings `annualSetupRevision:null` limitation by broadening this correction. Record it; only the future-created configuration used by the approved chronology is needed here.

## Compatibility and migration conditions

**Public client contract:** unchanged score, PWA and Build10 DTOs. Director actions and stable operation identity remain unchanged. Additive source-provenance fields, if needed, remain internal to the service/RPC/job contract; they must not leak through public or mobile projections.

**Stored state:** preserve old configuration/job/receipt history. Existing configurations without the new structural evidence cannot silently acquire it from their changed current state. The proposed local Certification fresh-install path creates the new evidence through supported future setup. Any upgrade of an already-active hosted Certification resource would need its own explicit revalidation plan; none is authorized or performed now.

**Replay:** same-operation retry and exact-origin status continue to recover an existing committed outcome. Freshness changes cannot reinterpret a historical receipt as permission for a new mutation. Changed input under the same operation identity remains a conflict. Old jobs cannot be published merely because their settings still match.

**Privileges:** new helpers remain owner-only with fixed safe search path. Existing separately admitted wrappers are the only runtime entry points. Inspect actual ACLs, owner/security mode, stored dependencies and nested callers, not schema privacy alone.

## Required acceptance tests after approval

1. Real future setup→activation→Open/score/Finalize leaves settings unchanged yet permits a new actual calculation from the new canonical state, with no synthetic refresh.
2. Actual864/48 chronology proceeds through2097 owner publication, automatic FinalRecap, close, advance to2098 and retained predecessor History; no fabricated publication or recap.
3. Pairing, team/slot, handicap, course/scoring-snapshot, promotion and setup-revision changes remain invalidating. Missing/wrong-version structural evidence fails closed.
4. Request a job, then advance real source state: old claim/completion/publication rejects or supersedes; a fresh operation calculates from the new source. Cover same-phase source changes, reopen/Finalize, and a concurrent source-change/publication race.
5. Same-operation retry/lost response remains exact; conflicting operation payload remains conflict; old receipts remain recoverable after annual advance.
6. Wrong resource/current target/context/generation, unauthorized Director, impersonation, participant, spectator and signed-out access remain denied. No direct private-core grants.
7. Settings values, engine inputs for identical source, deterministic results, required audit/provenance and explicit first-publication CAS remain correct; Production calculation/rejection behavior stays equivalent.
8. No Google, no messaging, no hosted access; affected local security/API/full-chronology/bootstrap/regression/build evidence is refreshed at the new source state.

Until the approved implementation passes its required proof, successor Final Results calculation/publication, FinalRecap, close/advance and the full second annual chronology remain **NOT PROVEN**. This does not erase the completed864/48 score evidence, first transition, post-transition History proof or source-stable worker evidence. Production, staging and real Google remain untouched.
