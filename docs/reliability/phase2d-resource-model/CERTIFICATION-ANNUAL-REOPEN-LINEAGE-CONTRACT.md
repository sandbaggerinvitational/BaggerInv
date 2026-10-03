# Certification annual reopen lineage correction

Status: **PASS at the owned-local PostgreSQL/integration layer**, full131–152 annual run22; no hosted action.

## Observed defect

Run19, `implementation-evidence/annual-transition-2026-10-03T01-44-46-567Z.json`, completed two genuine432-hole tournaments, explicit publications and real FinalRecaps. Both years reached actual CLOSE/DRAIN. After2097's supported CLOSED ABORT reopened admission, re-CLOSE failed `CERTIFICATION_ANNUAL_LINEAGE_REQUIRED` in the existing immutable lineage guard.

Migration138 chooses `annual_scoring_runtime_authorities_v1.predecessor_closure_id` as every future year's new closure parent. That field correctly preserves the annual activation origin (2026's committed annual predecessor). But the reopened2097 ingress generation correctly names its immediately preceding closed2097 generation. The guard correctly rejects those different parents. The predecessor certificate also conflates these fields by requiring immediate closure parent equality with the immutable annual activation origin.

## Unchanged authority; corrected pointer distinction

- **Annual activation origin:** the existing annual authority's `predecessor_closure_id` and `predecessor_tournament_id`. They remain unchanged during ABORT/reopen.
- **Immediate ingress parent:** the closure belonging to the current ingress generation's exact `predecessor_generation_id`. A same-year ABORT/reopen creates another generation and retains the prior closure as REOPENED; it does not rewrite the annual activation origin.
- **Required ancestry:** each immediate closure/generation edge must belong to the same registered Certification resource. Same-year edges must retain the same tournament, authority epoch and pointer revision and have a CLOSED generation and REOPENED closure. Following exact indexed closure IDs must terminate at the unchanged committed annual activation predecessor, with the preceding tournament and pointer revision. Existing Certification ACTIVATE retains closure status CLOSED; consumption is proven by the exact COMMITTED annual transition and boundary fingerprint, not a fabricated CONSUMED status update. The existing accepted CLOSED/CONSUMED root states are retained. Missing, foreign, cyclic, wrong-epoch or skipped ancestry fails closed.

The closure writer records the actual immediate parent after validating this ancestry. The certificate validates the same ancestry instead of requiring the two distinct parent concepts to be equal. Existing transition, actor, resource, CAS, drain, score, publication, FinalRecap, admission and immutable lineage checks remain. No data, closure, receipt or generation is repaired/backfilled by the migration. Production functions and their branches remain unchanged. No public API, request, response or role changes.

## Proof required

Fresh installation must preserve both existing private function OIDs, owner, ACL, security mode, search path and stored dependencies. No runtime role receives EXECUTE. The complete real chronology must exercise first-year and later-year CLOSED ABORT/reopen/re-CLOSE and activation. Negative tests must reject wrong immediate parent, skipped same-year parent, wrong annual origin, cross-resource/epoch lineage and direct private access without disabling triggers. Exact retained annual root and previous immutable history must remain unchanged; same-operation retry/conflict and current-year resource checks remain active.

This corrects an already-approved Certification annual implementation defect. It introduces no new admission policy, publication policy, historical authority or Production behavior. Any implementation that needs such a change must stop for separate review.


## Executed proof

[`implementation-evidence/annual-transition-2026-10-03T02-08-24-102Z.json`](implementation-evidence/annual-transition-2026-10-03T02-08-24-102Z.json) is source-stable and passed13/13 test nodes. It executes two genuine432-hole/24-Final tournaments, both explicit publications and FinalRecaps, both CLOSED ABORT/reopen/re-CLOSE paths, committed CLOSED release/reenable with PAUSED retained, and both annual activations to current2098. The annual activation-origin tuple remains unchanged across each ABORT/re-CLOSE. Installation checked existing OIDs, owner, ACL, security mode, search path, dependencies and preserved guard body. Runtime role EXECUTE denials also passed.

Seven rollback-only lineage faults retain all constraints/triggers: skipped immediate parent, generation cycle, wrong epoch and foreign resource are rejected by immutable guards; wrong annual root is rejected by the existing42501 lineage guard; annual-boundary and immediate-parent fingerprint faults are rejected by actual ACTIVATE with40001 `PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED`. This distinguishes pre-mutation guard coverage from actual certificate rejection. No malformed historical rows were forced past immutable guards.

Migration151 SHA256: `049479ddd58887dedc374a685eae12a6939dc834619b573070a29b44c27e029a`. Run21's incorrect test expectation for the existing wrong-root42501 error is preserved as counterevidence; run22 changed only that exact assertion. Production/provider historical upgrade and positive adopted-publication golden limitations remain separate and are not closed by this Certification proof.
