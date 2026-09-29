# Phase 2C security boundaries

This is a review of a non-Production candidate. Runtime proof is in the recovery, annual-admission and worker receipts; missing/failed evidence must remain NOT PROVEN. See [Recovery security](RECOVERY-SECURITY.md) for the exact participant threat model.

## Authority separation

A participant can ask only for an exact match/mutation receipt belonging to its validated originating Auth UUID and actor. Current verified identity, active linkage and membership remain mandatory. Scoring permission is deliberately not required for this read. A Locked/Final match remains closed to new scoring and submit replay. Current score equality cannot establish mutation provenance. Absent, inflight, other-owner, unbound legacy and unreceipted semantic-noop cases all remain UNKNOWN; no negative conclusion is invented.

The new routes accept only two bounded identifiers, use private/no-store responses, avoid URL mutation IDs, preserve native default-off read admission and do not expose service credentials. The server rate limiter is process-local; distributed admission and timing-side-channel resistance are NOT PROVEN. Sensitive Auth origin is retained privately for forensic ownership, without a foreign key that would delete receipts during account cleanup.

Derived tick/failure RPCs are service-only. Private helpers and attempt tables are unavailable to participant roles. Requeue additionally revalidates an actual Director and binds request ID to actor, target, work identity, family, expected cycle/attempt and reason. It does not approve a handicap, score correction, financial ownership change or publication. A job pointer is never alternate competitive authority.

## Security retained

Canonical scoring continues through the existing authorized RPC. No direct score-table write API is introduced. Synthetic fixture construction and fault injection are isolated from supported runtime operations and use owned socket-only PostgreSQL. Shipping native code is untouched. Financial calculation/output publication retains existing approval and freshness rules. A stale or wrong-generation job may be rejected or superseded only under proven semantic compatibility; it may not acquire current authority merely because a worker retries.

The annual manifest must recognize exact legitimate security topology and reject disabled/missing/extra/tampered triggers. Any repair must retain the authorship enforcement itself. Runtime-role, schema/search-path and manifest fingerprints are part of the proof, not bypassed to make fixtures pass.

## Residual boundaries

Local compatibility roles are not evidence of hosted Supabase BYPASSRLS/session behavior. Actual hosted Auth, distributed rate limits, scheduler credentials, Production configuration and physical clients remain later proof layers. Diagnostic policy tooling remains separate from server-enforced workload admission. No Production read or participant communication is needed for this review.
