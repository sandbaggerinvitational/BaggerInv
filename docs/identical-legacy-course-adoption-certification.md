# Identical legacy course adoption — local certification

Status: locally certified; migration 086 is **not applied**. No deployment,
rebind, R2/R3 adoption, or Production domain mutation was performed. Exact-SHA
release authorization is required next. Actual adoption is separately authorized.

Commit/push handoff: the automatic approval gate rejected the commit twice,
including after the latest attachment's explicit implementation/commit lines
were rechecked. It requires direct chat confirmation before committing/pushing.
No commit or push was performed; the seven certified files remain local. After
that confirmation, commit/push and return the exact SHA before any release.

## Contract

Migration `202609040086_production_identical_legacy_course_adoption_v1.sql`
extends only the existing current-2026 `UPSERT_COURSE` implementation. The
shared `tournament_setup_dependency_codes_v1` function is unchanged.

Only first-time Setup materialization may bypass an existing PUBLISHED Odds
snapshot dependency. The database independently proves exact Course ID, tee,
numeric rating/slope/par and normalized ordered 18-hole definitions (number,
par, Stroke Index and yardage) against **every affected selected snapshot and
active match-hole context**. Missing, partial, conflicting or differently bound
contexts fail closed. Course names remain presentation, not scoring evidence.

The entire affected round set must be named. Every match must be strictly
UPCOMING under the installed handicap started-state predicate, with no score,
mutation, unresolved mutation, finalization, active lease or scoring access.
Existing Setup materialization, prepared details and hidden course/tee overrides
make the exception ineligible. No snapshot, match, participant, handicap, or
side-game row is written. The original course materialization write block from
063 is retained verbatim; 084 continues to retire the unused starting-hole field.

The existing Director authorization, exact resource/tournament scope, Setup
advisory lock, predecessor revision, declared/canonical hashes, immutable receipt
and audit remain in place. Additional locking uses the established publication
lock before the Odds runtime lock, followed by affected match row locks in ID
order. Odds requests/workers use the corresponding shared runtime lock.
PENDING, RUNNING, RETRYABLE, and SUCCEEDED/READY jobs remain blockers. No other
dependency code is removed. Private helpers have no client/service-role execute
grant; existing table RLS is unchanged.

Successful adoption returns `ODDS_PUBLICATION_REVIEW_REQUIRED`, rendered as a
sanitized Director warning. It does not update publication payload, revision,
pointer or stored freshness. Imported-complete versus Setup-managed course
labels are now retained by the Director read model. Missing display names use
unambiguous existing match presentation indexed once by Course ID and tee;
there is no additional network read or scoring authority change.

## Read-only Production baseline — 2026-09-04, 23:53–23:58 UTC

| Context | Round 2 | Round 3 |
| --- | --- | --- |
| Course | CPGC01 — Cougar Point Golf Course | OCGC01 — The Ocean Course |
| Tee | Black | Gold |
| Rating / slope / par | 72.7 / 138 / 72 | 74.7 / 150 / 72 |
| Matching unstarted snapshots and active hole contexts | 6 / 6 | 12 / 12 |
| Ordered normalized hole SHA-256 | `f7aa69136b946abaa9f028709704426b1f458e0e19f39baad423daa3b0d53948` | `033c650f6e06e519c584f9ed87ecfb5291fcc12bde91cdc6c909dcd25baeef79` |

These hashes were calculated from live database facts, independently of the
requested values. They agree with retained/import evidence in the preceding
read-only audit. Test fixtures reproduce the observed definitions; the installed
predicate contains neither these Course IDs nor their expected hashes.

- Setup revision: **1**. Only TPGC01 / Gold is Setup-managed. R2/R3 remain absent.
- All 24 matches strictly unstarted; participants, scores, score mutations,
  unresolved mutations, active leases/access, finalized snapshots and prepared
  Setup contexts: **0**.
- Approved handicap pointer: `e2dbe4b6-ef59-4338-a546-cb686eb058f8` (revision 6).
- Odds: PUBLISHED revision **1**, snapshot
  `65f54c41-2dc3-4b2c-8570-a4d23056649a`.
- Retained publication payload hash:
  `6529536209651e61eff2027c3b2c9ef5323dc021699159b1e0565ef39169128f`.
- Stored freshness remains **CURRENT**, meaning latest explicit publication;
  operational staleness remains **PAIRINGS/SETUP**. The retained publication
  pairing fingerprint is the pre-clear fingerprint, not the current empty
  pairings. This task does not rewrite either freshness interpretation.
- No blocking Odds job; one terminal SUCCEEDED / REHEARSAL_ONLY job remains.
- Net Skins NOT_CONFIGURED; Calcutta NOT_CONFIGURED / UNPUBLISHED, auction 0.
- Current tournament 2026; scoring/read/identity authority SUPABASE;
  OBSERVATION; maintenance NORMAL; ingress OPEN; workers enabled;
  unresolved ingress queues 0.
- `/api/tournament/live`: HTTP 200, `readDiagnostics.source = supabase`,
  `googleRequests = 0` (including Guide presentation diagnostics).

Five pre-existing COMPETITION_DERIVED jobs remain PENDING, attempts 0, with their
worker disabled: TEAM_MOMENTUM, TOURNAMENT_STORYLINES, TOURNAMENT_INTELLIGENCE,
PROJECTION_EDITORIAL and TOURNAMENT_FINAL_RECAP. They were not processed,
cancelled or changed and are not Odds jobs.

## Certification

- **187 focused application/contract tests passed**, using Node's
  `--conditions=react-server` for server-only imports. Includes Setup, immutable
  Odds publication, rejected material changes, handicap format parity, scoring,
  zero-or-complete pairings, starting-hole retirement, History 2026, War Room,
  Step 14D performance, Calcutta V2, Net Skins, annual isolation and native DTOs.
- **3 PostgreSQL 17 integration tests passed** in isolated temporary clusters:
  the existing Setup/083/084 suite, the new 086 suite, and JS/PostgreSQL handicap
  parity. No Production database was used by these tests.
- 086 integration covers inert installation; R2/R3 exact adoption; all requested
  fact/safety/job rejection classes; an in-flight Odds job race; unchanged
  domain/publication fingerprints; unchanged numeric Course Handicap inputs;
  exact retry without duplicate revision/receipt/audit; conflicting retry;
  stale predecessor; RLS/private grants and Preview/tournament/actor isolation.
- Director tests cover retained names, ambiguous-name rejection, management
  labels, safe warnings and warning preservation on exact retry.
- `git diff --check`: passed.
- `npm run build`: passed. Existing CSS compatibility/cache warnings and
  unavailable legacy Google fetches during environment-unconfigured local
  prerender were logged; compilation and all static generation completed.
  This is not a claim of Production fallback: the live Production API separately
  verified Supabase with zero foreground Google requests.

## Release and subsequent operation gates

1. Request authorization for the committed exact SHA.
2. Apply only additive migration 086, deploy/rebind that SHA normally.
3. Recheck installation inertness: Setup 1, R2/R3 absent, publication 1 and all
   match/snapshot/handicap/side-game facts unchanged; certify the private helper
   read-only against current authoritative manifests.
4. Stop. Do not adopt either course without separate operational authorization.
5. When separately authorized, revalidate the first course and predecessor,
   perform its bounded operation, then **re-read** the new Setup predecessor
   before validating/submitting the second course. Do not guess revision 2/3.

Read-only Production evidence currently qualifies both course contexts. That is
not permission to execute, nor a substitute for transaction-time certification.
