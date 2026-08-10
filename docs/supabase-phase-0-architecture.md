# Supabase Architecture Phase 0

Status: audit and design only  
Date: 2026-08-10  
Scope: Preview planning; no Supabase connection, migration, runtime change, or production write

## Executive recommendation

Keep Google Sheets authoritative throughout Phase 1 and mirror only already-verified Preview scoring results into Supabase. Do not let the participant application read from that mirror.

When authority moves in Phase 2, move one complete transactional aggregate—not `hole_scores` alone. The boundary must include live match lifecycle, scoring permissions, match participants, scoring configuration snapshots, hole scores, revisions, and finalization. Leaving locks or FINAL state in Google while scores are authoritative in Postgres would create a cross-datastore transaction that cannot be made reliably atomic.

The existing IndexedDB local-first queue remains the participant durability layer:

```text
Phase 1: IndexedDB -> existing Google mutation -> verified readback -> Supabase shadow mirror
Phase 2: IndexedDB -> Postgres transaction -> Google outbox mirror
```

## 1. Current architecture map

The application currently follows this path:

```text
Participant PWA
  -> Vercel route and signed Player Passport validation
  -> protected, field-scoped workbook writer
  -> Google Sheets
  -> cache invalidation and fresh readback verification
  -> normalized tournament model
  -> Tournament / Game Center / Leaderboards / Net Skins / Calcutta
```

Static workbook reads are generally cached for 300 seconds, semi-static reads for 60 seconds, and live sheets for 2.5 seconds. Identical pending reads are deduplicated in-process. A live hole mutation still performs workbook reads, writes, cache invalidation, verification reads, and an audit append.

### Workbook-backed entities

| Entity | Current authoritative source | Stable identity and relationships | Workload | Future Supabase recommendation |
|---|---|---|---|---|
| Tournament / year | `Tournaments`; runtime summary in `Live Tournaments` | Tournament ID where present; year is the pervasive scope key | Configuration, low write | Migrate core identity/status; import configuration from Google initially |
| Players | `Players` | Player ID | Static profile | Migrate canonical identity/profile eventually |
| Tournament field | Active-year `Handicaps`; Passport context can fall back to IDs found in `Live Matches` | Year + Player ID; Team Side links player to team | Configuration, seasonal | Create explicit `tournament_players`; current inferred roster is a migration risk |
| Teams | `Team Names` | Year + Team Side; optional Team ID | Configuration | Migrate tournament-scoped teams |
| Rounds | `Rounds` | Year + Round; format/course relationships | Configuration | Migrate before scoring authority changes |
| Matches / pairings | `Matches` plus operational overlay from `Live Matches` | Match ID; round, course, team, participant references | Configuration plus transaction state | Migrate the live aggregate in Phase 2; retain Google final archive/mirror |
| Match participants | Repeated Team 1/2 Player 1/2 columns in `Matches` and `Live Matches` | Match ID + side + slot -> Player ID | Configuration; occasional Director write | Normalize as `match_players` |
| Courses | `Courses` | Tournament Year + Course ID + existing tee/configuration selection | Configuration | Import/version configuration; Google can remain Director source initially |
| Tee definitions | `Course Scorecards` | Course ID + Tee | Static configuration | Normalize as `tees` |
| Hole definitions | `Course Holes` | Course ID + Tee + Hole Number | Static configuration | Normalize as `holes`; snapshot scoring inputs into each match |
| Handicaps | `Handicaps`; derived round values in `Live Round Handicaps`; snapshots on matches | Year + Player ID; round/match snapshots | Configuration and derived | Migrate snapshots required for deterministic scoring; broader handicap ownership later |
| Scoring access | Access hash/token/selector/active/expiry/version fields on `Live Matches` | Match ID + access version | Operational, occasional write | Must move with scoring authority |
| Match lifecycle | Status, current hole, holes won/remaining, result text, finalized fields on `Live Matches` | Match ID | High-value transactional | Must move with hole scores in Phase 2 |
| Live hole scores | `Live Hole Scores` | Hole Score ID; unique logical Match ID + Hole Number; revision | High-frequency transactional | First mirror target; first eventual authority target |
| Final scorecards/history | `Matches`, `Round Scorecards`, finalized-match archive path | Match ID, round, player/hole identities | Append/archive | Google remains useful archive; Postgres should retain full revisions too |
| Net Skins | Rules/config in `Net Skins`; published results in `Net Skins Result` | Year + Round + Hole (+ winner IDs) | Derived live output | Consume Postgres scores later; store publication snapshot, not duplicate scoring authority |
| Calcutta | `Calcutta Purchases`, `Calcutta Ownership`, `Calcutta Point Structure`, `Calcutta Payout`; results/standings sheets | Year, player/owner/round placement keys | Configuration plus derived publication | Keep Google initially; later consume authoritative competition views |
| Odds/projections | `Prediction Settings`, `Odds Control`, `Odds Snapshots`, flattened Team/Player result sheets | Year + Phase; snapshot payload | Derived publication | Keep snapshot model; Postgres is useful later, but not in live-scoring migration |
| Notifications | `Trusted Devices`, `Notification Log`; schedule/timeline inputs | Device/subscription and log IDs | Operational | Good later candidate; isolate from scoring migration |
| Director configuration | Multiple protected sheets including Tournaments, Matches, Courses, Handicaps, Teams, guide/rules | Sheet-specific stable keys | Low-frequency protected writes | Migrate selectively only after scoring proves stable |
| Player identity / Passport | `Player Passport`, `Trusted Devices`; signed HttpOnly session | Tournament ID + Player ID + passport version | Security-sensitive | Keep current server validation initially; map to Supabase Auth only in a later independent phase |
| Operational audit | `Match Update Log`, `Admin Audit Log`, `Notification Log` | Append-only event identity/timestamp | Append-heavy | Use append-only Postgres audit plus Google export/archive |

### Transactional priority

Highest migration value:

1. `Live Hole Scores`: frequent writes, corrections, verification reads, and burst traffic are a poor match for a spreadsheet.
2. Live match state: it is updated with each confirmed hole and must be atomic with score changes.
3. Scoring access and lifecycle: lock, FINAL, and reopen checks must be evaluated inside the same transaction as a score write.
4. Live competition projections: match state, team score, leaderboard summaries, and Net Skins can be transactionally derived or asynchronously published from one event stream.

Lower initial value: player profiles, guide content, course catalog, Calcutta purchasing configuration, odds configuration, and historical reporting are low-frequency or publication-oriented and can safely remain workbook-backed during early phases.

## 2. Proposed Postgres model

Stable workbook IDs should be retained as natural external identifiers even where an internal UUID is useful. Every imported record should carry `source_system`, `source_revision`, and `source_updated_at` where available.

### Core tables

| Table | Primary key | Important foreign keys / columns | Constraints and indexes |
|---|---|---|---|
| `tournaments` | `id text` (existing Tournament ID) | `year`, name, location, status, timezone, source fields | Unique `year`; index status |
| `players` | `id text` (Player ID) | name/profile fields, active flag | Profile/search indexes only as justified |
| `teams` | `id uuid` | `tournament_id`, `legacy_team_id`, `side`, name | Unique `(tournament_id, side)` and `(tournament_id, legacy_team_id)` |
| `tournament_players` | `(tournament_id, player_id)` | `team_id`, participation status, seed/role, handicap reference | Index `(team_id, player_id)`; explicit active field replaces roster inference |
| `rounds` | `id uuid` | `tournament_id`, `round_number`, format, course/tee configuration version, points rules version | Unique `(tournament_id, round_number)` |
| `courses` | `id text` (Course ID) | name, location | Stable Course ID |
| `tees` | `id uuid` | `course_id`, tee label, rating, slope, yardage, par | Unique `(course_id, label)` |
| `holes` | `id uuid` | `tee_id`, hole number, par, yardage, stroke index | Unique `(tee_id, hole_number)`; check hole 1..18 |
| `matches` | `id text` (Match ID) | `round_id`, match number, tee time, course/tee and rule snapshot IDs, status, scoring locked, result/progress, `revision`, finalized fields | Unique `(round_id, match_number)`; indexes `(round_id,status)`, `(status,tee_time)` |
| `match_players` | `(match_id, side, slot)` | `player_id`, `team_id`, handicap/course-handicap/playing-handicap/strokes snapshots | Unique `(match_id, player_id)`; index `(player_id, match_id)` |
| `scoring_permissions` | `id uuid` | `match_id`, principal/user, role, active, expiry, version | Index active `(match_id, principal_id)`; version participates in authorization |

### Score aggregate

Use a header/detail model so one match-hole owns the result while player/team gross values remain normalized.

| Table | Purpose and critical columns |
|---|---|
| `match_holes` | UUID PK; `match_id`, `hole_number`, `course_hole_id`, stroke-index snapshot, side net totals, hole winner, revision, created/updated timestamps and actor. Unique `(match_id, hole_number)` and index `(match_id, updated_at)` |
| `hole_scores` | UUID PK; `match_hole_id`, side, subject type (`PLAYER`/`TEAM`), subject ID, nullable player/team FK with exactly-one check, gross score, strokes applied, derived net snapshot, timestamps. Unique `(match_hole_id, subject_type, subject_id)` |
| `score_mutations` | Idempotency key PK; match/hole, actor, client sequence, expected match/hole revisions, canonical payload hash/JSON, status/result, received/completed timestamps. Index `(match_id, client_sequence)` |
| `score_revision_history` | Append-only before/after canonical payload, reason, mutation ID, actor, timestamp |
| `audit_events` | Append-only tournament/match event, actor, action, safe metadata, timestamp |
| `outbox_events` | UUID PK; aggregate ID/revision, event type/payload, attempts, next attempt, delivered timestamp. Partial index on undelivered rows |

Gross values are canonical inputs. Net score, applied strokes, and hole winner should be calculated by trusted server/database code and stored as an audit/performance snapshot, while remaining reproducible from immutable match configuration and handicap snapshots. The client must never author those derived values.

Post-clinch holes remain ordinary score mutations. Mathematical result and scorecard completeness are separate. A match is finalizable only after 18 unique, complete `match_holes` exist and all score mutations are resolved.

### Later competition/publication tables

Add only as their consumers migrate: `net_skins_results`, `standings_snapshots`, `calcutta_*`, `projection_snapshots`, `notification_subscriptions`, and `notification_deliveries`. Prefer views or transactionally published summaries over copying calculation logic into many tables.

## 3. Transaction and concurrency design

Expose one trusted transaction/RPC such as `submit_hole_score`, called initially only by the existing Vercel server after Passport validation:

1. Insert or load `score_mutations` by idempotency key. The same key and payload returns the prior result; the same key with another payload is rejected.
2. Acquire a transaction-scoped advisory lock keyed by Match ID, or lock the match row with `FOR UPDATE`. This serializes the match across all Vercel/database instances, unlike the current process-local promise queue.
3. Verify tournament/match identity, scorer assignment, permission version, lock state, and non-FINAL lifecycle.
4. Compare expected match and hole revisions. An already-equal canonical score is an idempotent success; a different current value returns a structured conflict.
5. Validate gross scores and calculate strokes, net scores, and hole winner from snapshotted authoritative configuration.
6. Upsert the match-hole aggregate, increment revisions, and append correction history.
7. Recalculate live match progress/result. A clinched result does not set FINAL and does not block holes 14-18.
8. Append the audit event and Google mirror outbox event in the same database transaction.
9. Commit and return the authoritative row/revisions.

Finalization is a separate transaction that locks the match and verifies: 18 unique complete holes, no unresolved score mutations, scoring lifecycle eligibility, and a fresh canonical result. Reopen is a Director-only transaction that retains score history.

This handles simultaneous scorers, duplicate taps, two devices, correction races, stale responses, and finalization races without relying on timestamps alone. Numeric revisions are the concurrency token; timestamps are audit metadata.

## 4. Authorization and future RLS

Phase 1 should not add Supabase Auth. The Vercel server continues validating the signed Player Passport and uses a server-only Supabase credential to write the shadow mirror.

For a later Auth phase:

- `user_player_links(auth_user_id, player_id)` binds `auth.uid()` to a stable Player ID.
- `tournament_roles(auth_user_id, tournament_id, role)` grants narrowly scoped Director/service roles.
- Participant read policies expose only intended participant/public tournament views.
- Clients receive no direct insert/update/delete grant on score tables.
- A security-definer scoring RPC checks the authenticated player belongs to `match_players`, permission is active/current, and the match is neither locked nor FINAL.
- Director lifecycle RPCs require a tournament-scoped Director role and always append audit events.
- Service-role credentials remain server-only and are limited to mirror/import workers.

There should be no permissive production write policy such as `USING (true)`. RLS is defense in depth; lifecycle and revision validation must still execute inside the transaction.

## 5. Google coexistence and ownership

| Phase | Supabase owns | Google owns | Direction |
|---|---|---|---|
| 1 | Nothing authoritative; shadow observations only | All current configuration and live state | Verified Google result -> Supabase mirror |
| 2 | Complete live scoring aggregate: match snapshots, permissions/lifecycle, scores, revisions | Configuration source plus reporting/archive mirror | Supabase outbox -> Google |
| 3 | Live match/competition views and publications | Configuration, convenient reports, archives | Primarily Supabase -> Google; explicit versioned config import in reverse |
| Later | Selective operational domains | Remaining workbook content that still benefits Directors | Domain-specific, never two authorities for one field |

Once Supabase is authoritative for a domain, Google edits must not silently overwrite it. Configuration changes should pass through an explicit import/version/validation operation. Live outputs should be one-way exports driven by the transactional outbox. An outbox worker can retry Google without holding up scoring, and the outbox provides a recoverable record of mirror lag.

## 6. Phased roadmap

### Phase 0 — this document

Audit, schema, security, ownership boundaries, benchmarks, and exit criteria only. No connection or runtime code.

### Phase 1 — Preview shadow mirror

Google remains authoritative. After the existing Google mutation and fresh readback verify, emit an idempotent Preview-only mirror event. Supabase is not read by the application and cannot affect participant success/failure. Run reconciliation and calculation comparisons out of band.

### Phase 2 — Preview live scoring authority

Move hole scores together with live match state, scoring permissions, match players, and immutable course/handicap/rule snapshots. Preserve the current Passport-facing API and IndexedDB queue; change only its server persistence adapter. Use the Postgres transaction and outbox mirror to Google.

### Phase 3 — live consumers

Move Tournament, Game Center, leaderboard-driving live views, Director monitoring, and Net Skins one consumer at a time. Compare every published value against the existing tournament model before removing its fallback.

### Phase 4 — identity evaluation

Evaluate Supabase Auth only after the scoring engine survives Preview and Dress Rehearsal. Migrate stable Player ID bindings without weakening current Passport semantics.

### Phase 5 — selective Director operations

Move operational controls where transactions add value. Keep workbook-first configuration/reporting where it remains convenient.

## 7. Realtime recommendation

Use narrowly scoped publication rows or views, not global raw-table subscriptions:

- One match-state subscription for the open scorecard and Game Center match.
- One tournament-summary subscription for team score and Tournament Pulse.
- One published-standings subscription for Players/Teams leaderboards.
- Active-match summaries for Director monitoring.
- Published Net Skins changes after confirmed score transactions.

Do not subscribe clients to all raw hole scores, static course/player data, Calcutta configuration, or odds configuration. Realtime events prompt state updates; they do not replace authoritative queries or server calculations.

## 8. Current baseline and benchmark plan

Repository code does not contain a statistically complete production p50/p95 dataset. Existing real-device observations place a Google authoritative save/readback near 2 seconds, commonly 1-3 seconds. The verification schedule can retry after 0, 300, 750, 1,500, and 3,000 ms in addition to workbook reads/writes and audit logging. The current local-first foreground advance is intentionally decoupled from that latency.

Phase 1 instrumentation should separately record:

- Local validation, IndexedDB commit, visual advance, and next-hole usable time.
- Passport/server authorization time.
- Google read, write, invalidation, verification, and audit time.
- Supabase mirror request/transaction time and Google-to-mirror lag.
- Propagation to match state, Tournament, leaderboard publication, and Net Skins.

Benchmark single insert, correction, idempotent replay, an 11-hole burst, 12 concurrent matches, two-device same-hole conflict, finalization with pending writes, and downstream propagation. Report p50/p95/p99 and error/duplicate/loss counts on deployed Preview.

Initial Phase 2 targets to validate—not promises—are: Postgres authoritative mutation p95 under 300 ms in-region, authoritative read p95 under 150 ms, scoped Realtime propagation under 500 ms, and Google mirror lag p95 under 10 seconds. Correctness gates are zero lost writes, zero duplicate logical holes, deterministic newest valid correction, and exact calculation equivalence.

The largest expected speed improvements are removal of workbook read/write/readback from the scoring critical path, database-level cross-instance serialization, indexed match/hole reads, atomic match-state updates, and event-driven downstream propagation.

## 9. Risks and controls

1. The active player field is inferred rather than modeled explicitly. Build and verify `tournament_players` before authority migration.
2. `Matches` and `Live Matches` overlap. Document every overlay field and choose one Postgres owner.
3. Course/tee/handicap data changes over time. Score using immutable match snapshots so historical results cannot drift.
4. Reimplementing net/winner/result logic can diverge. Run shadow comparisons before enabling writes or reads.
5. Current match serialization is process-local. Do not claim concurrency safety until the database transaction owns it.
6. A service-role or RLS mistake is high impact. Keep service credentials server-only, deny direct score DML, and test policies adversarially.
7. Dual-write ambiguity can corrupt authority. Phase 1 is explicitly observational; Phase 2 uses a transactional one-way outbox.
8. Google quotas/outages can delay the mirror. Never block authoritative Postgres scoring on archive delivery.
9. Realtime delivery is ordered imperfectly from a client perspective. Consumers use revisions and refetch authoritative state.
10. Timestamp comparisons are insufficient. Use numeric revisions and idempotency keys.
11. Finalization can race pending scores. Lock the aggregate and check all 18 holes in one transaction.
12. Passport-to-Auth migration can break identity. Keep it outside the initial scoring authority migration.
13. Region selection affects mobile latency. Benchmark from the actual tournament geography before choosing targets.
14. Rollback can reintroduce two authorities. Define a phase-specific cutover and rollback ledger before Phase 2.

## 10. Exact recommended Phase 1 implementation

Implement this later in an isolated Preview pull request:

1. Create version-controlled migrations for `score_mirror_events`, `live_match_mirror`, `hole_score_mirror`, and `mirror_reconciliation_runs`, shaped like the future canonical model but marked `authority = 'google'`.
2. Preserve Match ID, Hole Number, Google revision/timestamps, canonical numeric payload, mutation/idempotency key, payload hash, actor, and observed time. Use unique `(match_id, hole_number, google_revision)` plus mutation-key uniqueness.
3. Add `SUPABASE_SCORING_MIRROR_ENABLED=false` by default and require both Preview deployment context and the Preview workbook context. Production must fail closed even if configuration is accidentally present.
4. Only after existing Google readback verification succeeds, enqueue a non-blocking mirror delivery using the verified result already in memory. Do not add another Google read and do not change the API response contract.
5. Make mirror upserts idempotent. Mirror failure is recorded for reconciliation but never changes the golfer-facing save result.
6. Use a durable delivery mechanism suitable for serverless execution rather than an unawaited in-memory promise. Keep it outside the score transaction's foreground latency.
7. Run a scheduled Preview-only reconciliation that compares Google logical holes/revisions/payload hashes with mirror rows. It may repair missing mirror observations but must never write back to Google.
8. Shadow-run Postgres scoring derivations and compare gross, strokes, net, winner, match progress, clinch result, and 18-hole completeness. Differences alert; they do not affect the app.
9. Record mirror completeness, divergence, delivery latency, retry counts, Google save latency, and concurrent burst results.
10. Do not enable Supabase reads, Realtime, Supabase Auth, Google mirror-back, or production environment variables in Phase 1.

Phase 1 exit criteria: every verified Preview Google score appears in Supabase after reconciliation, no unexplained divergence, no lost/duplicate logical scores, no participant latency regression, successful burst/two-device/correction/finalization tests, and a documented Phase 2 cutover and rollback procedure.

## Evidence paths audited

- `lib/google-sheets-data.js`
- `lib/google-sheets-server-read.js`
- `lib/google-sheets-write.js`
- `lib/workbook-protection.js`
- `lib/live-match-source.js`
- `lib/live-hole-scoring.js`
- `lib/scoring-sync-queue.js`
- `lib/scoring-access.js`
- `lib/player-passport-server.js`
- `lib/finalized-match-archive.js`
- `lib/net-skins.js`
- `lib/calcutta.js`
- `lib/prediction-data.js`
- `lib/odds-workbook-persistence.js`
- `app/api/scoring/current/route.js`

No production data, workbook data, Supabase data, application behavior, API contract, Passport behavior, scoring calculation, Preview scoring behavior, or runtime configuration was changed by Phase 0.
