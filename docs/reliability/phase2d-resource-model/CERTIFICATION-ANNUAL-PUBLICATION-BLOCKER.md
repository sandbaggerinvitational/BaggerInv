# Certification annual publication blocker

Status: **STOP — additional bounded authority design/approval required.** No Odds publication boundary, calculation boundary, annual close predicate or publication row was changed to bypass this blocker.

This is a source-confirmed missing Certification capability, discovered through a real local annual chronology test. It is not permission to weaken annual handoff or to treat owner-controlled publication as automatic work.

## Actual checkpoint

[Checkpoint08](implementation-evidence/annual-transition-checkpoint-08.md) and its [source-bound result](implementation-evidence/annual-transition-2026-09-30T20-13-27-891Z.json) preserve the run:

- Owned disposable PostgreSQL17 only; migration/helper start and end hashes match.
- R1 108/108, R2 108/108, R3 216/216: **432/432 real canonical hole submissions and24/24 actual Finals**. No scores or Finals were seeded.
- Actual durable ingress histories include committed work, discarded-response recovery, deterministic NOT_COMMITTED and one deliberately unresolved UNKNOWN operation.
- Real future2097 creation, setup, promotion, handicap preparation, scoring contexts and content preparation passed.
- Shipping automatic workers drained in21 cycles: pendingAutomatic0, blockedAutomatic0, activeLeases0, all ready flags false. FinalRecap remained `waitingPublication.FINAL_RECAP = 1`.
- Annual PREPARE succeeded. Annual CLOSE raised `PRODUCTION_ANNUAL_PREDECESSOR_DERIVED_WORK_PENDING`. No successful close certificate, DRAIN or ACTIVATE was claimed.
- Four child tests passed; the parent failed. The owned cluster was destroyed. No hosted/Production/Google access occurred.

The individual pending job row was not captured before this run's teardown. The particular row attribution is therefore a strong source/runtime inference, not a claimed table snapshot. The next authorized run has bounded job snapshots after drain, after PREPARE and at failure. The missing Certification publication admission below is independently established from source and the actual installed function inventory; another432-hole run is unnecessary merely to repeat this known blocker.

## Exact annual and FinalRecap contracts

| Authority | Existing predicate/effect | Evidence |
|---|---|---|
| `production_control.close_annual_scoring_predecessor_v1(jsonb,text)` | After the global scoring-admission fence and pending-intent check, counts all round0 TEAM_MOMENTUM/TOURNAMENT_STORYLINES and TOURNAMENT_INTELLIGENCE/PROJECTION_EDITORIAL/TOURNAMENT_FINAL_RECAP jobs with `status <> 'SUCCEEDED'`; any count blocks close. | [Migration077](../../../supabase/production_migrations/202608300077_production_annual_derived_worker_close_fence_v1.sql), function immediately before the predecessor-certificate extraction. |
| `production_control.annual_scoring_predecessor_certificate_v1(text)` | Counts the same unfinished engines; adds `PREDECESSOR_DERIVED_WORK_DRAIN_INCOMPLETE`. For future tournaments it also detects wrong runtime generation and adds `PREDECESSOR_DERIVED_WORK_GENERATION_MISMATCH`. Both counts and blockers enter the certificate fingerprint. | Same migration077; this companion gate would remain even if CLOSE alone were altered. |
| `production_control.derived_final_recap_ready_v1(text)` | Exactly24 matches, all `FINAL` and `scorecard_complete`, **plus** a current, verified `odds_published_snapshots` row for milestone Final Results whose published payload phase is Final Results. | [Migration124](../../../supabase/production_migrations/202609280124_score_derived_delivery_v1.sql), lines198–210. |
| `production_control.canonical_score_derived_delivery_tick_v1_core_v2(jsonb,jsonb)` | FinalRecap is automatic/claimable only when the preceding eligibility function is true; otherwise its unfinished current-generation job is reported separately as waitingPublication. Required eligible work, blocked work and active leases remain blocking. | [Migration133](../../../supabase/production_migrations/202609300133_certification_derived_gateways_v1.sql), lines647–709; preserved delivery policy from124. |

The [Phase2C.1 P0-B recertification](../phase2c1/P0-B-RECERTIFICATION.md), rows/notes at lines11 and37, explicitly permits `WAITING_PUBLISHED_FINAL_GATE` outside **automatic** publication. That scoped automatic-worker PASS does not supersede migration077's stricter annual chronology gate. Both facts must remain visible.

## Existing owner-directed publication path

The current application route is [POST `/api/odds/publish`](../../../app/api/odds/publish/route.js). Its Production branch validates the protected request/Origin and publication authority, resolves an active non-impersonating Director, requires a completed resilient calculation, checks requested milestone, reads current publication state and sends a bound publication fingerprint. Publication is an explicit caller action; the ensuing Intelligence recalculation is downstream.

[production-odds-publication-server.js](../../../lib/production-odds-publication-server.js) uses the existing [production-odds-calculation-server.js](../../../lib/production-odds-calculation-server.js) transport/runtime resolver. These are not generic Certification transports.

| Installed operation | Required current authority and retained state | Why it is not callable honestly in Certification |
|---|---|---|
| `public.read_production_odds_calculation_inputs(jsonb)` and `public.request_production_odds_calculation_job(jsonb)` | Existing exact resource/runtime admission, current input revision and operation-specific request identity; the retained job records mode, release, fingerprints and actor/source lineage. | Admission requires the Production scope/runtime/worker controls, not the registered Certification resource. |
| `public.claim_production_odds_calculation_job`, `checkpoint_production_odds_calculation_job`, `complete_production_odds_calculation_job`, `fail_production_odds_calculation_job`, `supersede_production_odds_calculation_job` | Existing retained-job scope, claim/lease, checkpoint, generation/release, result hash and completion rules. These are a durable calculation protocol, not a fixture result insertion. | No Certification calculation gateway or truthful Certification retained-job provenance was implemented. Existing wrappers must not be bypassed. |
| `public.publish_production_championship_odds_v1(jsonb)` | Exact cutover resource and Production scoring actor; fixed2026 target; actual Production scope/activation/OPEN Supabase epoch; enabled Supabase publication; matching release/deployment; zero unresolved queues; Google mirror disabled; expected publication revision/snapshot/epoch; completed SUCCEEDED job with READY publication state and valid immutable source/result fingerprints; Final Results requires complete Final matches. | It requires Production scope and cutover rows that deliberately do not exist in Certification. Job provenance explicitly requires `PRODUCTION_CUTOVER`; output/audit binding explicitly says PRODUCTION. An unchanged call with Certification facts fails closed, as intended. |
| Initial2026 `production_control.adopt_production_odds_publication_authority_v1(jsonb)` | Database-owner maintenance operation admitting a specific preserved historical pre-tournament snapshot and its exact original hashes/timestamp/Google provenance, followed by explicit authority adoption. | This is historical Production adoption, not a fresh synthetic initialization contract. Reproducing those facts in a Certification database would fabricate authority and historical evidence. |
| `public.dispatch_production_annual_scoring_v1` → `public.future_production_dispatch_odds_v1` → `production_control.publish_annual_odds_v1(jsonb,text)` | Exact active future runtime generation and existing future Director/actor checks; actual Production resource/cutover and annual resource; retained completed calculation/source fingerprints; publication CAS, milestone, idempotency and audit. The future projection/publish path supports its existing initial-unpublished lifecycle. | It remains a Production-admitted annual dispatch. Its release/resource/job/output provenance cannot truthfully be supplied by Certification through the existing wrapper. |

Source contracts are in [023](../../../supabase/production_migrations/202608240023_production_odds_calculation_orchestration.sql), [026](../../../supabase/production_migrations/202608240026_production_odds_rehearsal_job_isolation.sql), [057](../../../supabase/production_migrations/202608290057_production_odds_publication_authority_v1.sql) and [073](../../../supabase/production_migrations/202608300073_production_annual_odds_v1.sql), including their final catalog revisions. Migration057 publication requires the established initial2026 published predecessor/revision; a fresh Certification database cannot satisfy that by silently borrowing the historical adoption procedure.

## Missing Certification admission

- [CERTIFICATION_OPERATIONS](../../../lib/certification-runtime-server.js) contains score, approved Director, required derived-worker and future-authoring operations; no Odds calculation/publication operation is admitted.
- The132/133/140/141 SQL dispatch allowlists do not admit Odds calculation/publication. Adding a name to JavaScript alone would not supply database authority, durable job provenance or publication initialization.
- [Migration142](../../../supabase/production_migrations/202609300142_certification_required_worker_reads_v1.sql) adds only the existing **published-only read projection** needed by workers. It cannot create, verify or publish a snapshot and does not grant publication authority.
- `publish_preview_championship_odds(jsonb)` belongs to the separate legacy Preview migration chain. It is absent from the current canonical fresh-install catalog and is not a Certification fallback. Installing legacy Preview authority would conflict with the approved resource model.

This is therefore **more than a missing fixture call**. Exercising a valid existing owner publication step would be appropriate only after its separately admitted Certification resource/job/publication contract exists and is approved. The current owner identity and actual Final matches alone do not create that contract.

## Rejected alternatives

| Alternative | Reason rejected |
|---|---|
| Insert a verified Final Results snapshot, READY/SUCCEEDED calculation, completed FinalRecap or publication receipt directly | Fabricates the very runtime authority, publication lineage and completion evidence the test must prove. |
| Supply a Production envelope, install fake Production resource/cutover rows or label a Certification job `PRODUCTION_CUTOVER` | Misstates resource/actor/job provenance and bypasses the separate admission boundary. |
| Invoke an unadmitted private publication core or grant private EXECUTE access | Bypasses actor/resource/CAS/privacy checks and violates private-core privilege requirements. |
| Delete/ignore FinalRecap from CLOSE or certificate merely because workers wait for publication | Weakens a distinct annual handoff contract without authority; successful automatic drain is not proof that owner chronology is complete. |
| Automatically publish while draining workers or preparing annual transition | Converts an owner-directed publication decision into automation. |
| Restore Google or use the legacy Preview publication schema | Restores retired/foreign authority and violates the dedicated Certification resource model. |

## Minimum additional owner approval needed

Approve a **separately admitted Certification owner-directed Odds publication path**, plus only the calculation/job prerequisites needed to produce its genuine publishable result, reusing existing canonical domain logic. The review must explicitly cover:

1. Exact registered resource, current tournament/epoch/generation, existing Director identity/entitlement, non-impersonation and server-bound context; no new role or direct private-core access.
2. Truthful Certification calculation/job/publication/audit provenance and an explicit fresh synthetic publication initialization/first-publication contract. Do not reuse the historical2026 Production adoption artifact or fabricate a prior publication.
3. Existing source revision, lease/checkpoint, result fingerprint, publication CAS, milestone order, same-request recovery/conflict, immutable history and transactional audit rules. No scoring, side-game, Odds-output or publication-policy change.
4. The applicable durable mutation/recovery classification and annual drain effect for these exact operations; retain unknown outcome containment and owner-directed publication.
5. Positive and negative local integration proof through the actual calculator and publication path, then real FinalRecap processing and annual close/drain. Retain Production wrapper behavior and prove ACL/owner/search_path/dependency safety.

This document requests design/implementation authority; it does not grant it. No new Odds boundary was implemented. Annual advancement and dependent later-generation certification remain stopped until the owner resolves this exact requirement.
