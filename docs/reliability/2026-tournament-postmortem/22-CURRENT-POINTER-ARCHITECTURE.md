# Current-pointer architecture

## Proven weakness

Calcutta stores currentness twice:

- `calcutta_v1_current` stores configuration/auction/publication references, a scalar `result_revision`, and a mutable state (`supabase/production_migrations/202608290056_production_calcutta_v1.sql:136-185`).
- `calcutta_v1_result_revisions` stores immutable result revisions plus mutable `is_current`/`superseded_at`, protected by a partial unique index (`:265-320`).

Successful completion updates the old result's `is_current`, inserts the new current result, completes the job, and updates the scalar current row in one transaction (`:2540-2584`). That path is internally coherent. The failure path sets `calcutta_v1_current.state='UNAVAILABLE'` without clearing the current result reference/row (`:2721-2730`). Participant read then independently derives a state from result freshness, completed rounds and job status (`:3040-3108`). This explains how reports could observe a current result revision while the stored current state was UNAVAILABLE.

The observed result revisions 0, 1, 19, 231, 407, 423 and 424 are time-ordered snapshots during real scoring and recalculation. They are not contradictory by themselves. The contradiction risk is the dual representation of current state, not revision advancement.

## One authoritative pointer

For each domain/scope, keep immutable revisions and one pointer row:

```text
derived_current_pointer
  domain
  tournament_id
  scope_key
  pointer_revision
  target_revision_id nullable FK
  target_contract_version
  source_manifest_digest
  lifecycle_state
  transition_operation_id
  updated_at
```

There is no independently mutable `is_current` flag on history rows. Current means “referenced by the pointer.” Publication has its own pointer because public visibility and calculated-current are different authorities.

### Required invariants

1. Target revision is immutable and matches domain/tournament/scope.
2. Pointer revision increases exactly once per transition.
3. Compare-and-swap uses the expected pointer revision.
4. Pointer transition and operation receipt commit atomically.
5. Result completion can point only to a result whose job/source/configuration/contract still match.
6. Failure updates job health and projection availability; it does not mutate the identity of the last successful result.
7. Staleness is explicit: `last_successful_target`, current source manifest and `fresh|stale|updating|failed` are distinguishable.
8. Publication pointer can reference only a verified result allowed by the domain publication policy.

## State projection

Do not store one overloaded display state. Return a structured projection:

```json
{
  "configuration": "CONFIGURED",
  "publication": "PUBLISHED",
  "calculation": "FAILED",
  "freshness": "STALE",
  "lastSuccessfulResultRevision": 423,
  "currentResultRevision": null,
  "participantVisibility": "WITHHELD",
  "blockingJob": "...",
  "safeNextAction": "INSPECT_FAILURE"
}
```

This prevents `UNAVAILABLE` from concealing whether the auction disappeared, a calculation failed, a previous result exists, or public visibility is intentionally withheld.

## Transition examples

### Score invalidation

Canonical score commit writes a minimal event. The Calcutta consumer marks source freshness stale/updating and enqueues one semantic job. The last successful result remains addressable for audit, while the participant policy decides whether to withhold or show it.

### Completion

Worker verifies claim, source manifest, contract version and expected pointer. It inserts an immutable result, advances the result pointer, completes the job and records the receipt in one transaction.

### Ownership correction

Unpublish advances only the publication pointer. Auction replacement inserts a complete new auction revision, advances the auction pointer, invalidates the result pointer for the new economic scope, and supersedes incompatible active jobs. Republish advances the publication pointer and creates recalculation demand. Old results remain immutable history.

### Worker failure

Failure completes the job as failed and updates calculation health. It does not retag the old result row or overwrite financial/current source facts. A reconciliation view can prove exactly which last-successful result exists and why it is not current.

## Reconciliation acceptance

`NA-2026-019` injects a failure between every transition step and proves transaction rollback or a fully coherent pointer. It also detects multiple targets, orphan references, mismatched scalar/reference values in legacy data, published-to-superseded references and blocking stale jobs.

## Evidence

- Table definitions: `supabase/production_migrations/202608290056_production_calcutta_v1.sql:136-320`.
- Complete transition: same file `:2440-2637`.
- Failure transition: same file `:2650-2760`.
- Derived participant state: same file `:2973-3204`.
- Historical current snapshot at result 424: `/private/tmp/bagger-calcutta-ownership-readonly/REPORT.md:3-27`.
