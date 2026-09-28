# Fingerprint redesign

## Scope of this inventory

This is an exact inventory of fingerprint behavior inspected in the pinned Release 139 candidate for the Calcutta, Net Skins, score-write and selected Odds paths, plus the installed-function evidence retained by the R3 reports. It is not a claim that every hash in the repository was inspected.

## Inspected current behavior

### Hash primitive

Calcutta and Net Skins both hash `jsonb::text` with SHA-256 (`supabase/production_migrations/202608290056_production_calcutta_v1.sql:353-361`; `supabase/production_migrations/202608290055_production_net_skins_v1.sql:243-251`). Deterministic object/array construction and explicit ordering are therefore part of the semantic contract.

### Score mutation payload

The score RPC's payload hash contains match ID, hole number, both teams' gross arrays and actor ID (`supabase/production_migrations/202608240021_production_scoring_operations.sql:998-1009`). It intentionally does not trust client strokes, net, winner or points.

### Calcutta

| Fingerprint | Inspected input |
|---|---|
| Configuration | Complete validated configuration manifest |
| Auction | Complete validated purchases/ownership/pot manifest |
| Resource | Environment/project/workbook/tournament/deployment/authority binding |
| Source | Rounds 1-3 status/format; matches and revisions/permissions/result state/snapshot; participant handicap fields; all canonical hole gross/strokes/net/winner (`:1245-1318`) |
| Result payload | Engine result JSON |
| Request/payload | Operation request identity and input JSON |
| Late-R3 financial | `calcutta_v1_current` plus all configuration, auction, publication and result revision rows (`supabase/production_migrations/202609090097_production_late_r3_initialization_v1.sql:100-109`) |
| Late-R3 consumed | Policy, rounds, courses/holes, R1/R2 matches/participants/snapshots/match holes/permissions/details, all Net Skins configuration history/current/results, all tournament holes, and the financial fingerprint (`:113-132`) |

The last two hashes are the architectural problem. They encode histories and control metadata, not only the semantic facts consumed by the retained result. Incident 017 proved the consumed fingerprint changed solely because Net Skins configuration history/current pointer/result `is_current` metadata changed. Incident 019 proved evaluating these helpers on a scoring-trigger path could hit the eight-second statement timeout.

### Net Skins

| Fingerprint | Inspected input |
|---|---|
| Configuration | Complete configured round/membership manifest |
| Round source | Match format/status/revisions/snapshot hash/participants plus every hole's gross, strokes, net and winner for one round (`supabase/production_migrations/202608290055_production_net_skins_v1.sql:373-444`) |
| Result payload | Engine result JSON |
| Request/payload | Operation request and input JSON |

The round source is bounded by one round, which is better than whole tournament history, but it remains unsuitable for synchronous recomputation inside a score transaction. A compact source revision can be assembled by consumers after commit.

### Odds

The inspected orchestration validates current configuration/source, settings, effective settings, bundle, ratings and pairing fingerprints plus configuration revision (`supabase/production_migrations/202608240023_production_odds_calculation_orchestration.sql:195-253`). Retained installed-function evidence showed `odds_input_changes_v1` decomposed a stale calculation into `MATCHES`, `MATCH_SCORE_AUTHORITY`, and `PAIRING_COURSE_AUTHORITY`. The exact body of every installed Odds fingerprint helper was not independently re-audited here.

## Redesign

### Component manifests

Replace one broad digest with a versioned manifest of bounded component digests:

```json
{
  "contract": "calcutta-source-v2",
  "scope": "2026",
  "components": {
    "financial": {"revision": 38, "digest": "..."},
    "round1Golf": {"revision": 108, "digest": "..."},
    "round2Golf": {"revision": 108, "digest": "..."},
    "round3Golf": {"revision": 216, "digest": "..."},
    "calculationPolicy": {"version": "full-net-v2", "digest": "..."}
  }
}
```

Each component specifies:

- exact field paths and types;
- canonical normalization and array ordering;
- scope key and producer revision;
- why the consumer needs it;
- whether a compatible transition may change it;
- size, row-count and computation budget.

History rows, attempt counts, lease timestamps, supersession timestamps, `is_current` flags and publication audit metadata are excluded unless the consumer's economic result actually depends on them.

### Incremental revisions

Canonical producers increment compact source revisions in the same transaction as the fact change. Consumers read the revision and precomputed component digest after commit. Rebuilding a digest from raw facts remains an offline/reconciliation check, not the live write path.

The digest must still be independently reproducible from canonical rows in the isolated certification database. Storing a digest without a reconstruction test merely hides drift.

### Compatibility receipts

When a change is intentionally neutral, record a receipt containing:

- original and new component manifests;
- named compatibility policy/version;
- exact components allowed to differ;
- proof that disallowed components are equal;
- actor/release/operation receipt;
- expiration or scope limits.

The read path first checks receipt/result identity cheaply. Only then may it compare bounded component digests. The Release 139 early-return repair demonstrates the necessary evaluation order (`supabase/production_migrations/202609270120_bounded_late_r3_result_compatibility_v1.sql:3-31`).

## Tests

`NA-2026-019` grows history 100x and proves critical-path runtime remains bounded. `NA-2026-017` mutates each semantic and nonsemantic field in turn: consumed facts must change the relevant component; history/control metadata must not. Every exclusion needs a result-equivalence test.

## Evidence

- Broad hash reconstruction: `/private/tmp/bagger-r3-dependency-recovery/REPORT.md:65-77`.
- Historical growth and planning: `/private/tmp/bagger-r3-write-timeout/REPORT.md:80-102`.
- Corrected eligibility order: `supabase/production_migrations/202609270120_bounded_late_r3_result_compatibility_v1.sql:3-31`.

## Expanded offline inventory findings

The bounded Part XXI source inventory is now in `FINGERPRINT-INVENTORY.md`. Its overall status remains **PARTIAL**: it inventories discovered calls and immediate inputs in the requested domain entrypoints at candidate SHA `b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6`, but it does not prove installed definitions, runtime reachability, dynamic dispatch, all-repository coverage, or physical behavior.

Four additional source-proven findings materially affect this redesign:

1. The whole-round scoring fingerprint includes an `activeLeases` count computed with `expires_at > clock_timestamp()` (`supabase/production_migrations/202609220108_atomic_round_scoring_v1.sql:40-66,85-86`). The same database rows can therefore produce a different compare-and-swap token solely because time passed. A proposed redesign should remove clock-relative predicates from the semantic digest and represent lease eligibility as an explicit precondition or revisioned lease-set component.
2. `productionOddsPublicationRequestFingerprint` accepts and validates `expectedPublicationRevision` and `expectedSnapshotId`, then omits both from the SHA-256 input while the RPC payload still carries them (`lib/production-odds-publication-server.js:287-334,365-402`). Database predecessor checks may still protect the write, but the request fingerprint does not attest the complete publication predecessor. A proposed versioned replacement should bind both fields.
3. Future scoring-context preparation hashes tournament, match, round, format, course/tee, holes, participants, teams, handicap revision, setup revision and runtime revision, but it does not directly hash the round handicap allowance or tee rating, slope and par that are written into the same snapshot (`supabase/production_migrations/202608300066_production_future_runtime_activation_v1.sql:3200-3265`). Revision dependencies may catch ordinary updates, but the digest is not self-contained. A proposed replacement should include all four values explicitly.
4. The normal Tournament Setup `REPLACE_PAIRINGS` path receives only the whole-request idempotency hash; it does not persist a dedicated canonical pairing-state fingerprint (`supabase/production_migrations/202608300063_production_tournament_setup_v1.sql:273-375,3820-3900,3935-3961`). The one-time R3 recovery demonstrates a separate pairing digest (`supabase/production_migrations/202609260119_existing_r3_dependency_preserving_preparation_v1.sql:1-31`). Build 11 should separate request identity from pairing authority.

These are proposed design inputs. No repair, approval, implementation, migration execution, or runtime verification is implied.

### Requirement and proof routing for the expanded inventory

The four additional source findings are architecture-derived follow-up, not newly proven 2026 incidents. Round-operation manifests map to BE-DEP-003 and DIR-OPS-002; Odds predecessor binding, pairing component identity and future preparation completeness map to BE-DEP-002 and DB-PERF-003. Before implementation, add one-field mutation/replay vectors to the affected requirement tests, execute the installed contract in isolation, and prove whether enforced revision/precondition checks already cover each omitted value. A source-field omission alone does not prove a security bypass or historical competitive mutation.
