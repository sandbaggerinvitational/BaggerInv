# Backend hardening

## Finding

The 2026 backend preserved canonical golf because transactions, revision checks, leases, idempotency keys, and activation guards usually failed closed. The same backend was operationally fragile because too much derived-state work sat on the live scoring path, release compatibility was expressed as exact activation equality without a lifecycle for retained jobs, and certification often proved one layer while claiming another.

This design is based on the exact Release 139 shipping source at SHA `b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6` and retained incident reports. It proposes future behavior; it does not claim the changes exist.

## Preserve the scoring authority

The writable client contract must remain server-gross-only. The request schema carries `teamOneGrossScores` and `teamTwoGrossScores` (`contracts/mobile/v1/scoring-hole-request.schema.json:11`). The installed RPC validates cardinality, reads canonical stroke authority, calculates net and winner, and updates match progression (`supabase/production_migrations/202608240021_production_scoring_operations.sql:1026-1116`). Native, PWA, Director, recovery, and automation must all use that one authority.

The accepted synchronous transaction is:

1. Assert release/runtime and actor authority.
2. Lock the match.
3. Resolve same-ID replay or idempotency conflict.
4. Check permission, match and hole revisions.
5. Validate gross input.
6. Derive strokes, net, winner and running result from the canonical snapshot.
7. Write the hole and match.
8. Write mutation receipt, history, audit and a minimal transactional outbox event.
9. Commit and return the canonical result.

Historical hashes, financial history, side-game calculation, publication, external mirrors and broad dependency comparisons do not belong in this transaction.

## Required boundaries

### Activation and release

Keep exact activation guards. Incident 011 does not justify weakening them. Every release must instead inventory durable jobs and declare one of four outcomes: drain, supersede, retain because the contract remains identical, or carry forward through a private audited compatibility transition. Carry-forward must bind job ID, prior/current activation, contract version, exact source and configuration fingerprints, attempt/lease state, and an immutable receipt.

Incident 013 proves activation is release authority, not ordinary audit state. A first score may record first-write evidence; it must never advance release activation inside the scoring transaction.

### Operation outcomes

Every write exposes an immutable receipt keyed by the operation ID. After a timeout, clients query receipt and canonical state before offering retry. Incident 018 had no round receipt and no child mutation keys, which proved no commit. The later state change made the retained request stale. This must become standard product behavior rather than forensic work.

### Configuration

Required Production secrets must be part of the release manifest by name, target and validation rule. Acceptance may prove presence and function without printing values. Incident 014 occurred because Preview had `SCORING_SESSION_SECRET` and Production did not. General health was insufficient; release acceptance needs a nonmutating scoring-session handshake.

### Contract compatibility

Compatibility is explicit and versioned. A consumer declares accepted producer contract versions and the semantic fields it consumes. A compatibility transition can preserve a job or result only when a named rule proves the exact change is neutral. It must not ignore activation, source, configuration or publication guards.

## Certification matrix

Every critical capability must show each applicable proof layer independently:

| Layer | Minimum backend evidence |
|---|---|
| Source inspected | Reachable function/trigger graph and exact definition hash |
| Unit tested | Pure validation/mapping boundaries |
| Database/SQL tested | Real PostgreSQL execution of every branch, initializer and denial |
| API/RPC tested | Auth, headers, error mapping, idempotency and timeout behavior |
| Staged/hosted tested | Candidate environment plus fail-closed unbound authority |
| Production readback verified | Installed definitions, pointers, receipts and bounded health |
| Physical iPhone verified | Login/session, installed-PWA update, scoring and unknown-response recovery |
| Full lifecycle verified | Configure → operate → change dependency → recover → close |

JavaScript calculator success cannot certify a PostgreSQL claim function. HTTP 200 cannot certify a semantically usable native projection. A local 12/12 READY state cannot certify Production readiness.

## Acceptance gates

- `NA-2026-019`: writable clients remain gross-only, the synchronous plan excludes unbounded derived work, and provisional latency targets are tested against the infrastructure-certified baseline.
- `NA-2026-018`: lost response recovers the original receipt; changed state disables replay.
- `NA-2026-010` and `NA-2026-012`: every installed function executes in the supported PostgreSQL version, including read/claim/complete/fail and initializer branches.
- `NA-2026-011`: a release with pending jobs cannot advance until disposition is explicit and tested.
- `NA-2026-014` and `NA-2026-015`: Production secret inventory, route-specific handshake and installed-PWA worker evidence pass before promotion.

## Evidence

- Calcutta SQL failure: `/private/tmp/bagger-calcutta-processor-incident/REPORT.md:63-118`.
- Activation-stranded Calcutta job: `/private/tmp/bagger-calcutta-processor-repair/REPORT.md:82-109`.
- Atomic Open activation failure: `/private/tmp/bagger-r1-open-incident/REPORT.md:55-61`.
- Missing PWA key and worker uncertainty: `/private/tmp/bagger-live-pwa-incident/REPORT.md:96-143`.
- Score timeout call chain: `/private/tmp/bagger-r3-write-timeout/REPORT.md:41-119`.
- Requirements: `working/backend-requirements.json`.
