# Phase 1 instrumentation review

## Conclusion

Independent comparison against exact Release 139 commit `b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6` found **no concrete authorization, canonical-operation, public-response, cache-policy or privacy regression** in the reviewed instrumentation. This is a source and local-test conclusion for the current uncommitted Phase 1 working tree. It is not hosted or Production proof.

The instrumentation establishes request-local state before the existing handler runs. It does not authorize a request, read its body, or move any authorization check. Existing handlers still choose the response status, body, cookies, ETag, `Vary` and `Cache-Control`. The wrapper adds a UUID `X-Request-ID` only to non-shared responses. A response whose standard `Cache-Control` contains `public` or `s-maxage` keeps its headers unchanged and omits the attempt ID; the current shared tournament-live route is covered by a focused test. Mobile `private, no-cache` conditional responses retain their ETag/304 behavior, and mobile scoring retains `private, no-store`, `Pragma`, `Vary` and `nosniff`.

Eight existing RPC transport sites replace their inline `fetch` plus single JSON decode with `observedJsonRpc`. Each still makes one request with the same URL, method, authorization headers, serialized body, `no-store` policy and abort signal, then decodes the response once. The wrapper adds only a bounded request ID header while a request scope exists. It preserves the original response and payload for the existing adapter-specific error mapping and rethrows transport exceptions unchanged. `57014` and connection SQLSTATE values are retained in the RPC event; application-facing errors remain mapped by the same adapter and route code. Lost or gateway responses to mutations are classified `UNKNOWN`, never inferred as rollback.

No new SQL, database call, authority lookup, retry, network exporter or canonical write was found. Authority metadata is copied only after an existing trusted authority result. Phase timing wraps existing authorization, context, calculation and post-commit calls. The default sink writes fixed-shape JSON to the existing process console, catches sink failure and caps a request at 64 events. Numeric hosted overhead, log delivery and provider retention remain unproven.

The event builder admits only static route/domain/family labels, bounded operational identifiers, integer revisions/counts, typed codes, SQLSTATE and fixed-length fingerprints. It excludes URLs, query strings, request/response bodies, SQL, headers, credentials, exception messages and stacks. Operation, mutation, job and match IDs remain restricted operational data and still require access-controlled retention. Existing non-telemetry `console.error` calls may include messages or stacks; they predate this change and are outside the event allowlist.

## Historical byte-freeze failures

Six failures in the broad suite are obsolete whole-source or allowed-path freezes for this additive instrumentation scope. They remain useful historical provenance and were **not changed or removed**. Their failure alone is not evidence of changed request behavior:

| Historical check | Why it fails this scope | Behavioral evidence used instead |
|---|---|---|
| `current Calcutta candidate preserves every runtime blob except the exact approved analytics identity update` | Rejects any new runtime file, including `lib/operational-rpc-contract.js` | Explicit RPC-catalog coverage and Calcutta route/adapter tests |
| `Release 133 runtime is byte-preserved except the authorized additive recovery SQL` | Pins the full Release 133 runtime and rejects the instrumented Calcutta route | Release 139-to-candidate transport and route behavior checks |
| `Clear scope remains limited to Calcutta; other Director and participant files unchanged from Release 132` | Uses a Release 132 path allowlist that intentionally excludes Phase 1 routes | Current authorization and application regression suites |
| `Release 134 application, guards, Calcutta, Odds and participant runtime remain byte-identical` | Pins all Release 134 blobs | Current RPC/error/outcome and broad regression suites |
| `PN-1 preserves Production authority, dispatch, fencing, scoring and post-commit implementations byte-for-byte` | Pins post-commit and authority implementation bytes | Release 139 equivalence checks for post-commit order/results and mobile scoring route order/responses |
| `PN-2 web/PWA, Production authority, Preview safeguards and canonical persistence are unchanged` | Pins current-runtime and scoring-operation implementation bytes | Release 139 equivalence checks for authority inputs, dispatch order, transport, payload and errors |

The paired application run still remains non-green: candidate and baseline each have 26 failures. There are no candidate-only failure names, but the six checks above have different first mismatches. They must not be counted as passing. They are classified as obsolete byte-freeze assertions for this reviewed change, while semantic coverage comes from current behavior tests.

The focused instrumentation run passed **27/27**: event schema and privacy, explicit RPC mutation classification, `401`/`403`/`503` response classification, shared-cache preservation, SQLSTATE, unknown outcome handling, sink failure, event bounds and five direct Release 139/candidate equivalence checks. TAP SHA-256: `9360a24e272a21a0ad497205568e83cfb818cefadf76a4467964f3016d522625`. The broader paired evidence is recorded in [REGRESSION-NOTES.md](./REGRESSION-NOTES.md) and [REGRESSION-RESULTS.json](./REGRESSION-RESULTS.json).

## Scoped claimed-job correlation addendum

After the initial review, `observedJsonRpc` added one bounded association for successful job claims. It passes `payload.job` through the existing `operationMetadata` allowlist, copies only a valid `job_id`, and places that identifier in request-local context only when the RPC is classified as a mutation, the HTTP response is successful, and `payload.ok === true`. The response and decoded payload returned to application code are unchanged. No job payload, claim token, calculation input, header, URL or arbitrary attribute is emitted.

This does not change outcome classification or claim semantics. Failed, missing-body and transport-lost mutations still cannot establish `COMMITTED`; a successful acknowledgement still is not described as an independent readback. The propagated ID lets later calculation and completion phase events in the same AsyncLocalStorage scope share the job identity. Source inspection found no authorization, cache, SQL, payload, or request-count change in this addendum.

The focused `OBS-018` test passed **1/1**. It proves safe `payload.job.job_id` propagation into a later calculation phase and proves that a sibling private job field and its value are absent from all emitted events. The independent RPC allowlist review also passed **1/1**, confirming that the claim families remain explicitly classified as mutations. Both tests use local mocked transports; an actual side-game worker plus database claim is outside this scoped proof.

## Exact source scope

Reviewed 48 instrumentation files: 34 changed route files, 12 changed shared/server modules, and two new telemetry modules.

Route files:

- `app/api/admin/production-calcutta-v1/route.js`
- `app/api/admin/production-net-skins-v1/route.js`
- `app/api/admin/production-odds-calculations/route.js`
- `app/api/director/net-skins-entries/route.js`
- `app/api/director/odds-publication/route.js`
- `app/api/director/production-overview/route.js`
- `app/api/director/round-scoring/route.js`
- `app/api/director/tournament-setup/route.js`
- `app/api/leaderboards/calcutta/route.js`
- `app/api/leaderboards/core/route.js`
- `app/api/leaderboards/net-skins/route.js`
- `app/api/live-matches/route.js`
- `app/api/live/route.js`
- `app/api/mobile/v1/calcutta/route.js`
- `app/api/mobile/v1/health/route.js`
- `app/api/mobile/v1/leaders/route.js`
- `app/api/mobile/v1/matches/[matchId]/route.js`
- `app/api/mobile/v1/matches/route.js`
- `app/api/mobile/v1/net-skins/route.js`
- `app/api/mobile/v1/odds/route.js`
- `app/api/mobile/v1/scoring/current/route.js`
- `app/api/mobile/v1/scoring/finalize/route.js`
- `app/api/mobile/v1/scoring/hole/route.js`
- `app/api/mobile/v1/session/route.js`
- `app/api/mobile/v1/today/route.js`
- `app/api/odds/calculations/route.js`
- `app/api/odds/inputs/route.js`
- `app/api/odds/publication-operations/route.js`
- `app/api/odds/publish/route.js`
- `app/api/scoring/current/route.js`
- `app/api/scoring/matches/[matchId]/route.js`
- `app/api/scoring/matches/route.js`
- `app/api/scoring/session/route.js`
- `app/api/tournament/live/route.js`

Shared and server modules:

- `lib/mobile-v1-route.js`
- `lib/mobile-v1-scoring-post-commit.js`
- `lib/mobile-v1-scoring-route.js`
- `lib/operational-rpc-contract.js`
- `lib/operational-telemetry.js`
- `lib/production-calcutta-server.js`
- `lib/production-current-tournament-runtime.js`
- `lib/production-net-skins-server.js`
- `lib/production-odds-calculation-server.js`
- `lib/production-scoring-operations-server.js`
- `lib/production-tournament-setup-server.js`
- `lib/scoring-mutation-authority-server.js`
- `lib/scoring-persistence-adapter.js`
- `lib/scoring-shadow.js`

`lib/reliability-diagnostic-policy.js` is the only other new `app/` or `lib/` file relative to Release 139. It was also inspected, but it is not application instrumentation: only local tools/tests import it, so it adds no deployed route, query or authorization path.

## Limits and residual risks

- This review did not query Production, staging, a provider account or a live database. Deployed environment bindings, console retention, access policy, exporter behavior and cache/CDN configuration remain unknown.
- Shared-cache suppression currently recognizes standard `Cache-Control: public` and `s-maxage`. Current covered shared responses use that header. A future route relying only on a provider-specific CDN header needs a corresponding test before instrumentation.
- The default sink is synchronous `console.info`. Failures are contained and event count is bounded, but a future custom synchronous sink could block the event loop. No custom sink is configured here.
- RPC timing measures transport plus JSON decode, not pure database execution. Request events can preserve an adapter's public error while the earlier RPC event carries the original SQLSTATE; consumers must use the RPC event for database classification.
- Real post-commit dependencies are async and preserve settled order/results in the equivalence test. Wrapping them in an async timing function would convert a hypothetical synchronous throw into a rejected settled entry; no real dependency in the reviewed fan-out throws synchronously by signature, but that artificial case is not separately certified.
- The 45 PostgreSQL integration files, physical native behavior, hosted cache hits, provider logs and numeric production overhead are covered by separate evidence or remain open; they are not proven by this review.

## Feature-branch push convention

The current branch is `codex/reliability-phase1` and has no upstream. Repository history contains many `codex/*` branches tracking same-named `origin/codex/*` branches. `README.md` states that committing to `main` triggers the automatic Vercel deployment. No tracked GitHub Actions workflow or `.vercel` project metadata is present, and `vercel.json` only defines the account-deletion cron schedule.

On repository evidence, pushing the same-named `codex/reliability-phase1` feature branch is a normal non-`main` branch publication and does not itself select the documented Production deployment path. An external Vercel/GitHub integration may still create a Preview deployment for branch pushes; that account configuration was not read, so Preview creation is **UNKNOWN**. A feature-branch push must not be described as “no deployment,” but it is non-Production under the documented branch convention. No push was performed during this review.
