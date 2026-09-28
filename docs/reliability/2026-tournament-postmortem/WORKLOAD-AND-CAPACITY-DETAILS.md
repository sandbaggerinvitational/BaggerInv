# Workload and capacity details

## Decision frame

The next design should remain small and explicit: one scoring primary, one bounded application path, short-lived public projections, one transactional outbox, and a separate place for history/analytics. The known competitive population is 24 golfers. Spectator concurrency, refresh rate, and geographic distribution are unknown, so they must be measured before selecting a capacity tier or claiming a safe audience size.

The 2026 evidence supports three conclusions with high confidence:

- score writes and authority reads need reserved capacity and cannot share an unbounded queue with public/history traffic;
- a broad historical read and a synchronous derived-state query shape were materially expensive, but neither proves a provider-caused September 26 outage;
- two sequential physical requests and a later point-in-time resource snapshot are not percentiles, saturation tests, or capacity certification.

All numeric thresholds and cache ages below are **PROVISIONAL** unless marked as a safety invariant or **BASELINE REQUIRED**.

## Simple target architecture

```text
participant/native/PWA ──> Vercel current API ──> Supabase Data API/pool ──> Postgres primary
       │                        │                         │                       │
       │                        │                         │                 canonical score
       │                        │                         │                 + receipt/audit
       │                        │                         │                 + small outbox
       │                        │                         │                       │
       │                        │                         └──────────────> one bounded worker
       │                        │                                                 │
       │                        └──────── private ETag/current reads       derived snapshot
       │
spectator browser ─────> cached public projection/snapshot ──────────────> bounded current views

history/export/certification ──> separate credential ──> read replica or restored copy
diagnostics ───────────────────> read-only current views; pool 1; one in flight; short timeout
metrics/logs/traces ───────────> independently retained evidence and alert store
```

No cache, replica, or background worker can authorize a score. Mutation admission always rechecks canonical authority and expected revisions.

## Cache semantics

Use four named policies so “cached” does not hide freshness or authority:

1. **AUTHORITATIVE_CURRENT:** private, `no-store` or conditional `no-cache`; every mutation and sensitive session read revalidates canonical state. A device may retain last displayed data for continuity, but labels it offline/stale and never uses it as authority.
2. **CURRENT_PROJECTION:** public or non-authoritative current data with a short fresh window and bounded stale-while-revalidate window. Every response carries source revision and `observedAt`; stale content shows its age.
3. **REVISION_IMMUTABLE:** content addressed by tournament/year/publication/revision. Once closed, it may receive a long public cache lifetime because a correction creates a new revision/URL or purges the exact key.
4. **PRIVATE_CONDITIONAL:** participant-specific read with `Vary: Authorization` or the applicable certification/session key and an ETag. It may avoid sending an unchanged body after revalidation; it is never shared across users.

The inspected candidate currently marks mobile v1 read responses `private, no-cache` and supports ETag/304. Score/session/auth/health responses are no-store. The spectator HTTP routes are no-store, while the in-process public reader coalesces requests and caches leaders, matches, current-year history and match detail for 15 seconds, and archive/past history for 60 seconds. That process-local cache is bounded by entry count and bytes, but it is neither a shared CDN cache nor durable across cold starts. These are source observations, not a guarantee about the deployed account.

## Read-class caching matrix

| Read class | Audience | Semantic type | Proposed policy | Invalidation and degraded behavior |
|---|---|---|---|---|
| Health, scoring admission, authority generation, maintenance state | participant/operator | authoritative current | `no-store`; no SWR | Re-read every operation/probe. Fail closed. A cached health snapshot may inform humans only and must show revision/time. |
| Auth session, OTP state, participant identity, access/lease | participant | private security state | `private, no-store` | Invalidate on sign-in/out, certification, role/access or authority revision. Email/SMS failure offers the other verified path; it never fabricates a session. |
| Current scorecard and mutation readback | scorer/Director | authoritative current | `private, no-store`; ETag only for a distinct read endpoint if canonical revalidation still occurs | Invalidate on hole/match revision. Offline display is read-only and visibly stale. Mutation confirmation requires receipt/canonical readback. |
| Today/current-round composition | participant | private current projection plus identity-bound actions | `PRIVATE_CONDITIONAL`; target 5–15 s client revalidation, no shared cache | ETag includes current tournament, authority, identity/access and component revisions. Keep usable prior content during refresh; do not expose stale actions. |
| My Match, match list and match detail | participant | private current | `PRIVATE_CONDITIONAL`; target 5–15 s revalidation | Invalidate on score, pairing, lifecycle, permission or navigation revision. Deduplicate concurrent identical loads per instance. |
| Leaders/current golf standings | participant | current projection | private ETag; target 5–15 s | Invalidate on canonical score/match result. Prior projection may display with age but cannot certify final status. |
| Public leaders/current standings | spectator | current projection | fresh 5–15 s, SWR up to 30–60 s; bounded last-known-good during incident | Invalidate/publish from score outbox. Show `observedAt`; reduce refresh before origin overload. Values are proposed and require load testing. |
| Public matches and match detail | spectator | current projection | fresh 5–15 s, SWR up to 30–60 s | Key by tournament/match/revision. A stale view is allowed only with age and never changes scoring authority. |
| Public Today aggregate | spectator | composite current projection | one coalesced snapshot, fresh 5–15 s, SWR up to 30–60 s | Build from bounded current projections. Avoid independent fan-out from every spectator. Preserve last-known-good if one optional dependency fails. |
| Calcutta, Net Skins and Odds calculated/current eligible projection | authorized participant/Director | visibility-sensitive derived state | `PRIVATE_CONDITIONAL`, 5–15 s revalidation | Key by calculation/input fingerprint and visibility. Target calculation availability within the worker freshness budget; never imply that calculation authorizes publication. |
| Calcutta, Net Skins and Odds public result | spectator | owner-confirmed derived publication | fresh 15–30 s, SWR up to 60–120 s | Only a published revision is cacheable. Fingerprint mismatch or unpublish purges/hides immediately. Owner review/publication time is excluded from the worker freshness SLO; show publication state and age separately. |
| Schedule and published tournament guide | participant/public | revisioned configuration | immutable by published revision; current alias revalidates in 60 s | A new publication gets a new revision. Emergency correction invalidates the alias and exact affected object. |
| Portrait policy and private profile/Passport identity | participant | privacy/security state | `private, no-store` for policy and private identity; conditional current stats | Portrait policy revalidates on every response. Do not put identity or private profile data in public caches. |
| Public player/career profile | spectator | mixed current plus historical | current tournament portion 15–60 s; completed career facts by immutable revision; portrait policy fresh each response | Split current and immutable components so privacy revocation is immediate without recomputing all history. Current inspected public player path does not provide a shared durable cache. |
| Current-year history/records | participant/public | current projection while tournament open | 15–60 s with explicit current-year revision and age | Route current-year reads to bounded projection; do not scan raw history on the primary. |
| Completed-year history, archive and records | participant/public | revision immutable | long cache by year/revision; proposed 1 h browser/edge and longer object retention after closure | Corrections publish a new revision. Serve from replica/restored/materialized archive; never fall back to an unbounded primary scan. Exact TTL is owner/correction-policy dependent. |
| Director current controls and preflight | Director | authoritative/private | `private, no-store` or exact ETag followed by canonical precondition on mutation | Never allow a cached GO/Finalize/Reopen eligibility decision to authorize the operation. |

The ages are starting guardrails. Ratify them from update cadence, correctness semantics, physical time-to-usable tests, origin reduction, and owner tolerance for visible staleness. Cache keys must include tournament and revision; private keys also include the safe identity/capability partition. Never key on raw bearer tokens.

## Request coalescing and invalidation

- Coalesce only identical reads inside one bounded process/region, and cap pending keys, object bytes, and total cache bytes.
- Publish invalidation after the canonical transaction through the transactional outbox. A failed worker leaves a measurable stale projection; it cannot roll back a score.
- Stamp every projection with source revision, input fingerprint and observed time. A consumer rejects a revision regression.
- Prefer versioned immutable objects for completed history and guide content. Use purge/invalidation only for the small current alias.
- Do not add Redis solely to reproduce a 15-second in-process cache. Add a shared cache only if measured multi-instance origin duplication remains a capacity problem and invalidation semantics pass failure tests.

## Workload priority and admission

| Priority | Work | Admission |
|---|---|---|
| P0 | authority, score commit, same-ID recovery, Director safety controls | reserved capacity; bounded queue; fail closed on authority uncertainty; never blind retry |
| P1 | participant current scorecard, identity needed for play, canonical confirmation | reserve with P0; deduplicate identical reads; bounded per-user/per-match concurrency |
| P2 | public current projections and current participant noncritical reads | token bucket plus cache/coalescing; shed refresh before origin saturation; last-known-good allowed with age |
| P3 | outbox consumers and side-game derivation/publication | worker concurrency 1 initially; bounded batch; pause on database yellow/red; idempotent retry only |
| P4 | completed history, export, certification and broad reconciliation | denied on tournament primary; separate read target only |
| P5 | analytics, AI analysis, bulk maintenance, noncritical cron | disabled or scheduled outside active rounds |

Admission limits operate before the database becomes the queue. Reject excess lower-priority demand with a bounded response and retry guidance; do not let thousands of Vercel invocations wait on the pool. A circuit breaker may reduce spectator refresh or pause a worker. It may not switch writer authority, replay a score, restart/resize, restore, or deploy.

## Circuit breakers and backpressure

Use one state per dependency/workload class: CLOSED (normal), OPEN (bounded fast failure or snapshot), and HALF-OPEN (one controlled probe). Trip on ratified error/timeout/resource conditions, not raw HTTP status alone. Add hysteresis so a flapping database or worker cannot produce a retry storm.

### Backpressure

- P0/P1 database acquisition uses a small bounded wait and then an explicit unavailable/unknown response; interactive score writes never queue indefinitely.
- P2 public origin misses use a concurrency semaphore and token bucket. When full, serve an age-labeled snapshot or 429/503 with bounded retry guidance.
- P3 workers start at concurrency 1, use bounded batches and retry only classified idempotent failures; red database state pauses consumption.
- P4/P5 are denied or circuit-open on the primary throughout Tournament Mode.
- Recovery probes are single-flight and do not reopen normal traffic until the configured healthy window passes.

Exact queue depths, rates and breaker windows are **BASELINE REQUIRED**. The current deployed breaker/backpressure behavior was not empirically established by this audit.

## Automated spectator load

The non-Production harness should create deterministic clients across public Today, leaders, matches, match detail, player, current side-game publication and archive classes. It steps concurrency and refresh distributions, varies cold/warm/cache state and region/network latency, and records cache hit, origin requests, payload, TTFB, total latency, database time/connections and resource knees.

Run the harness only against an isolated Production-shaped environment or expressly approved load target. It must refuse a Production hostname/project, use no participant credentials, and stop on canonical integrity, shared-provider impact or telemetry loss. Spectator concurrency remains **UNKNOWN** until this harness and real privacy-safe demand telemetry provide a baseline.

## Connection budget

Define `C_safe` as the maximum concurrent database work proven safe by two full rehearsals on the selected compute, disk and pool configuration. It is not the provider's advertised connection maximum and is not the later 26/90 point observation.

Proposed allocation of `C_safe`:

- at least 50% reserved for combined P0/P1, with scoring writes ahead of participant reads;
- no more than 25% for P2 origin misses;
- no more than 10% for P3 workers;
- exactly one diagnostic connection and one in-flight statement;
- one separately authorized operational connection when required;
- at least 15% unallocated recovery/headroom after accounting for fixed diagnostic/operational slots.

These percentages are **PROVISIONAL**. If `C_safe` is too small to express them, use fixed slots that always preserve P0/P1 and headroom. Provider-side transaction pooling is appropriate for short-lived serverless clients where compatible, but the current HTTPS Data API path and actual Supabase pool settings must be verified. Supabase documentation observed on 2026-09-27 describes server-side transaction pooling and separate client/backend limits; it does not establish this account's mode or limits. [Supabase pooling and limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)

## External dependency map

| Dependency | Used for | Tournament criticality | Required behavior/evidence |
|---|---|---|---|
| Vercel Functions, routing, DNS/TLS and cron | API/runtime and scheduled jobs | P0/P1 for API; cron varies | Record regions/deployment/release and invocation health. Pause noncritical cron. Exact DNS/control-plane provider configuration is unknown. |
| Supabase Data API/PostgREST and PostgreSQL | authority, reads, canonical transactions | P0 | Component timing, pool/login/query evidence, backups/PITR, current configuration and provider events retained. |
| Supabase Auth | email/phone OTP and sessions | P1 when a golfer needs to authenticate | Existing valid sessions should not depend on a new delivery. Delivery failure offers a safe alternate method and Director process. |
| Email OTP delivery | participant sign-in | P1 for new/expired session | Actual SMTP/delivery provider, quotas, region, logs, suppression/bounce policy and support path are **UNKNOWN**. Inventory and rehearse; do not claim Supabase alone proves delivery. |
| SMS OTP delivery and provider hook | optional participant sign-in/enrollment | P1 when selected; email fallback exists | Code uses Supabase Auth phone flows and an approved hook, but the downstream SMS vendor/account, quotas, trial restrictions and delivery telemetry are **UNKNOWN**. |
| CAPTCHA/anti-abuse provider | public OTP request protection | P1 for new auth | Provider/configuration and outage behavior are **UNKNOWN**. Preserve rate limits and a Director-mediated fallback; never disable abuse controls silently. |
| Google Sheets API, Drive API and OAuth token service | legacy source, exports, guide/archive/mirror workflows | P4/P5 during active play if Supabase is authoritative | Keep out of score commit; bounded outbox retry; no live primary fallback. Exact remaining Production authority per domain must be inventoried. |
| Web Push and browser/OS push services | optional notifications | P4 | Best effort only. Delivery failure does not block scoring or change lifecycle. Actual push endpoints/coverage and APNs-specific native path are **UNKNOWN**. |
| OpenAI API | draft/captain analysis tools | P5 | Disable during Tournament Mode; no critical path or authoritative result. |
| Vercel Analytics | product analytics | P5 | Failure is noncritical and must not add synchronous database work. |
| App distribution/signing services | installed native availability | pre-event P0 gate, not per-score dependency | Freeze a certified build and retain signing/review evidence. Existing installed client must not depend on store availability during a round. |
| Monitoring/alert/evidence destination | incident detection and proof | P0 operational control | Independent failure path, missing-data alert and out-of-band paging. Exact vendor/integrations are **BASELINE REQUIRED**. |

## Capacity forecast

Use workload equations and measured amplification:

- canonical gross-score inputs scale approximately with `golfers × tournament holes`: 24 × 54 = 1,296 golfer-hole inputs for the known three-round event before corrections/audit;
- match/hole projections, receipts, audit, outbox and derived revisions multiply that base. Measure the actual multiplier from the synthetic tournament rather than assume it;
- score write rate is driven by clustered hole completion and recovery, not the total row count;
- spectator origin load is approximately `concurrent spectators × visible components ÷ refresh interval × cache-miss rate`; this is the largest unknown;
- history and side-game planning cost can grow faster than canonical score count when queries aggregate every revision/result. The exported 2026 fixtures included tens-of-megabytes side-game JSON payloads, demonstrating amplification risk without proving incident causation.

Test current, 2×, 5× and 10× retained-history sizes with the same 24-golfer event cadence, plus stepped spectator concurrency until the first latency/resource knee. Record rows, bytes, indexes, plan/execute time, block/temp/WAL counters, connections, cache state and sample distributions.

## Retention and partition decision

Retain canonical Official scores, revisions, receipts and audit according to an owner-approved competitive/legal record policy; the exact duration is **BASELINE REQUIRED**. Keep idempotency material long enough to cover all supported retries, reconciliation and post-event review. Retain raw telemetry through the event/postmortem window and summarized yearly evidence longer under privacy/cost policy. Public caches are disposable; a cache is never the system of record.

Do **not** introduce PostgreSQL table partitioning yet. The known canonical score cardinality is small, and the proven performance defect came from query shape and synchronous historical work rather than demonstrated table-size/vacuum limits. First:

1. isolate history by role and database target;
2. add/select the bounded current views and indexes;
3. materialize/version completed public archives;
4. enforce retention for ephemeral jobs, attempts and telemetry;
5. benchmark 2×/5×/10× accumulated history.

Open a partitioning design only if those tests show a table/index/vacuum/retention limit that partition pruning solves, and prove cross-partition uniqueness, foreign keys, RLS, migrations, backup/restore and correction queries. Year partitioning that still executes a whole-history aggregate is not a fix.

Supabase documents asynchronous read replicas for read-only traffic and notes that some integrated services remain primary-bound. Use a replica or restored copy only for explicitly stale-tolerant history/analytics, with lag monitoring and no primary fallback. Documentation observed on 2026-09-27; account availability/configuration is unknown. [Supabase read replicas](https://supabase.com/docs/guides/platform/read-replicas)

## Provisional resource guardrails

| Signal | Green | Yellow | Red | Status/rationale |
|---|---|---|---|---|
| Disk I/O budget consumed | <1% | 1% to <50%, or adverse depletion projection | >=50% during event, projected exhaustion before close, provider warning with corroborating impact | **PROVISIONAL**; provider says >1% exceeded baseline and 100% is exhausted, while 50% is a conservative event guardrail |
| CPU | below 70% | >=70% for 5 min | >=85% for 5 min or P0/P1 impairment | **PROVISIONAL**; validate at the measured saturation knee |
| Available memory | >=30% and no swap | 15% to <30% | <15%, swap/OOM/restart, or P0/P1 impairment | **PROVISIONAL**; provider metric semantics must be verified |
| Connection use versus `C_safe` | <=60% | >60% to 75% | >75%, pool rejection/login failure or P0/P1 acquisition failure | **PROVISIONAL**; preserves recovery reserve and uses tested safe concurrency, not advertised max |
| Pool acquisition | p95 <=100 ms | p95 100–500 ms | rejection/login failure or p95 >500 ms | **PROVISIONAL**; no 2026 pool-wait baseline |
| IOPS/throughput/latency/I/O wait | inside measured green envelope | approved warning envelope | approved red envelope or correlated P0/P1 impairment | **BASELINE REQUIRED**; actual incident series was unavailable |
| Score-path temp spill | zero | not applicable | any unexpected spill | **SAFETY INVARIANT** for the bounded scoring plan |
| Diagnostic concurrency | one connection, one in flight | denied excess attempt | successful excess/write/history access | **SAFETY INVARIANT** |
| Historical query on primary | zero | denied attempt | successful execution | **SAFETY INVARIANT** |
| Score result integrity | receipt/canonical agreement; zero unresolved unknown outcomes or duplicates | transient lost response is red while same-ID recovery runs | unresolved unknown, duplicate or mismatch | **SAFETY INVARIANT**; qualification deliberately injects transient unknowns and must resolve them safely |

Do not automatically resize/restart from these thresholds. Yellow and red first control admission and preserve evidence; a human uses the emergency-change protocol for provider changes.

Supabase documents that smaller compute sizes can depend on a daily Disk I/O burst budget and that effective IOPS/throughput is constrained by both compute and storage. Documentation observed on 2026-09-27; the current Production budget and selected compute are unknown. [Supabase compute and disk](https://supabase.com/docs/guides/platform/compute-and-disk)

Vercel recommends placing Functions near the data source. Record both regions and measure the network phase before changing placement; multi-region execution can increase database concurrency. Documentation observed on 2026-09-27. [Vercel Function regions](https://vercel.com/docs/functions/configuring-functions/region)

## Overengineering risks

- **Premature AWS migration:** moves the same SQL and operational gaps while adding network, proxy, IAM, backup and failover work.
- **Too many cache layers:** process, edge, device and database caches with different keys can create revision regression and privacy leaks. Use the four named policies and one source revision.
- **Partitioning small tables:** adds migration, uniqueness, RLS and restore complexity without addressing bad query shape.
- **Replica as universal fallback:** asynchronous lag and service-routing limits make it unsuitable for authority or score confirmation.
- **Message-broker platform before need:** a transactional outbox plus one bounded worker is enough until measured queue volume or delivery requirements prove otherwise.
- **Multi-region functions by default:** can multiply pool clients and make single-writer/database locality harder.
- **Observability vendor sprawl:** first retain a small correlation envelope, core database metrics, query stats and evidence packets; add tooling only for a demonstrated proof gap.
- **Automated remediation from uncalibrated thresholds:** false positives can shed valid traffic or create change during play. Automate only reversible, preapproved admission controls.
- **Caching private/authority data for speed:** a cache hit is not an authorization check and cannot confirm a score.
- **Designing for an imagined mass audience:** measure spectators and grow from the 24-golfer workload; preserve a simple operating model that the event team can rehearse.

## Acceptance before Tournament Mode

- every row in the cache matrix has an implemented header/key/invalidation/staleness test;
- no private response is shared, no revision regresses, and cached content cannot authorize a mutation;
- P0/P1 meet ratified latency/correctness budgets through two event-shaped rehearsals;
- stepped spectator load demonstrates a safe admitted target and graceful cached degradation;
- role and connection budgets shed P2-P5 before P0/P1 pool acquisition fails;
- 2×/5×/10× history never turns the scoring path into history work;
- email, SMS, CAPTCHA, push, Google and monitoring dependencies have named owners, observed failure behavior and safe criticality classification;
- retention, archive and partition decisions are approved with measured evidence;
- all resource thresholds are ratified or remain explicit Tournament blockers.
