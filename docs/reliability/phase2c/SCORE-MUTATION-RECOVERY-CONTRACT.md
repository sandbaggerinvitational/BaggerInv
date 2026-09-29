# Score mutation recovery v1

Status: candidate implementation; runtime evidence is recorded separately. This is an additive read contract. No Production deployment or native shipping behavior is authorized by this document.

## Authority and outcome

`POST /api/scoring/mutation-status` uses current authenticated PWA identity. `POST /api/mobile/v1/scoring/mutation-status` uses current mobile bearer identity, native read admission, and a post-read identity recheck. The only request fields are `matchId` and `mutationId`; neither identity, role, tournament nor gross scores is accepted from request JSON. POST prevents identifiers from becoming URL/query logs and is strictly read-only.

The server invokes `read_production_score_mutation_status_v1(jsonb)` through the existing scoped RPC adapter. Future tournaments use the existing annual dispatcher allowlist and its private `future_production_read_score_mutation_status_v1(jsonb)` target. The current resource/read admission guard remains required; receipt existence does not bypass it.

| Outcome | Meaning | Client action |
|---|---|---|
| COMMITTED | This exact HOLE_SCORE mutation has an accepted receipt whose immutable Auth UUID, player, match and tournament belong to the current verified caller. | Reconcile the returned original canonical acknowledgement; do not resubmit. |
| UNKNOWN | Receipt is absent/inflight, legacy unbound, belongs to another actor, is not a HOLE_SCORE, or an unreceipted semantic NO_CHANGE. | Retain intent and check status. Do not manufacture a new mutation or infer rollback. |
| Error with UNKNOWN | Current authentication/authorization/admission or provider request could not establish a result. | Resolve identity/service failure and retry the same read when appropriate. No write authority is granted. |

NOT_COMMITTED is deliberately not emitted. Current architecture has no durable terminal-attempt record proving a missing mutation cannot still commit. Exact matching current gross data is not mutation provenance.

## Immutable ownership

Migration122 adds nullable `score_mutations.originating_auth_user_id`. The two canonical score submitters capture the validated Auth UUID with the accepted receipt, in the same canonical transaction. Existing authorization, scoring permission, idempotency, correction and response semantics stay unchanged. The new field is not exposed to clients and does not reference `auth.users`: deleting an account must not erase a forensic score receipt.

Existing NULL receipts stay unbound. Reconstructing historical Auth ownership from today's player linkage would let a later account claim an older account's receipt. Such legacy recovery remains UNKNOWN until separately reviewed historical identity evidence can safely establish provenance. This candidate does not backfill it.

Recovery revalidates the existing verified Auth account, active user/player link, active tournament role and active membership. Revoked scoring access alone does not revoke receipt-read authority; revoked account identity/link/membership does. Account deletion intentionally removes recovery access even though the score and receipt remain canonical.

Original and later correction receipts remain distinct. The response field `canonical` means the immutable acknowledgement accepted at that mutation/revision; it does **not** assert that the hole is still at that revision. Recovery returns the original accepted result, not a recomputation against the current hole. A client must separately obtain current score authority before presenting the latest score or making a revision-aware correction. Resolving an old mutation never authorizes overwriting a later legitimate correction. A new mutation returning NO_CHANGE has no receipt under the existing scoring contract; its status remains UNKNOWN even when current scores match.

## Security and bounded work

- Exact receipt primary-key lookup `(match_id, mutation_key)` plus exact match/tournament association; no history discovery or full-table aggregation.
- Private helper and private annual target deny anon/authenticated/service_role execution. Only the approved public service-role RPC and annual dispatcher expose recovery. Receipt tables remain unavailable to end-user roles. Trusted service_role already has a SELECT grant from migration002; this candidate does not expand it. Local fixture service_role lacks hosted BYPASSRLS, so local role checks do not certify provider privilege configuration.
- Current origin, actor and tournament are checked before disclosure. Missing and foreign receipts share the same UNKNOWN response shape; this reduces existence disclosure but is not a constant-time security proof.
- Body limited to 1 KiB, strict bounded identifiers, no-store/private cache control, no arbitrary payload echo.
- Account-scoped limiter uses the existing process-local limiter (60 requests/minute); this is not a distributed anti-enumeration guarantee. Logs may carry opaque request/mutation/match IDs, not auth UUIDs or tokens.
- SQL required audit receipts remain separate from operational telemetry. Recovery does not create a receipt, audit event, score, permission, lease or derived job. Telemetry failure must not redefine canonical state.

## Compatibility and limitations

Existing PWA/mobile score endpoints are unchanged. A new additive endpoint does not cause current PWA UI or Build10 to call it automatically. Build10 native queue/navigation defects remain unresolved. Director recovery UI, historical account reassignment, archival authority reads, and guaranteed NOT_COMMITTED resolution are not implemented here.

The normal HTTP recovery route constructs PLAYER authority. The database helper preserves existing trusted DIRECTOR validation when a reviewed server caller provides that role; this is not a new Director UI or generic Director-only-account recovery contract.

The annual runtime still requires valid current annual admission. Post-close archival receipt retrieval is not newly authorized. A failed identity or runtime guard must not be bypassed merely because the receipt was created before Lock/Finalize.

Proof must separately record: unit validation; actual role denial; PostgreSQL receipt lookup; real PWA adapter; real mobile DTO/Swift decode; local HTTP transport if executed; hosted provider identity; Production; physical iPhone. No lower layer substitutes for the last three.

## Receipt retention

SOURCE INSPECTED: the installed `score_mutations` table has no receipt TTL column or scheduled purge in the inspected application/migration paths. Recovery uses the existing exact `(match_id, mutation_key)` primary key, not a time-window search. The Phase2C migration retains existing rows and leaves their absent immutable Auth provenance as NULL; it does not infer or backfill ownership. Test fixture resets explicitly delete synthetic rows and are not retention behavior. No assertion about external administrative cleanup or hosted backup retention is made.

PROPOSED policy: keep accepted receipts queryable for the entire active tournament, Lock/Finalize transitions, supported-client retry/relaunch period and unresolved incident/reconciliation period. Do not expire receipts merely because a match is Final, an account is deleted, or a newer score correction exists. The owner must set any later retention/archive interval together with supported-client lifecycle and private audit retention; no measured evidence currently justifies a numeric day count. Before any future purge/archive implementation, prove that the defined recovery window is over, preserve approved competitive/audit evidence, and declare whether archived recovery is supported. Phase2C neither deletes receipts nor grants post-close/archival identity authority.

`originating_auth_user_id` is private account provenance, not a public API field, metric label or repository evidence identifier. Account deletion does not cascade-delete the canonical receipt; current identity checks deny the deleted account. Restrict retained UUID access to the existing trusted database/audit boundary and apply the approved sensitive-audit retention policy. The new origin field increases retained private metadata; a formal duration/privacy policy remains owner review work, not a claim of perpetual retention compliance.
