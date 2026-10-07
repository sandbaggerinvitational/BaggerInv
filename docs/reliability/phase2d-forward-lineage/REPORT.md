# Model D immutable forward-lineage attestation — local certification

Status: PASS. Base: `2e3f3042e3d2b7e39f078ca7d10f6081a5d008b4`. No push or hosted action.

## Historical facts and evidence

The original receipt remains the provenance of the original installation. Its manifest is `c50d395eeab4a2e6b35815537b4e27b42af8c93df003d31afdda0d9de146d1b5`; schema is `a82345ddbaa01dadb153baeed1973f30290cf7084ff8038bf50e247122fb5ae2`. The retained execution capture records successful session-link installation/replay and exact 1,160-function/280-RLS catalog acceptance. It is external owner execution evidence, not a historical database migration receipt.

The committed sanitized evidence reference is `evidence/retained-execution.json`, digest `965307ff9a2bedd5dd8d5038f715cfc3ba834616d2bfcaa074dedb338dd35e50`. The fixed session-link artifact digest is `bcbffcaa33440a4137a997b1c3d1d2f1515675d300abb6bd36b8a442f77f3d0a`.

Evidence classes: ORIGINAL_INSTALLATION_RECEIPT, FORWARD_ARTIFACT, RETAINED_EXECUTION_EVIDENCE, CURRENT_CATALOG, CURRENT_STATIC_DATA, RESOURCE_BINDING, ATTESTATION. The supported order is original installation → session-link v1 → verified current state. Historical execution timestamp, transaction ID, actor and migration sequence remain NULL. No historical record or timestamp is invented.

## Contract and authority

`production_control.certification_forward_lineage_v1` is private, owner-only, RLS enabled with no client policy. PUBLIC, anon, authenticated and service_role have no grants. No public RPC, new role or participant runtime path exists. One fixed owner renderer records the retrospective session-link attestation only for the retained exact Model D resource/project after canonical resource/deployment/release/revision/epoch checks, disabled admission, paused ingress and stopped supervisor checks.

The record binds the entire preserved receipt, fixed artifact and evidence digests, reviewed predecessor/successor, exact current catalog/static contracts, resource identity, runtime binding and owner operation revision. `created_at` is database clock time at insertion; replay preserves it and the entire row. UPDATE, DELETE and TRUNCATE are rejected, including ordinary owner DML, on both the new table and original receipt. Conflicting replay is denied. Trusted managed-owner DDL cannot be made impossible by a PostgreSQL trigger; disabling/removing guards or changing their definitions is denied by exact catalog verification. This contract does not claim protection against an administrator who intentionally dismantles and perfectly restores controls.

Installation uses `renderModelDLineageInstallation`: exact pre-catalog, hash-guarded forward SQL and exact post-catalog/static verification occur in one transaction. Replay requires exact current metadata. Recording uses `renderModelDSessionLineageAttestation`; verification is read-only and sets only transaction-local transport context. Original receipt values are never substituted or updated.

## D9 provenance paths

Fresh current installation requires its own current-image receipt, exact current catalog/static data and current binding; no retrospective record is required or accepted. A forward-upgraded installation requires the exact original receipt plus the fixed exact retrospective record and current state. D9 rejects missing, mismatched or extra known records. The fixture renderer invokes this verifier inside its existing atomic fixture transaction. Fixture structure, identities, scoring and replay semantics remain unchanged.

Current manifest: `9c4c9c18a9bf1ae14b788b095c974bd07ca5561dfa27a981b387e1e7fe6f85f7`.
Current schema: `a81e8ff36c96a4ad98a6633124c46211f3f87e04fe379c1dfab7113289a43612`.
Catalog artifact: `6ab4743c3b7fe2053b5175e58ebeb95e1e523d6957a9e328eb63fcd7dedfde91`.
Normalized SQL catalog digest: `dd1ec27a849429b88d921cf57d27a961b679c57b7b77680cfa5ca44c301a4cbc`.
Static digest: `7b93c4235a5c18cdd68be56b13df26ffcab1d9af8f3b3d9b27895cd6b8afb27d` (identical to original baseline).

Before: 1,160 functions / 280 RLS tables. After: 1,161 functions / 281 RLS tables. Added objects: one attestation table, one immutable mutation trigger function, two triggers (attestation and existing receipt). Existing security/function contracts remain exact; certified dependency ordering normalization is reused unchanged.

## Future corrections

There is no generic artifact or migration-history writer. Each future approved correction requires a separately reviewed closed artifact/operation revision. Its protocol must atomically verify predecessor, apply the fixed hash-bound artifact, verify successor catalog/static state and append authoritative execution/attestation evidence before COMMIT. Execution and attestation timestamps must be obtained at their actual events. A failure rolls back both correction and evidence. Identical replay returns the same immutable record; conflicting replay is denied. The storage supports append-only resource revisions; this version authorizes only the fixed retrospective session-link record. Future revisions require extending the closed verifier deliberately, not inferring unknown history.

## Evidence limitation

Exact catalog/static/security equality detects unapproved current-state drift. Exact known records detect missing, mismatched or unapproved known lineage. Neither proves that no unrecorded historical transient mutation occurred and was later perfectly reverted. No such omniscience is claimed.

## Local proof

Owned socket-only PostgreSQL 17 with pg-safeupdate: two integration groups PASS, zero failures/skips. The evidence contains 62 case records, including predecessor guard rejection; fresh and forward-upgraded positives; exact install/replay; fixture atomic rollback/replay; receipt substitution and tampering; missing/extra records; forged artifact/evidence/predecessor/successor/resource fields; stale binding; direct role denial; update/delete/truncate denial; function/body/ACL/owner/security/search_path/RLS/policy/private exposure/public object/static drift denial.

No shipping runtime changes: broad regression and build not required for this owner-tooling/SQL-only correction. No 864-hole rerun. Secret scan: zero detected leaks. Historical migrations and historical canonical bootstrap unchanged. Session-link runtime/SQL, Queue, workers, FinalRecap, side games, registration, branch containment, dependency lock and fixture manifest unchanged.

Hosted Model D: no contact/mutation, SQL not installed, attestation not created, fixture/player links remain at the owner-reported zero checkpoint. Production/original Certification/old Preview/Google/messaging: no access or mutation.

Ready for hosted attestation installation: YES. Ready to resume D9: NO until hosted attestation accepted. Ready D10: NO.

Next owner action: authorize Model D-only installation using the reviewed owner install renderer, creation of one truthful retrospective session-link attestation bound to the preserved receipt/retained execution evidence/exact current catalog, immutability and resource-binding verification, then resume D9 only if hosted attestation passes. Do not begin D10.
