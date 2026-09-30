# Canonical annual CREATE contract

The annual protocol has two different identities: the **current tournament authorizes the operation**; the **target tournament is the future draft being created**. They never share a year field. Google remains retired. This contract is `production-future-year-administration-v1` with corrected target metadata; the browser request and response shapes remain compatible.

## Before and after

**PROVEN — P2C1-ANNUAL-001.** At retirement SHA `4f5be5928a362f77edca375919df55be23695177`, the server overwrote the builder's target `tournament_year` with the current authorization year. SQL required that field both to equal the current pointer and to describe a future year. Actual schema 126 execution rejected target 2098 with `PRODUCTION_FUTURE_RUNTIME_EXACT_RESOURCE_REQUIRED`; current 2026 instead returned `FUTURE_TOURNAMENT_METADATA_INVALID`. No future draft was created. The unchanged historical reproducer and its previous expected-red report remain preserved. The closure before run is in `evidence/revalidation/phase2c1/evidence/annual-initialization.json`.

**PROVEN — P2C1CL-ANNUAL-READ-001.** After correcting CREATE, actual canonical GET exposed SQLSTATE 42703: the annual runtime read referenced `match_participants.team_id`, a column that does not exist. The participant owns a team side; `scoring_authority.teams` owns the ID for that side within the match's tournament. Migration 127 uses that exact existing unique key. A rollback-only execution of the historical function must still reproduce 42703. This is a current-read repair, not a scoring/roster rule change.

**PROVEN — P2C1CL-ANNUAL-HASH-001.** The actual shipping future-runtime caller was also incompatible with the installed SQL hash contract. It hashed compact, alphabetically ordered JSON while PostgreSQL verifies its `jsonb::text` representation. A valid promotion request failed before setup processing with `PRODUCTION_FUTURE_RUNTIME_PAYLOAD_HASH_INVALID`. The captured before report is [annual-runtime-hash-before.json](evidence/annual-runtime-hash-before.json). This is separate from CREATE and from the annual-worker 42883 defect.

The correction uses a provider-neutral annual request encoder for runtime V2 and annual-transition requests only. It reproduces PostgreSQL UTF-8 key ordering, separators, and numeric exponent expansion for the JSON wire value. The original V1 administration receipt hash is unchanged. Five actual PostgreSQL vectors cover nested objects, Unicode, decimal values, and both numeric exponent extremes. The old encoding still fails in the regression. The candidate now creates and reads a canonical runtime, replays its same logical request, and rejects conflicting payloads. Annual-transition **receipt** hash admission/replay/conflict is proven; the complete annual activation lifecycle is not implied.

## Request and authority

The existing Director panel uses `submitFutureYearAdministration` and `/api/director/future-tournaments`. Public request fields remain:

```json
{
  "action": "create",
  "targetTournamentId": "2098",
  "tournamentYear": 2098,
  "expectedRevision": 0,
  "operationRequestId": "a1111111-1111-4111-8111-111111111111",
  "name": "Synthetic annual tournament",
  "destination": "Synthetic course",
  "startDate": "2098-09-20",
  "endDate": "2098-09-22",
  "timeZone": "America/Chicago",
  "creationMode": "BLANK",
  "reason": "Create the reviewed annual draft"
}
```

The year is a tournament year, represented canonically as an integer; its ID is the exact four-digit decimal string. There is no arbitrary tournament slug. The browser contract permits an omitted year to be derived once from the exact ID; a supplied year must already be an integer, never a string, fraction, scientific-notation string, or conflicting value. The existing schema upper bound 2200 remains. A target is future only if SQL finds it strictly later than the server-bound current pointer year. A hardcoded 2027 check no longer decides annual eligibility.

| Internal field | Meaning and owner |
|---|---|
| `tournament_id`, `tournament_year` | Current authorization scope from server-resolved actor/current-tournament context; SQL rechecks current pointer under the existing shared annual-admission lock. |
| `authorization` and actor fields | Authenticated Director identity; owner-only CREATE is rechecked in PostgreSQL. Browser claims cannot supply entitlement. |
| `target_tournament_id` | Exact future draft ID from the reviewed browser request. |
| `target_tournament_year` | Integer target metadata, separately validated by builder and SQL. It is never overwritten by current scope. |
| `operation_request_id` | Stable UUID for this logical CREATE and all its retries. |
| `expected_revision` | Zero for CREATE; an existing draft cannot be overwritten. |
| `request_payload_hash` | Existing server request identity, independently captured with database payload hash in the atomic receipt. |

HTTP access remains Production Owner administration, with the existing activation/origin/Director gate. No privileged database access is exposed to the client. Local proof uses explicit synthetic HTTP identity/activation adapters and owned Unix-socket RPC transport; it runs the actual request handler, server builder and installed PostgreSQL admission/grants/RLS. It does **not** claim hosted authentication, PostgREST, or Preview annual-authoring support.

## Initial authority and transaction

CREATE atomically commits one private catalog draft, one bound canonical resource record, one audit event and one operation receipt. Initial lifecycle is `DRAFT`, setup revision 1 and lifecycle revision 1. The current pointer and all current tournament facts remain unchanged.

`BLANK` deliberately does not invent players, teams, pairings, courses, tees, handicaps, scores, approved financial configuration, current side-game results, operational workers, runtime generations or readiness certificates. The readback lists the missing setup requirements; it cannot call the draft Ready/Open. `CLONE_STRUCTURE` remains the existing explicitly reviewed, allowlisted historical structure clone; it does not copy membership, identity or competitive facts. Full annual activation is a separate protocol.

Course/tee and handicap approval remain explicit owner setup. Scoring context remains unprepared. Side-game configuration/calculation/publication stays under its existing contracts. Empty draft creation does not enqueue score-derived workers. Known annual-worker function execution is a separate P0-C suite, not inferred from this CREATE proof.

## Determinism and recovery

| Case | Required result |
|---|---|
| New valid future ID/year | One DRAFT + resource + audit + receipt. |
| Same ID, payload and operation UUID | Same recorded receipt, `idempotent:true`; no duplicate authority or audit. |
| Same operation UUID, different payload | Explicit `PRODUCTION_FUTURE_YEAR_IDEMPOTENCY_CONFLICT`; no overwrite. |
| Same year, new operation UUID | `FUTURE_TOURNAMENT_CREATE_PREDECESSOR_INVALID`; never overwrite the existing draft. |
| Conflicting ID/year or unsupported representation | Reject before write; raw SQL also validates the integer target field. |
| Existing partially configured draft | CREATE rejects; continue the existing setup contract instead. |
| Failure after catalog/resource/audit and before receipt | Whole transaction rolls back. Retry the same operation after recovery. |
| Commit response/readback lost | Outcome may already be committed. Keep the same UUID; retry and read back canonical state. |
| Readback target/year/revision mismatch | Client reports `FUTURE_YEAR_CANONICAL_READBACK_REQUIRED`; it does not show success or fall back to Google. |
| Historical failed/pending Google jobs | Preserve records; ignore them as annual admission/readiness dependencies. |

The Director panel clears its reviewed operation and shows confirmation only after GET returns the exact target, numeric year and a setup revision at least as new as the annual-administration receipt. Runtime operations retain their own revision domains and are not incorrectly compared to setup revision. Global course operations intentionally return a course identity rather than a tournament identity: additive `courseId`, `teeId`, and `contextRevision` receipt fields support an exact course/context readback without inventing tournament ownership. The same integration creates a course, configures all 18 holes and assigns that context to the synthetic future round. Malformed successful mutation responses are unknown outcomes and keep the same operation UUID.

## Proof and limits

Golden IDs: **NA-2026-ANNUAL-CREATE-CONTRACT** and **NA-2026-ANNUAL-RUNTIME-WIRE-HASH**, future tournament release blocking. Test: `test/reliability-phase2c1-closure-annual-create.integration.test.mjs`; matrix and raw query plan: [annual-create-results.json](evidence/annual-create-results.json). The final annual integration contains 21 passing assertion-matrix cases within two Node wrapper tests. The targeted client/hash/application selection contains 31 passing Node tests, including 14 new tests. The client unit suite separately verifies canonical routing, no fallback, exact readback, unknown response outcomes and revision-domain separation. Raw results: [annual-create-results.tap](evidence/annual-create-results.tap.gz), [annual-unit-results.tap](evidence/annual-unit-results.tap.gz). Production and physical proof remain **NOT PROVEN**.

The SQL test executes the real current-owner guard and checks revoked-owner denial, anon/authenticated RPC denial, service-role-only execution, and retained RLS. HTTP participant/spectator/signed-out denial is tested with synthetic identity adapters. Global Google configuration is absent and remote sockets denied. Historical read-model inserts are explicitly segregated from CREATE proof and are never evidence that CREATE fabricated future owner facts.

## Migration and rollback

Migration `202609300127_canonical_annual_create_contract_v1.sql` replaces two exact-hash functions. It changes no table, index, RLS policy, grant, score function, side-game rule, or current pointer. The annual read adds an exact tournament+team-side lookup, bounded to one existing team row by the existing unique key. The before query could not execute; therefore no fabricated before latency/plan comparison is reported. The isolated after plan uses `teams_tournament_id_team_side_key`, estimates one row and returns one row with two shared-buffer hits and no temporary blocks. This proves the intended exact lookup in the synthetic fixture, not hosted latency or database capacity. The raw plan is embedded in `annual-create-results.json`.

Install order for a later authorized environment is 125 →126 →127 before the matching application source. A repeated 127 is intentionally rejected by its source-baseline guard; the failed transaction changes nothing. It is not advertised as an idempotent standalone SQL script.

Old browsers keep the same request shape. The previous server does not send `target_tournament_year` and therefore cannot create with 127; it already failed CREATE under 126. During an application rollback, disable annual mutations and retain the compatible read repair, or forward-fix back to the matching server. Existing catalog/receipts remain intact. Rolling the function back does not justify deleting created drafts or receipts. Release 139 compatibility is a later hosted/deployment gate, not a local inference. No migration or deployment was run against a hosted environment.

## Deployment compatibility qualification

The browser still uses the existing endpoint and request fields. Runtime course receipt fields are additive. V2 runtime and annual-transition SQL already required the PostgreSQL digest, so the corrected encoder is compatible with previously valid receipts; it does not rewrite them or make formerly invalid requests valid by bypassing checks. V1 CREATE hashes remain distinct and unchanged. No new package, service, credential, external destination, queue, cron, or automatic financial publication was added.

The independently reviewed full annual transition, known 14-function annual worker inventory, and hosted authentication remain separate proof surfaces. This report proves initial CREATE, bounded canonical readback, explicit synthetic setup/promotion and the affected digest/receipt boundaries. It does not claim that a newly created blank tournament is prepared, playable, activated, or fully configured.
