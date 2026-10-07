# Model D Director canonical scoring design

Status: implemented with focused PostgreSQL proof; complete certification and manifest acceptance pending. Not hosted execution authority.

Base: 078fbfa90e4b1a2b9f01b9e3cc085c33ce271fb5.

The shipping entry point is POST /api/director/canonical-operations. It must retain same-origin enforcement and authorizePreviewDirector with allowBootstrap=false. The adapter must accept only current, provider-authenticated, non-impersonating Director entitlement and derive subject/player/role server-side. Model D admission must come from the validated closed registration, never request fields.

Shipping family: DIRECTOR_CANONICAL_SCORE. Canonical operation: SCORING.SUBMIT_HOLE with the fixed model-d-director-score-v1 transport marker. It is a score mutation only, with no lifecycle or pairing authority. Payload should reuse canonical hole score fields, expected match/hole revisions, permission revision and a UUID operation identity. Actor, resource, deployment, tournament and epoch are not client inputs.

## Transactional requirements discovered

The existing production_control.canonical_submit_hole_score_v2 already revalidates the Director Auth link, verified identifier, active tournament role/membership and Director entitlement. It preserves originating_auth_user_id and actor_id in score_mutations and creates normal score-derived intents through the existing transaction machinery.

However its Director branch validates permission_revision only. It does not require any can_score permission, and the shared core rejects FINAL/locked matches but does not require LIVE. Therefore a new application-only adapter cannot meet this task. The narrow Model D SQL dispatch branch must additionally validate both DIRECTOR and SCORING canonical admission in the same transaction, exact Model D registration/profile, LIVE/prepared scoring snapshot, current open canonical permissions, and match/round/format scope under locks before invoking the unchanged shared score core. No Production or original Certification core body may change.

The new transport also needs a bounded, domain-separated server attestation for the verified Director subject and exact score operation. A bare service credential plus invented authorization JSON must not supply the new operation. Existing session-link server attestation storage may be reused only with a distinct signed message domain that binds resource, deployment, epoch, operation identity and exact payload, and without altering the existing session-link contract.

The canonical ingress protocol must admit/reconcile the new exact operation, preserve identical replay, deny conflicting replay and retain stable status recovery. A failed post-admission request must never be described as not committed without authoritative reconciliation.

## Certification sequence

1. Guarded atomic forward dispatch/phase update with exact predecessor/successor source hashes and ACL/owner/security/search-path metadata preservation.
2. Server-only Director adapter through the existing shipping route, with strict DTO and no authority fields.
3. PostgreSQL 17 + pg-safeupdate proof across BB/SC/SI, truthful Director provenance, permissions/admission/ingress/binding negatives, CAS/concurrency/replay and participant-equivalent derived intents.
4. Actor coverage rerun for all 24 fixed matches.
5. Only after the scoring contract passes, construct and certify the complete deterministic D10 execution manifest and downstream calculator expectations.
6. Broad regression against exact established failure identities, build, immutable source/math hash comparison, secret scan, then one consolidated local commit. No push or hosted action.

Hosted acceptance must later use a certified rollback-only transaction or another explicitly reviewed non-mutating positive mechanism. It must not consume a tournament score from the preserved D9 checkpoint.

The guard runs before durable admission and again under match/permission locks during dispatch. Typed expected guard rejection closes through the existing NOT_COMMITTED protocol; infrastructure errors remain distinguishable. The new private helper adds one function (1,162 total), no tables (281 RLS tables unchanged).
