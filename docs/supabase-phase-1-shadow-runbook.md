# Supabase Phase 1 Preview Shadow Runbook

Status: implementation complete locally; database connection and deployed benchmarks pending Preview configuration.

## Authority boundary

Google Sheets remains the sole authority. The scoring route authorizes the Passport, mutates Google, completes existing readback verification, determines participant success, and only then schedules the Supabase observation with Next.js `after()`.

Supabase failure is logged but cannot alter the response, IndexedDB state, scoring conflicts, lifecycle, Finalization, or downstream tournament behavior. No participant module imports the shadow client.

## Durable delivery

The fast path uses the platform-managed `after()` lifecycle rather than an unawaited Promise. Google is the durable event source. If the function terminates or Supabase is unavailable, the Director reconciliation detects the missing logical row and the full rebuild reconstructs it. This is appropriate for an observational mirror; it would not be sufficient for a future authoritative backend.

Delivery is idempotent by Preview workbook + Match ID + Hole Number + Google Revision and by mutation key. Replays increment `delivery_count` without creating another logical current score. A higher/equal revision may update current state; a stale revision cannot replace it.

## Minimal schema

- `score_mirror_events`: append-only verified delivery/correction observations and comparison diagnostics.
- `hole_score_mirror`: one current Google-authoritative logical score per Preview workbook/match/hole.
- `live_match_mirror`: current non-authoritative match progress/lifecycle snapshot.
- `mirror_reconciliation_runs`: rebuild, reconciliation, benchmark, and divergence summaries.

All tables have RLS enabled and no anon/authenticated policies or DML grants. Only the server secret may call the restricted RPCs.

## Environment

Runtime, Preview only:

```text
SUPABASE_SCORING_MIRROR_ENABLED=true
SUPABASE_SCORING_MIRROR_URL=https://<preview-project>.supabase.co
SUPABASE_SCORING_MIRROR_SECRET_KEY=<server secret>
```

Migration tooling only:

```text
SUPABASE_DB_URL=<Preview database connection string>
```

No key is `NEXT_PUBLIC`. The gate also requires `VERCEL_ENV=preview` (or local development) and a configured `GOOGLE_SHEETS_ID` different from the hard-coded Production workbook. Production is blocked even if the flag and credentials exist.

## Migration and activation

1. Apply `supabase/migrations/202608100001_preview_scoring_shadow.sql` to the Preview Supabase project.
2. Configure the three runtime variables only for Vercel Preview.
3. Deploy the feature branch with the flag initially false.
4. Confirm Production and Production workbook gates return disabled.
5. Enable the flag on Preview.
6. Authenticate as Director and call `POST /api/director/scoring-shadow` with `{ "action": "rebuild" }`.
7. Inspect the returned completeness/divergence summary.
8. Use `GET /api/director/scoring-shadow` for a read-only reconciliation run.

The rebuild transaction deletes only the selected Preview workbook+tournament shadow rows, loads current authoritative workbook rows, recalculates hashes/derived match state, and commits the replacement atomically in Supabase. It has no Google mutation path.

## Calculation comparison

Hole net/stroke/winner comparison reuses the canonical server calculation result already produced before the Google write and compares it with the verified Google row. Match progress, points, clinch state, and 18-hole completeness reuse the shared deterministic functions in `lib/live-hole-scoring.js`. Phase 1 intentionally does not introduce an independent participant scoring engine. SQL stores and aggregates observations; a distinct database-native rules engine belongs only after fixture parity is established.

## Instrumentation

Structured Preview server logs record Passport authorization time, total Google authoritative time, Google request/write/cache/retry diagnostics, Supabase transaction duration, comparison status, match/hole/revision, and failures without secrets or score-entry UX changes.

Reconciliation records missing, duplicate delivery, payload divergence, revision mismatch, stale mirror, and orphan counts. `benchmarkSummary()` reports count, min, p50, p95, p99, max, error, retry, duplicate, and lost-logical-score counts.

## Required deployed benchmark matrix

Do not issue a Phase 2 GO until a configured deployed Preview has produced:

- representative single-hole saves and corrections;
- duplicate idempotent replay;
- 11-hole burst;
- 12 concurrent matches;
- two-device same-hole revisions;
- 18-hole Finalization observation;
- Supabase unavailable, timeout, duplicate, delayed, malformed, missing, stale, and credentials failure tests;
- a full rebuild with zero unexplained missing/payload/calculation divergence.

The local workspace had no Supabase URL/secret/database connection, Preview workbook credentials, or deployed Preview session. Consequently, no real database migration, Google mutation, Preview score, or benchmark number was fabricated in this phase report.
