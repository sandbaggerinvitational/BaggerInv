# Recovery API contract

## Current proof snapshot

Generated 2026-09-29T21:40:11.927846+00:00. These labels apply only to the selected current-source artifacts. They do not close the overall phase or approve deployment. Pending/stale receipts remain NOT PROVEN.

| Proof | Current artifact validation | Scope |
|---|---|---|
| Recovery50 and current candidate DTOs | PROVEN_LOCAL | Real local SQL/API; injected provider identity/transport |
| Retained Swift24 decoder checks | PROVEN_LOCAL | macOS models; UTC; no native HTTP/queue/UI |
| 1×/2×/5×/10× after supported Lock | PROVEN_LOCAL | Local indexed receipt lookup; not Production capacity |

Detailed validation reasons are retained in the review package [recovery scope review](evidence/recovery-scope-review.json); final checked-in reports must link the corresponding durable execution artifacts.

## Current proof snapshot

Generated 2026-09-29T20:53:14.987845+00:00. These labels apply only to the selected current-source artifacts. They do not close the overall phase or approve deployment. Pending/stale receipts remain NOT PROVEN.

| Proof | Current artifact validation | Scope |
|---|---|---|
| Recovery50 and current candidate DTOs | PROVEN_LOCAL | Real local SQL/API; injected provider identity/transport |
| Retained Swift24 decoder checks | PROVEN_LOCAL | macOS models; UTC; no native HTTP/queue/UI |
| 1×/2×/5×/10× after supported Lock | PROVEN_LOCAL | Local indexed receipt lookup; not Production capacity |

Detailed validation reasons are retained in the review package [recovery scope review](evidence/recovery-scope-review.json); final checked-in reports must link the corresponding durable execution artifacts.

Endpoints: POST `/api/scoring/mutation-status` and POST `/api/mobile/v1/scoring/mutation-status`. Both are read-only. Use current authenticated identity; the mobile route additionally requires native read admission/certification. Only the following request JSON is accepted:

```json
{"matchId":"2026-R3-12","mutationId":"00000000-0000-4000-8000-000000000001"}
```

A verified accepted receipt returns HTTP 200 with `ok:true`, `contract:"score-mutation-recovery-v1"`, `status:"COMMITTED"`, the requested IDs, `retry:"DO_NOT_RESUBMIT"`, and `canonical` holding the original accepted hole/match revisions, timestamp, gross/strokes/net/hole result and match acknowledgement. That object is not a claim about the latest current hole after a later correction.

An absent/inflight/legacy/foreign/unreceipted mutation returns HTTP 200 with `status:"UNKNOWN"`, `retry:"CHECK_STATUS"`, and no canonical object. It never means NOT_COMMITTED. Identity/input/provider errors return an appropriate 400/401/403/429/503 response with UNKNOWN. Native admission errors retain the existing native `apiVersion`/`error.code` envelope, including NATIVE_READS_DISABLED; they are not collapsed into a generic feature error.

All responses are private/no-store and vary by Cookie/Authorization/Certification. Invalid content types, oversized streams and extra authority/gross fields are rejected. No mutation ID appears in the URL. Existing request correlation and mutation identity remain distinct.

The supported caller resolves the original mutation and then separately reads current score authority before showing a later revision or offering a correction. Never generate a new mutation merely because the status read timed out. Existing native/PWA UI does not adopt this additive endpoint automatically; subsequent UI work must deliberately implement this contract and retain unsent/conflicting intent.

SQL operation: `read_production_score_mutation_status_v1`. Annual dispatcher target: `future_production_read_score_mutation_status_v1`; it remains private and requires current annual runtime admission. No historical receipt scan or statement-timeout increase is part of this contract.

## Environment applicability

This operation uses scoped Production read authority or the protected annual READ dispatcher. It does not add a Preview-authority equivalent. The existing generic scoringShadow fallback calling this Production-named RPC does not bypass its resource/phase guard; availability in an ordinary Preview deployment is not certified. A later isolated hosted test must verify its safe authority and transport configuration without accessing Production.

## Client rollout and rollback

The endpoint is additive; current score endpoints and DTOs are unchanged. Existing native/PWA clients require separate adoption work to consume it. Returning an old application artifact removes this route; it must not remove the retained receipt origin column or its evidence. Generic old-application/new-database rollback and mixed worker versions require a separate rehearsal. A missing route or temporary 503 is UNKNOWN to the client, never permission to create a fresh mutation.

## Proof and deployment distinction

Source inspection establishes this additive contract and its strict authority checks. Actual current-source local execution, retained native model decoding and post-revocation timing are separate proof layers above. A local test PASS does not establish hosted authentication, generic Preview availability, existing client adoption, physical behavior, or Production deployment authorization.

## Proof and deployment distinction

Source inspection establishes this additive contract and its strict authority checks. Actual current-source local execution, retained native model decoding and post-revocation timing are separate proof layers above. A local test PASS does not establish hosted authentication, generic Preview availability, existing client adoption, physical behavior, or Production deployment authorization.
