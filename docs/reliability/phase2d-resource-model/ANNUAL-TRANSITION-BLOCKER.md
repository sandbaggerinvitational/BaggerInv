# Annual transition authority extension — owner review required

Status: **BLOCKED for transition implementation; CREATE/read proof is separate.** No closure enum, provider-fence nullability, legacy-root rule, or annual transition certificate predicate has been changed by the R2 candidate.

The approved singleton resource model requires a truthful certification-local admission fence, drain, lease and current-pointer transition. Source inspection shows that the installed annual transition algorithms also require a historical legacy-provider fence root. A fresh certification installation never had that provider authority. Relabeling fabricated Google evidence would violate the approved model; omitting the existing checks would weaken admission.

## Exact dependency

**PROVEN — SOURCE.** Migration `202608260034_production_scoring_admission_fence_v2.sql` defines `production_control.scoring_admission_closures` with:

- `closure_kind` restricted to `LEGACY_ADMISSION` or `SUPABASE_INGRESS`.
- Three mandatory foreign keys: `external_fence_evidence_id`, `google_writer_provider_fence_id`, and `google_writer_provider_verification_id`.
- A shape constraint requiring a `LEGACY_ADMISSION` root to have authority `GOOGLE` and no parent; a `SUPABASE_INGRESS` closure must have authority `SUPABASE` and a non-null `prior_legacy_closure_id`.

The current installed `annual_scoring_predecessor_certificate_pre_side_games_v1(text)` additionally requires that root to have kind `LEGACY_ADMISSION` and status `CONSUMED`. Its later side-game/identity/derived-worker certificate layers add required drain checks; they do not remove this root requirement.

The dependency is not one pointer lookup:

| Installed function | Required legacy/Production control fact |
|---|---|
| `prepare_production_annual_scoring_transition_v1` | Production release-intent exclusion and the existing runtime-generation capability proof |
| `close_annual_scoring_predecessor_v1` and its predecessor implementations | Existing closure authority and required score-derived/Competition/Intelligence drain |
| `advance_annual_scoring_transition_v1` | The initial-year branch reads `cutover_activation_state`, calls Production drain/finalize operations, and uses their fence evidence |
| `annual_scoring_predecessor_certificate_pre_side_games_v1` | Closed ingress, matching generations, consumed legacy root, lease watermark/fingerprint, no unresolved work, Final canonical matches |
| `activate_production_annual_scoring_transition_v1` | Reads Production cutover activation even for a later predecessor; carries the legacy-root identity into the annual runtime authority while changing current with CAS |
| `abort_production_annual_scoring_transition_v1` | Reopens/restores the appropriate Production or annual admission authority and prior closure state |
| `ensure_annual_side_game_runtime_v1` | Resource-scope and runtime-generation bindings used by annual capability certification |

## Minimum additional contract to review

The following is a proposed design extension, **not implemented or approved by this document**:

| Existing Production predicate | Truthful certification representation needed | Preserved invariant |
|---|---|---|
| Consumed legacy/Google admission root | A distinct certification-origin root tied to the owner-installed registry, installation receipt and `CERTIFICATION_INITIALIZATION` epoch | No invented prior provider authority; immutable origin |
| Three mandatory external/Google fence references | Class-specific shape rules that require the current references for Production, and explicitly prohibit them for a certification-origin closure | Production rejection remains unchanged; no fake provider evidence |
| Production activation authority/admission generations | Exact certification admission/epoch/generation bindings, locked and revalidated during closure | No actor or deployment can select another resource |
| Prior-root closure reference | Reference to the truthful resource-local origin, without calling it a consumed Google fence | Traceable immutable closure lineage |
| Lease high-watermark, drain count, fingerprint and post-close writes | Same predicates against certification-local admission and real lease/state capture | No unresolved mutation, late write, or unsafe pointer advance |
| Readiness, side-game/identity/worker drains and pointer CAS | Same canonical predicates and transaction core | No weaker Ready/Final/activation standard |

The nullable/shape treatment of the three provider references is an authority contract change even if the actor set remains the same. The approved object model did not specify it precisely enough to author it silently. Owner review must settle that class-specific contract before implementation. If actual certification ingress lacks a required lease/control fact, its capture and recovery semantics must also be reviewed; an empty lease table is not substitute proof.

Production tables and predicates must remain intact. A separate copied annual business algorithm, fabricated `resource_scope`/cutover row, fake `LEGACY_ADMISSION` certificate, permissive fallback, or unconditional bypass is not an acceptable solution.

## Current disposition

The new annual CREATE/read extraction preserves the existing fixed-2026 governance, clone, course and audit contract. It only selects the registered resource and the existing current pointer through admitted private cores. CREATE still creates a Draft, not current authority; it does not mark Ready, activate, close, drain, abort, or install a fictional successor runtime.

Fresh schema generation is held behind `AWAITING_COMPLETE_FORWARD_PROFILE`; no final baseline or deployable manifest is emitted while required transition work is incomplete. The local compiler may continue to produce explicitly provisional in-memory artifacts for independent schema, ACL, atomicity and CREATE/read tests. Those results cannot close the annual transition gate or claim complete R2 certification.

Production, hosted resources, real Google accounts and real competitive data remain untouched. No deployment or promotion is authorized by this evidence.
