# Remaining implementation gaps: read-only root-cause review

Status: **PARTIAL — no corrective implementation executed by this review.**

This is an additive review of the uncommitted Phase 2D-R2 draft based on `7cec5128409286f5b4a5f3524d4c5488124a7be7`. It does not replace the earlier checkpoint, certification, or counterevidence. The owner approval extension orders fixes to these gaps **after the annual-transition authority contract passes**. That gate is still pending, including the actual Certification lease/admission capture required by clause 6. No missing lease/control fact may be represented as an empty-table or zero-count proof.

This review changed only this document. It did not start a database, change runtime/source/migrations/tests, query a hosted resource, or access Production or Google. Proposed corrections below remain proposals, not authorization to skip the annual gate.

## Evidence and limits

| Evidence | Layer and strength | What it establishes | Limitation |
| --- | --- | --- | --- |
| Earlier owned local PostgreSQL 17 probe, `/private/tmp/r2-domain-runtime-probe.log` | POSTGRESQL: **PROVEN** at that draft | Fresh replay, Certification bootstrap/admission, constraints-and-triggers-on synthetic seed, exact context handshake and `DIRECTOR.READ_SETUP` succeeded; `prepare-scoring-context` failed with `TOURNAMENT_SETUP_SCORING_CONTEXT_REQUIRED_FACT_MISSING`. The owned cluster was destroyed. | The log is local scratch evidence, not a committed reusable regression. Its exception wrapper suppressed the inner trigger stack. This review did not rerun it. |
| Final pre-resource function definitions exported to `/private/tmp/r2-authoritative-catalog.json`, compared with the cited migration sources and draft migrations 131–135 | SOURCE: **PROVEN** for the specific definitions described below | The surviving literal Production-pointer/cutover lookups and the missing SQL operation are present. The source-only compiler did not substitute benchmark admission assertions. | Catalog/source evidence alone does not certify a corrected runtime or Production equivalence. |
| Current JavaScript and SQL operation maps | SOURCE: **PROVEN** | Director status is selected in JavaScript but missing from SQL; Reopen uses incompatible ID validators across the two layers. | End-to-end negative, retry, conflict and readback proof remains required. |

## R2-GAP-01 — scoring-context preparation reaches Production-only derived triggers

**Observed failure: PROVEN, POSTGRESQL. Root cause: STRONGLY SUPPORTED by the observed error and exact source path.** This is a real omitted resource seam; it has not been classified as a stale test or a missing synthetic course/handicap fact.

The path is:

1. `production_control.apply_tournament_setup_scoring_context_v1(jsonb,bigint,text)` creates a new snapshot, then updates `scoring_authority.matches.scoring_snapshot_id` and increments `match_revision`: `supabase/production_migrations/202609040084_production_starting_hole_retirement_v1.sql:472`.
2. Trigger `production_annual_derived_v1_match_change` is attached to updates including `match_revision`: `supabase/production_migrations/202608300077_production_annual_derived_worker_close_fence_v1.sql:768`.
3. Its function `scoring_authority.enqueue_annual_derived_v1_change()` executes `SELECT ... INTO STRICT` against `current_tournament_pointer_v1` with literal `scope_key = 'BAGGER_INV_PRODUCTION'`: the same migration at line 706. Migration 121 changes the derived enqueue portion, but not this pointer lookup: `supabase/production_migrations/202609280121_score_derived_intents_v1.sql:284`.
4. A fresh Certification database correctly has its own resource ID/pointer and no Production pointer. The lookup raises `no_data_found`.
5. Prepare catches `no_data_found` from its body or nested calls and replaces it with `TOURNAMENT_SETUP_SCORING_CONTEXT_REQUIRED_FACT_MISSING`: migration 084 at line 540. Thus that error does not establish that a course, tee, match, or approved handicap fact is absent.

There is a second independent failing lookup on the same match-update path. `scoring_authority.enqueue_production_calcutta_v1_change()` looks up the literal Production pointer **before** returning for missing/`NOT_CONFIGURED` Calcutta state. See `supabase/production_migrations/202608300075_production_annual_calcutta_v1.sql:2111`, its late-R3 amendment in `202609090097_production_late_r3_initialization_v1.sql:455`, and the narrowly scoped enqueue amendment in `202609280121_score_derived_intents_v1.sql:253`. Draft migrations 131–135 do not replace either trigger function. An unconfigured Calcutta fixture therefore cannot make this resource dependency disappear.

**Minimum correction after the annual gate:** replace only the resource-selection/admission seams through a new forward migration. Production must retain its existing pointer, activation and rejection predicates. Certification must resolve and revalidate its registered resource, exact current pointer, admission and applicable runtime generation from the protected database context. Retain the existing shared lock, enqueue eligibility, dirty-intent creation, transactional rollback, lock order and domain algorithm. Do not skip the trigger, suppress constraints, fabricate a Production pointer, or make an absent resource return success.

**Proof still required:** original failure reproduction with exact trigger context; successful Prepare with triggers enabled; snapshot/handicap readback; atomic rollback on rejected resource/admission; Production-shaped equivalence; derived intent and worker completion with correct resource provenance. A successful source replacement alone is insufficient.

Related exact consumers must be reviewed as part of that same resource seam rather than silently left behind:

| Function | Existing source | Remaining dependency / relevance |
| --- | --- | --- |
| `scoring_authority.enqueue_production_net_skins_v1_change()` | `supabase/production_migrations/202608290055_production_net_skins_v1.sql:1138`; enqueue amendment in migration 121 at line 266 | A configured 2026 Net Skins branch reads Production cutover/resource rows. It is not the established first failure in the unconfigured fixture. |
| `scoring_authority.enqueue_annual_net_skins_v1_change()` | `supabase/production_migrations/202608300074_production_annual_net_skins_v1.sql:1748`; enqueue amendment in migration 121 at line 275 | A configured annual branch reads the literal Production pointer plus current annual generation. This requires the completed annual resource contract. |
| `production_control.lock_net_skins_storylines_v1(text,jsonb)` | `supabase/production_migrations/202609280124_score_derived_delivery_v1.sql:407` | The deadlock-prevention lock helper also reads the literal Production pointer. Preserve its lock order and source-equivalent demand; do not bypass it to make worker completion pass. |
| `production_control.guard_future_unprepared_match_v1()` | `supabase/production_migrations/202608300066_production_future_runtime_activation_v1.sql:855` | An unprepared annual match uses the literal Production pointer in its admission guard. Preserve future setup/lifecycle predicates; class-specific current resource resolution depends on the annual gate. |

These related source dependencies are **PROVEN at SOURCE**, not independently reproduced runtime failures in this review. They are not permission to broaden annual or side-game policy.

## R2-GAP-02 — Director Finalize/Reopen status has no canonical SQL operation

**PROVEN, SOURCE.** `lib/canonical-director-overview.js:102` invokes `SCORING.READ_DIRECTOR_OPERATION_STATUS` before a Finalize/Reopen mutation. `lib/certification-runtime-server.js:12` admits it as a read in the `DIRECTOR` phase. The SQL phase/dispatch allowlists in `supabase/production_migrations/202609300132_certification_domain_gateways_v1.sql:1345` and line 1358 contain no implementation; subsequent draft extensions do not supply one. The request cannot reach a canonical status result.

The legacy response contract comes from `public.read_preview_director_operation_v1(jsonb)` in `supabase/migrations/202609290002_preview_google_runtime_retirement_v1.sql:113`: bounded match/mutation-key lookup, `{ok, committed, receipt}`, actor/action conflict, idempotent receipt. That Preview-specific migration is not part of the authentic canonical Production-profile source catalog; calling its RPC from Certification would not close the installed-capability gap.

`production_control.read_score_mutation_status_v1(jsonb,text)` is **not** a substitute. Its `HOLE_SCORE` and `originating_auth_user_id` restrictions are intentional post-revocation recovery protections: `supabase/production_migrations/202609280122_score_mutation_recovery_v1.sql:44`. Finalize/Reopen use their own existing receipt/hash semantics.

**Minimum correction after the annual gate:** add precisely the missing read operation to the fixed SQL map/dispatch, using the independently admitted Certification context and existing canonical Director actor revalidation. Bind tournament/match, stable operation identity and authorization server-side; reject contradictory payload/context. Resolve only the exact `score_mutations` compound key and verify the established action/actor/hash semantics used by `canonical_finalize_match_v2` / `canonical_reopen_match_v2`. Preserve the supported provider-neutral response shape and do not expose another actor's receipt. No new role, privileged browser access, Google fallback, receipt history scan, or broad receipt-schema change is needed.

An absent receipt is not proof that no concurrent transaction can commit. Any compatible `committed:false` response must continue into the same-operation safe retry path; it must not authorize generating a new identity or claim definitive `NOT_COMMITTED`.

**Proof still required:** authorized Director status before/after commit and after lost acknowledgement; same-ID/action retry; conflicting action/payload/actor; participant/spectator/signed-out/revoked Director denial; wrong resource/target; bounded lookup; canonical readback; unchanged Production and legacy Preview behavior.

## R2-GAP-03 — Reopen mutation identity is classified by phase instead of operation

**PROVEN, SOURCE.** Reopen is a scoring mutation with an established text mutation key, but requires Director authority. The draft correctly assigns `SCORING.REOPEN_MATCH` to phase `DIRECTOR` in `lib/certification-runtime-server.js:15` and SQL migration 132 at line 1352. JavaScript preserves text scoring keys for `SCORING.*`: `lib/certification-runtime-server.js:129`.

The database validator instead selects the text grammar only when `required_phase = 'SCORING'`, otherwise casts to UUID: `supabase/production_migrations/202609300131_canonical_resource_control_v1.sql:250`. Therefore a valid established key such as `native:device-7.score_18` accepted by the Reopen adapter is rejected by the database before the domain operation. Existing JavaScript adapter tests do not prove SQL acceptance.

**Minimum correction after the annual gate:** validate identity using the fixed admitted operation and its required phase. Preserve the existing text grammar for the exact submit/finalize/reopen scoring operations, including Director-admitted Reopen; retain UUID requirements for setup/control/financial operations that already require UUIDs. Preserve outer operation-ID/payload mutation-key equality, context CAS, actor checks and domain replay semantics. Do not change Reopen to scoring/participant authority, relax all Director IDs, generate a replacement ID, or accept arbitrary client operation names.

**Proof still required:** actual SQL/API Reopen with a valid non-UUID key; same-key replay/conflict; malformed/missing/different outer key denial; wrong phase denial; ordinary Director UUID enforcement; authorized Director and negative role/context cases.

## R2-GAP-04 — first canonical-write trigger still requires Production cutover state

**PROVEN, SOURCE; projected runtime failure is STRONGLY SUPPORTED, not independently executed here.** This is an additional connected blocker reachable after the preceding match triggers are corrected.

`capture_first_production_canonical_write` is an `AFTER INSERT` trigger on `scoring_authority.score_mutations`: `supabase/production_migrations/202608240019_production_cutover_activation.sql:1284`. Its final historical function body, `supabase/production_migrations/202609250118_production_first_write_audit_revision_v1.sql:19`, unconditionally reads the Production `cutover_activation_state` row with `INTO STRICT` for 2026. Fresh Certification intentionally has no such row. Normal score, Finalize and Reopen receipts would therefore reach another absent-Production-authority exception. Draft 131–135 do not replace this trigger.

**Minimum correction after the annual gate:** derive the class from the registered physical resource and preserve the entire Production first-write observation/rollback latch branch. A Certification receipt must validate its exact protected context and retain truthful Certification provenance; it must never populate or update a Production cutover row. Determine whether the existing atomic `CERTIFICATION_CANONICAL_OPERATION` audit already supplies the required Certification observation before adding any new audit mechanism. A generic silent return, disabled trigger, or fabricated cutover would not be an acceptable correction.

**Proof still required:** atomic canonical receipt/audit under Certification; missing/stale/wrong context denial and rollback; no Production rows created; genuine local Production first-write latch and subsequent-write behavior unchanged; failure injection around receipt insertion.

## Advancement rule

All corrections above remain **NOT IMPLEMENTED / NOT CERTIFIED** by this review. No gap is closed and no historical P0 PASS is promoted to the new candidate. First establish the approved annual transition's truthful origin, actual lease/admission capture, drains, readiness, CAS and Production equivalence. Then reproduce and implement only the already-approved resource/control corrections, rerun affected runtime/integration/security proof, and account for any newly exposed material authority boundary. The fresh-install manifest remains disabled pending the complete proof gates.
