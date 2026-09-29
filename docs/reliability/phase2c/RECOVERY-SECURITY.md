# Mutation recovery security review

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

Threat: knowledge of a mutation ID must not disclose another player's score receipt, grant score access, reconstruct ownership from a new account link, or bypass current resource/identity admission.

| Control | Implementation | Behavioral evidence |
|---|---|---|
| Immutable origin | Validated Auth UUID captured atomically by both score submitters | P2C-A-ORIGIN; annual path has separate admission proof |
| Current identity | Existing actor assertion rereads verified Auth, active link/role/membership | P2C-A-DENY-UNLINK/UNVERIFY/ROLE_REVOKE; P2C-A-DELETED |
| Actor binding | Receipt UUID + actor + match + tournament + HOLE_SCORE | P2C-A-SPOOF / ENUMERATION |
| No provenance guessing | Legacy NULL and missing/new-ID NO_CHANGE produce UNKNOWN | P2C-A-LEGACY / NO-CHANGE / INFLIGHT |
| Read-only authority | SELECT-only helper; no permission restoration | P2C-A-READONLY; three-format Lock/Final cases |
| No direct end-user table access | Existing table/schema ACLs preserved | P2C-A-ACL actual anon/authenticated 42501 |
| No private-helper bypass | Helper denies anon/authenticated/service_role | P2C-A-ACL actual role execution |
| Trusted service boundary | Existing service-role table SELECT remains; publicRPC is service-only | P2C-A-ACL; not a hosted BYPASSRLS proof |
| Default-off native reads | Existing mobile read-admission gate preserved | PN2 route inventory + actual recovery factory default-off test |
| Bounded request | Two identifier fields, 1 KiB body, account limiter | Recovery unit/API-handler suite |
| Secret-safe output | Whitelisted stored golf fields; generic provider failures | Unit projection/error tests |

The first ACL run failed because its test demanded that service_role have no SELECT on receipts. Migration 002 already granted SELECT to the trusted backend role. The corrected test preserves this existing authority and records local row visibility; it does not weaken the end-user or private-helper boundary. Provider service_role BYPASSRLS is not modeled by the local compatibility role.

Known limits: process-local limiter is not distributed admission; response equivalence is not a constant-time proof; exact Auth UUID retained for private forensic provenance needs the existing sensitive audit retention policy. Auth deletion retains the receipt but intentionally denies the deleted account. No new owner-wide lookup, enumeration endpoint or historical identity backfill exists.

## Independent source review

SOURCE INSPECTED: migration122 leaves score authorization before receipt replay, and patches only accepted receipt INSERTs for immutable origin. The recovery helper reruns current actor authority before its exact owned receipt query. It has no match FOR UPDATE, score calculation, permission grant, current-gross fallback or historical ownership inference. The mobile route retains the existing current read-admission gate and post-read identity recheck. The PWA route uses current verified participant identity; the database independently checks that identity at receipt read. No new ownership or authorization bypass was found in this review.

Runtime proof is [the composed recovery receipt](evidence/recovery.json), including actual role-denial, reassigned-account, legacy-upgrade, held-match-lock and read-only cases. An incomplete/stale final run is not cured by this source review. Optional telemetry uses safe existing SCORING events and is not canonical receipt evidence. Process-local rate limiting and source inspection do not establish distributed capacity, constant-time privacy, hosted Auth revocation or mixed-version rollback safety.
