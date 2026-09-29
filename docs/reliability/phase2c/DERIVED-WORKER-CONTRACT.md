# Derived worker contract

**Scope correction: P0-B remains PARTIAL.** The executed automatic-delivery evidence below covers Calcutta, Competition and Intelligence. It does not prove the separate Google reporting outbox or Finalize archive delivery. The missing reporting/export proof cannot be dismissed as a financial owner-approval wait. External-write admission and the legacy writer’s financial side effects require explicit review; see [Google/outbox inventory and unresolved semantics](GOOGLE-OUTBOX-GAP.md).
This candidate adds a supported process-lifetime polling loop. A child process started before a score commit must discover the committed durable demand without a manual flush, SQL call, request after-hook, or operator wake-up. Hosted scheduling and deployment remain NOT PROVEN; no Vercel or infrastructure configuration changes are authorized.

The loop rotates CALCUTTA, COMPETITION and INTELLIGENCE. A durably acknowledged per-family failure allows the others to continue; unavailable failure acknowledgement or a global runtime failure halts visibly as documented. The runner allocates a fresh in-memory ID for each poll and processor invocation; the adapter passes separate UUIDs to its three tick RPCs. The correlation limits below apply. It sleeps between bounded cycles and stops on an AbortSignal. Tick and worker SQL use a finite 5,000 ms statement timeout in isolated proof fixtures; scoring uses 1,000 ms. Timing evidence must report the actual settings.

| Family | Automatic authority | Completion boundary |
| --- | --- | --- |
| Calcutta | Existing post-score continuation, only with approved configuration and auction facts | Existing claim, unchanged full-net calculator and guarded completion, preserving existing approval and publication rules. |
| Competition | Existing internal prepared-content maintenance | Current canonical core and the unchanged calculators; existing source/claim completion guard. |
| Intelligence | Existing internal editorial maintenance | Current canonical inputs and already-published Odds. Final recap remains gated by existing final/publication authority. |
| Net Skins | Materialize committed demand only | Configuration and processing remain explicit owner-controlled actions. Pending processing is reported as WAITING_OWNER, not delivered or stranded automatic work. |
| Odds | No new authority | This worker does not calculate or publish Odds. |

`runScoreDerivedWorker({signal, intervalMs, tick, processors, emit, workerId, maximumCycles})` runs until stopped. The adapter invokes the service-only tick RPC separately for each explicit `materialization_family`, committing each transaction before the next. Its three calls each have a5s worker budget (up to15s sequential SQL budget per poll, plus transport/dispatch); scoring remains1s. A cancellation stops further family calls. `tick({workerId,operationId,signal})` returns strict `ok:true`, a current-runtime scope, bounded ready-family flags, aggregate materialization/terminal counts and Net Skins waiting-owner status. Processor functions receive the same scope and a fresh invocation ID. Logs contain allowlisted aggregate status/error classes, never financial payloads, credentials, participant records or claim tokens.

Existing append-only score-derived intents remain the durable demand. Their SUCCEEDED status means materialization, never proof of calculator/result completion. Score transactions do not write delivery-control rows. Existing jobs remain the calculation queues; worker-only metadata records due time, retry cycle and visible terminal state. Exact lease/source/generation checks remain authoritative. No deployment identity becomes a new pending-work eligibility key.

## Intent meaning and calculation inputs

An intent means that a particular canonical score transaction invalidated a derived family. Its match, source transaction, family and bounded `canonical_revision` identify the originating authority; they are provenance, not an alternate financial result or an instruction to restore an old score. Hole and match triggers in the same transaction coalesce only on `(tournament_id, match_id, source_transaction, family)` and merge their bounded provenance before commit. Later delivery changes status and attempt metadata without rewriting that originating provenance. A later score creates separate durable demand.

| Consumer | Input authority | Why an old intent cannot authorize stale output |
| --- | --- | --- |
| Calcutta | Current canonical golf, current approved configuration and auction authority; the intent identifies the cause of invalidation | Materialization creates current-source work. Existing claim, source, lease, generation and current-pointer checks reject a stale completion. Ownership, price and publication are not copied from an event or invented by the worker. |
| Net Skins | Current canonical golf and immutable approved round membership/configuration, when the owner invokes processing | An intent only materializes demand. Existing source/configuration and result guards decide whether the owner-authorized completion is current; automatic delivery does not approve or publish it. |
| Competition / Intelligence | Current canonical golf and supported current dependencies; Intelligence consumes already-published Odds where required | Score intents invalidate current projections. Claim/read validation and guarded completion reject or supersede work that no longer matches current authority. The event's older revision cannot overwrite a newer current pointer. |
| Odds | Existing Odds calculation/publication authority | There is no automatic Odds calculator or publisher in this runner. An old score intent grants neither authority. |

These are current-state invalidations, not immutable event-time calculation snapshots. Original financial facts remain in their canonical configuration/auction/result records. The stale-input, correction, supersession and late-writer tests establish the tested convergence behavior; they do not certify a new historical replay or financial reconstruction capability.

For the candidate-managed intent and calculation queues, retry policy permits at most five attempts per logical current-source work cycle; 40001, 40P01, 57014, connection-class 08xxx, lock-unavailable and expired-lease failures are transient. Delay grows exponentially with bounded jitter and a 300-second ceiling. Deterministic invalid input, missing function, security and lifecycle errors terminate visibly. A supported, authenticated, exact-identity requeue preserves prior attempts and requires the cause to be corrected. Queue administration is unavailable to participants. A new canonical source or explicit authorized requeue may start a new retry cycle; merely polling or restarting cannot reset the budget.

The final focused suites pass 54/20/10/5/16 on 124 `69821b9d98a585c0545e9b5e68968fa7c1a0cebf12e0ba9699c4590f5763bc48` with stable transitive provenance. [DERIVED-DELIVERY.md](DERIVED-DELIVERY.md) maps each family, four lock corrections, current five-index scope and proof limits. [RETRY-DEAD-LETTER.md](RETRY-DEAD-LETTER.md) specifies durable transitions and failure handling. Supported caller ordering is certified for the demonstrated graphs; arbitrary privileged reverse arrays and universal deadlock immunity are not claimed.

## Lease duration and heartbeat decision

Calcutta retains its explicit 60-second lease. Frozen 2026 Competition and Intelligence claims use `started_at` with the delivery tick’s 90-second fallback; annual claims carry an explicit deadline. The proof retains raw timestamps, the named lease model and the exact effective deadline. The runner adds no heartbeat or automatic extension. Materialization precedes claim and commits separately, so the three possible 5-second materialization calls do not hold a calculation lease.

In the current 54-test delivery artifact, the maximum interval from the preceding same-child timestamped runner event to a successful nonempty processor event is 122 ms: Calcutta 122 ms (28 observations), Competition 91 ms (34), Intelligence 105 ms (30). [The retained derivation](evidence/worker-lease-duration-diagnostic.json) binds the exact current input hash and records every span. These observed successful spans are below the respective 60/90/90-second leases, but are not direct lease-hold or worst-case bounds. They include dispatch/scheduling overhead; this is a local successful-invocation diagnostic, not a p95/p99, SQL percentile or hosted deadline. Failed/crashed/held late-writer cases have separate behavioral proofs. Google/archive delivery is outside this diagnostic.

The unchanged lease margin and bounded current-tournament calculations do not justify adding a heartbeat here. A 5-second SQL limit is not a CPU or whole-process deadline. Hosted latency, event-loop stalls, supervisor policy and provider disruption remain unproved. A future hosted rollout must measure total claimed-work duration; insufficient margin requires separately reviewed smaller chunks or exact-claim heartbeat, not silent lease inflation.

## Event hook and correlation limits

`emit(event)` is an optional notification callback. The supplied CLI writes JSON to stdout synchronously; the isolated child invokes the IPC send without awaiting delivery. The runner contains synchronous callback exceptions and consumes a returned Promise rejection without awaiting it. An asynchronous exporter is never awaited; the synchronous callback must return promptly. The tested thrown/rejected exporter failures do not change claim or retry execution. [The retained strict-Node counterexample](evidence/worker-emitter-counterexample.json) shows the former unhandled-rejection failure; [the same probe after correction](evidence/worker-emitter-after.json) completes both cycles. The final focused unit compares identical successful/retry execution under a normal sink, a synchronous throwing sink and an asynchronous rejecting sink. This proves the worker callback boundary, not installation or delivery reliability of a hosted exporter.

| Identifier | Actual location and proof |
| --- | --- |
| Local poll sequence | `cycle` in worker events, with `tickStartedAt` / `observedAt`; it is a local integer, not the RPC UUID |
| Tick RPC UUID | Three distinct `operation_id` values in adapter inputs; the existing operational RPC telemetry reads that field when its sink is enabled |
| Poll UUID | Shared `cycle_operation_id` in the three request bodies; explicitly captured by the local history fixture, but not retained by the SQL attempt ledger or emitted by the current telemetry allowlist |
| Durable work and attempt | Family, work identity, cycle, attempt, worker, runtime generation, origin/handling activation, release and processor contract in immutable SQL events |
| Calculator completion | Existing job/source/claim identities; Calcutta hashes its invocation UUID into the request fingerprint, while Competition/Intelligence retain their existing processor contracts |

The stdout tick/processed events do not contain operation UUIDs. No direct durable join from a stdout poll sequence to its three RPC events is certified. The local history fixture proves distinct RPC request identities and a shared poll identity, but that fixture is not a production logging installation. Logs remain limited to aggregate states and safe identifiers/classifications, with no financial payload or claim token.



## Complete durable-work inventory, including unclosed external delivery

| Durable class | Origin / required atomic authority | Consumer and admission | Proof now | Remaining capability |
|---|---|---|---|---|
| Calcutta intent/jobs | Canonical score transaction creates per-match/source-transaction demand | New loop, existing approved configuration/auction facts and current-source guards | Named54-suite actual local delivery/crash/retry proof | Hosted operation later; not all export classes |
| Net Skins intent/jobs | Canonical score transaction creates configured-round demand | Automatic materialization; financial process/publication remain owner controlled | SQL materialization, owner processor financial parity and lock proofs | Do not auto-process finances to clear owner wait |
| Competition intent and Competition/Intelligence jobs | Same canonical transaction invalidation | New loop with current runtime/source/generation guards | Named54-suite local proofs | Hosted supervisor/metrics later |
| Google score/control/lifecycle outbox | Existing canonical score/control/Finalize transaction appends event; exact revision/mutation uniqueness | Existing request after-hook/native post-commit drain; protected POST endpoint; SQL and env Google-write/worker admission | Atomicity/creation, annual claim/fail/ordering SQL, mocked JavaScript mapping/checkpoint tests | Autonomous actual-SQL+fake-sink process lifecycle; finite retry/terminal/exact requeue; admitted/disabled visibility; mirror-only financial-authority review |
| Finalized canonical scorecard snapshot | Actual Final transition captures immutable canonical snapshot and audit | Snapshot is canonical historical authority, not an external delivery worker | Existing canonical finalization/atomicity proof | Do not conflate stored snapshot with verified external archive |
| Scorecard archive job/checkpoint | Finalize/reopen snapshot transition creates archive/invalidation demand | Existing archive worker with explicit external-write admission and verification | Annual metadata/lease/retry SQL and existing source/unit tests | Full admitted external archive lifecycle proof or explicit supported scope decision; hosted delivery later |
| Odds | Existing owner/milestone calculation/publication contract | No new score-derived automatic authority | Current explicit boundary | Do not classify absence of automatic Odds publication as missing delivery |


The Google/archive rows are unresolved P0-B scope; no all-work delivery PASS is claimed. The existing canonical snapshot is authority and must not be confused with a successful external archive.
