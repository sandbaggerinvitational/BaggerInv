# Operational telemetry — Phase 1, version 1

Implements the foundation of [OBS-CORE-001](../2026-tournament-postmortem/REQUIREMENTS.md). This is source and local runtime evidence; it is not a deployed monitoring service or a tournament-readiness claim.

## Identity and propagation

`X-Request-ID` is a UUID identifying a single network attempt. A valid incoming UUID is preserved; an absent, malformed, oversized or non-UUID value is replaced by a cryptographically generated UUID. `request_id` and `correlation_id` intentionally name the same attempt. They are not authentication and never authorize work.

An outer route establishes an AsyncLocalStorage scope. Selected backend RPC transports forward `x-request-id` to PostgREST and log the same ID. Private/non-shared API responses return `X-Request-ID`. Shared-cache responses (`public` or `s-maxage`) deliberately omit it so a cached response cannot reuse another attempt's ID; those routes have origin-execution telemetry only, and cache hits do not execute this instrumentation. Cache policy is unchanged. An existing PWA, Director or native client may supply the header; other requests receive a server-generated attempt ID. Native source is unchanged. No claim is made that Build 10 retains this response header in its local queue.

Existing `mutation_key`/`clientMutationId`, round `operation_id` and job IDs are preserved byte-for-byte in the operation payload. A retry can have a new request ID while retaining the same mutation or operation ID. Telemetry never manufactures a replacement idempotency key. Database association uses the existing immutable receipt/mutation key recorded alongside the request ID; it does not add columns, alter RPC parameters or claim that an HTTP header automatically appears in PostgreSQL statement logs.

No extra authority or monitoring query is issued. Release and activation come from explicitly configured deployment metadata or an already successful authority read, with their provenance. SHA comes from `VERCEL_GIT_COMMIT_SHA` or a validated scoring-authority response. Missing values are **null / UNAVAILABLE**. A later instrumentation deployment must bind `BAGGER_TELEMETRY_RELEASE_ID` and `BAGGER_TELEMETRY_ACTIVATION_REVISION` to the protected release receipt and verify those bindings. This task has not configured Production. Compatible activation changes must refresh that binding; an observed authority revision supersedes the configured value within the request. A configured value is not a fresh database assertion.

## Schema and privacy

Machine contract: [OPERATIONAL-EVENT-SCHEMA.json](OPERATIONAL-EVENT-SCHEMA.json). All keys are present; nullable fields explicitly represent unavailable evidence.

| Field | Type | Required | Privacy / example | Meaning |
|---|---|---|---|---|
| schema_version | integer | yes | public, `1` | Contract version |
| timestamp | ISO UTC string | yes | operational | Emission time, not commit time |
| event | enum | yes | operational, `RPC` | REQUEST, PHASE, RPC, DOMAIN_ERROR, OUTCOME |
| request_id / correlation_id | UUID | yes | non-secret attempt identifier | Same attempt across handler/transport/response |
| route | static route template | yes | public, `/api/scoring/matches/[matchId]` | Never raw URL or query string |
| domain / feature | enums / static name | yes | operational, SCORING | Independent capability failure domain |
| release / activation | integer or null | yes | operational, 139 / 238 in synthetic tests only | Observed or configured identity |
| release_source / activation_source | enum | yes | operational | UNAVAILABLE, DEPLOYMENT_CONFIG, AUTHORITY_READ |
| sha | 40 hex characters or null | yes | operational | Handling deployment source |
| operation_id / mutation_id / job_id | bounded identifier or null | yes | restricted operational | Existing authority association, never credentials |
| match_id / round | identifier / integer or null | yes | restricted operational, `2026-R3-4` / 3 | Bounded current operation scope |
| target_count | integer or null | yes | operational | Observed target count; never guessed |
| authority_revision / authority_fingerprint | integer / hash or null | yes | restricted operational | Requested setup/review binding; not proof it is current |
| latency_ms | nonnegative number or null | yes | operational | Duration of the named span |
| http_status | integer or null | yes | operational | Observed transport/response status |
| query_family / phase | static bounded label or null | yes | operational | Known function family or measured phase, not SQL |
| outcome | enum | yes | operational | COMMITTED, NOT_COMMITTED, UNKNOWN, NOT_APPLICABLE, UNOBSERVED |
| error_class / domain_error_code / sqlstate | typed code or null | yes | operational | Typed failure; no exception message, stack or SQL parameters |
| canonical_readback | enum | yes | operational | VERIFIED, FAILED or NOT_OBSERVED; acknowledgement alone is NOT_OBSERVED |
| dropped_events | nonnegative integer | yes | operational | Events suppressed by per-request cap |

Domains: AUTH, AUTHORIZATION, SCORING, ROUND_CONTROL, TOURNAMENT_READ, NET_SKINS, CALCUTTA, ODDS, DIRECTOR, DATABASE, RELEASE_CONTROL. RPC records retain their owning domain and put database classification in `error_class`/`sqlstate`; a Calcutta timeout does not become a scoring-domain failure by inference.

An allowlist builds events; request bodies, SQL, full URLs, header maps, credentials, OTPs, passwords, email, phone, player names, gross arrays and arbitrary error messages are excluded. IDs are restricted in format and length. These operational identifiers still deserve access-controlled retention. Never pass an actor's email as an operation ID.

## Measurements and outcome limits

Coverage is explicit in [ROUTE-COVERAGE.json](ROUTE-COVERAGE.json): selected PWA/native-compatible reads, scoring, Director round/setup and side-game endpoints. Other routes are not implied covered. Existing Production scoring, setup, Net Skins, Calcutta and Odds RPC transports plus the shared scoring read transport are measured. Native authorization and existing PWA authorization timing, scoring-context reads, mutation-authority checks, Calcutta/Net Skins calculator phases and native post-commit tasks have separate spans. RPC function names distinguish queue, claim, completion, publication and current reads without logging payloads.

`rpc_transport` includes HTTP transit and JSON decoding. It is **not pure database duration**. Production SQL does not expose separate idempotency/context/stroke/net/match/audit timings; those remain unavailable in application events. The isolated benchmark supplies SQL timing and query plans where measurable. No SQL migration is introduced to pretend those measurements exist. PWA post-commit transports are observed where they use the instrumented adapters; not every derived helper has an individual CPU span.

A successful canonical score RPC acknowledgement and adapter acceptance records COMMITTED. An explicit RPC denial or structured PostgREST SQL error records NOT_COMMITTED for that single RPC transaction. Gateway errors, invalid/missing bodies and transport loss record UNKNOWN for a dispatched mutation. These are operational observations, not a replacement for the supported operation status/readback contract. An earlier independent RPC may already have committed. A request HTTP status alone is never used as proof of commit.

Mutation classification uses the explicit reviewed function contract in `lib/operational-rpc-contract.js`, not a name-prefix guess. Unclassified families and unresolved generic dispatchers emit UNOBSERVED. Known reads emit NOT_APPLICABLE. Each new RPC family must declare its read/mutation semantics and extend the contract test; null never means read-only.

SQLSTATE `57014` is DATABASE_TIMEOUT. Connection-class SQLSTATE, shutdown/recovery and too-many-connections codes, plus PostgREST connection errors, are DATABASE_UNAVAILABLE. A client AbortSignal timeout without SQLSTATE records a timeout of the database transport; it does **not** prove the database statement itself timed out. `AUTHORITY_INCOMPATIBLE` remains the existing user-facing code and is recorded as stale authority; instrumentation does not reinterpret it as proven schema incompatibility. Missing resource/pool metrics are unavailable, not healthy.

## Overhead and failure behavior

At most 64 fixed-shape events are emitted per request, reserving a request-summary slot. No new database query, network exporter, retry loop or unbounded telemetry queue is introduced. JSON console emission is the default sink; `BAGGER_OPERATIONAL_TELEMETRY_ENABLED=false` disables event emission while retaining request correlation. Throwing or rejected optional sinks are swallowed; neither can change score results. Sinks must remain nonblocking: arbitrary synchronous custom sink code can block Node and is outside this guarantee. Correctness-critical database audit writes remain unchanged and may still fail the transaction by design.

Post-commit work can inherit the request scope. The request summary measures the response path, not completion of all `after()` work. Event caps apply across both. Metrics backends and exporters are not installed in this phase. Console delivery durability, provider retention and alert delivery are not proven.

## Retention proposal — not deployed

- Hot operational telemetry: 14 days, restricted engineering access, enough to diagnose a delayed report.
- Tournament window: preserve T-7 through T+14 for 90 days, then retain incident-selected sanitized evidence for at least two annual cycles.
- Immutable competitive receipts follow existing audit retention; do not delete them merely because telemetry ages out.
- Approved postmortem/certification manifests and redacted evidence should remain durable in repository/release artifacts. Private raw logs belong in an access-controlled evidence store, not Git.

These are proposed retention requirements. Provider plan limits, cost and privacy review are still required.

## Future dashboard and alert contract

Aggregate by bounded route/domain/query family, release and activation. Show sample count, success/failure/unknown count, p50/p95/p99 only with adequate sample sizes, timeout class and last observation time. Never mix local benchmarks with Production. Do not label missing data GREEN.

Round state, readiness, permissions, leases and side-game pointers must come from current canonical authority or a separately designed current health snapshot, with `observedAt` and freshness. Phase 1 telemetry does not implement that snapshot. Provider CPU/memory/IOPS/throughput/I/O budget/pool pressure require provider metrics; **BASELINE REQUIRED**. Alert thresholds remain proposed until comparable capacity measurements exist. A canonical mismatch or unknown mutation deserves an exact-ID status check; optional-feature failures must not invalidate identity or trigger blind mutation retries.

## Proof

`test/reliability-observability.test.mjs` covers correlation, idempotency separation, SQL error classification, unknown outcomes, bounded emission, concurrency isolation and sink/privacy failure injection. `test/reliability-observability-api.test.mjs` exercises an actual native-compatible route and the actual scoring persistence adapter with a simulated RPC transport. This is not physical iPhone, hosted API or Production proof. See Phase 1 certification for executed results and performance evidence.

`test/reliability-correlation-postgres.integration.test.mjs` provides local SQL proof that a request ID is forwarded through the actual `withOperationalRoute` and `observedJsonRpc` implementation while the existing mutation ID is preserved into an exact `scoring_authority.score_mutations` receipt. It uses a clearly identified synthetic fetch bridge into one persistent transaction on the disposable Release 139 fixture, reads a bounded exact receipt before returning the response, and retries the same mutation under a new request ID to exercise the stored idempotent receipt. It passed in isolated PostgreSQL; the final collector records its fresh result. It does not exercise hosted transport, API authentication, durable or cross-session commit, and it does not equate a request ID with a mutation ID.
