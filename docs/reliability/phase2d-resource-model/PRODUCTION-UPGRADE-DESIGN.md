# Production upgrade and rollback design

**Current local continuation: final-source provider revalidation and the exact original130-to152 bridge/catalog impact proof now pass at their scoped synthetic/local layers. This does not prove the live Production ledger or authorize any deployment. Final installer and regression closure pass at the accepted local scope.**

**Historical design record.** The proposed sequence below is preserved; current local implementation and proof are tracked in [CERTIFICATION.md](CERTIFICATION.md). No Production action has been authorized or performed. The earlier genuine historical-provider upgrade test stopped at migration069; that counterevidence remains preserved. Current scoped compatibility and original130 upgrade results are linked in the certification report. Live Production drift and operational upgrade remain unproven.

Status: **PROPOSED; no Production access or migration execution.** Application base `7cec5128409286f5b4a5f3524d4c5488124a7be7`. Actual deployed database drift/ledger is UNKNOWN in this task. A later authorized preflight must compare it with the exact reviewed catalog before applying anything.

## Preserve one existing Production authority

Do not recreate Production, move competitive data, change its Supabase ref/origin/domain, or replace its release/activation system. Add a canonical resource descriptor using the existing identity `BAGGER_INV_PRODUCTION`. The existing `resource_scope`, cutover, maintenance, normal-release, entitlement, governance, scoring and financial rows remain authoritative for the Production class.

The new descriptor is a singleton, owner-only metadata record validated against the existing exact Production constants, table checks, pointer and schema contract. It does not grant a new role or capability. The certification registration/admission tables remain empty. No new Production activation, release attempt, ingress state or worker scheduling is performed by this migration.

## Proposed forward sequence

Use newly generated forward migrations with immutable source manifests; names below are logical work units, not invented executable migration files.

1. **Resource descriptor and constraints.** Require an exact supported base catalog/ledger and expected owners/ACLs/default privileges. Create the new singleton resource table/private registration functions with runtime writes denied. Insert exactly the validated Production descriptor. Reject unknown/multiple/mixed resources instead of inferring their class from URLs. Add and validate the current-pointer FK to the descriptor; only then replace the old `resource_scope` FK within the same transaction. Preserve the pointer's key, target and revision. Apply narrowly enumerated projection provenance FKs/checks; old Production values must already satisfy them.
2. **Context and shared cores.** Add resource-aware private context resolution and certification-only wrappers. Preserve each old public Production function's OID where required by stored dependencies. Move only resource admission out of newly shared domain cores; do not drop actor/domain/revision/lock checks. Test nested and cached callers, `pg_depend`, ACLs, owners and search_path before accepting the migration. Exact unknown source hashes or grants abort the transaction.
3. **Annual, worker and audit context.** Extract required annual admission/domain separation, resource-local current/governance resolution, certification worker dispatch and accurate provenance. Retain original Production receipt hashes, release checks, job eligibility/order/backoff/dead-letter semantics, financial approval and audit fields. Certification records must not use the old Production activation defaults.
4. **Finalize schema contract.** Verify canonical catalog/worker/RPC inventory and install the resource-schema capability marker. No runtime becomes healthy merely because the marker exists: it must match the catalog and registration. Application code never performs migration/registration automatically.

The exact authored migrations and dependency hashes are an implementation deliverable. Historical001–130 and the existing optional incremental files are not edited. If the actual later Production baseline lacks earlier approved Phase2/P0F migrations, those remain separate prerequisites in their preserved order. Applying the new delta to an unknown Release139-shaped database is prohibited.

## Backfill and locking

The preferred model does not backfill resource IDs through all scores, results, players, financial facts, jobs or receipts. One physical database is one resource. Backfill is confined to the new singleton descriptor and any strictly required resource metadata relationship. Current-pointer rows and existing competitive keys do not change. Active project/provenance columns can reference the registered exact values without rewriting the values themselves.

Validate constraints before admitting new code. Estimate table sizes and lock durations later from safely authorized metadata; this design does not claim online migration safety or zero downtime. Installation must remain closed if interrupted. `NOT VALID` plus validation can reduce some validation locking, but the actual PostgreSQL lock plan must be reviewed per constraint. No concurrent index is proposed without a demonstrated query need.

## Production before/after requirements

| Area | Before | Required after |
|---|---|---|
| Resource identity | Existing fixed Production scope/ref/origin/domain | Same values and sole Production authority; new descriptor names that existing scope |
| Current/governance | Existing pointer and fixed governance semantics | Same pointer row/revisions and entitlement root |
| Admission/release | Existing cutover/maintenance/normal-release and request predicates | Identical outcomes; certification APIs reject this resource |
| Score/recovery | Existing RPC contracts, hashes, receipts, locks, rules | Same external responses and canonical results; private core reuse must be equivalent |
| Director/annual | Existing actor, target/current-year, revision, lease/lifecycle checks | Same rights, denials, retries and immutable history |
| Workers/financial | Existing required eligibility, claims, retries, publication approval | Same work and policy; no certification jobs in this DB |
| Audit | Existing historical records and new-event meanings | No rewrite; existing Production fields remain equivalent |

## Compatibility and rollback

**Old app / new schema: CONDITIONAL, intended compatible.** This requires preserved Production public signatures/OIDs where relevant, response/error fields, receipt hashes, defaults and semantics. Prove both positive and negative application/database behavior against base and upgraded Production-shaped local fixtures. Source similarity alone does not pass this gate.

**New app / old schema: CERTIFICATION FAIL-CLOSED; Production conditional.** Explicit certification selection requires new schema/resource registration and must never fall through. Ordinary Production can retain its original path only if its existing schema checks pass; no assumption that new shared-core code works against an unreviewed older schema.

**Application rollback:** On Production, return to the previous app while retaining the additive descriptor/compatible forwards, provided the old-app/new-schema proof passed. On certification, the base application cannot use the new resource; close certification admission before rollback, preserve receipts/jobs/audit and show unavailable. Never redirect to old Preview or Production.

**Database rollback:** Prefer forward repair after evidence capture. Removing new schema requires closed admission, drained/contained work, exact prior function definitions/ACLs restored in dependency order, and proof no retained row depends on removed control objects. Do not delete competitive or audit history. A downgrade is not promised safe until implemented and tested. A recoverable snapshot/restore rehearsal is a separate hosted preparation gate; this local design does not close backup/restore P0.

Any material difference in Production admission, role, financial/privacy, score rule, replay, or release semantics stops implementation for owner review. No deployment is authorized by this design.
