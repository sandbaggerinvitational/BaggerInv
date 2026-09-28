# Database blueprint

## Status and scope

This is a conceptual 2027 schema blueprint derived from the pinned Release 139 candidate and 2026 incident evidence. It is not an executable migration, and none of these tables are claimed to exist. Names, keys, retention and grants require implementation review against the actual PostgreSQL version and tenancy model.

The blueprint preserves two existing authorities:

- writable scoring clients send gross values only; the server derives strokes, net, winner and progression;
- immutable domain revisions remain historical evidence and are never rewritten to simplify a current view.

It adds constrained current pointers, mutation receipts, semantic fingerprints and a proposed minimal transactional event seam for derived work.

## Logical entities

```sql
-- Conceptual only. Types, grants, RLS and partitioning are intentionally incomplete.

backend_contract_versions (
  domain, contract_name, version,
  schema_digest, semantic_manifest_digest,
  introduced_release_id, retired_release_id,
  compatibility_policy,
  PRIMARY KEY (domain, contract_name, version)
)

operation_receipts (
  operation_id UUID PRIMARY KEY,
  tournament_id UUID NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id UUID NOT NULL,
  operation_type TEXT NOT NULL,
  actor_id UUID NOT NULL,
  payload_hash BYTEA NOT NULL,
  predecessor_revisions JSONB NOT NULL,
  resulting_revisions JSONB,
  status TEXT NOT NULL,
  safe_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
)

canonical_change_events (
  event_id UUID PRIMARY KEY,
  tournament_id UUID NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  canonical_revision BIGINT NOT NULL,
  mutation_id UUID NOT NULL,
  contract_version TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  UNIQUE (event_type, scope_id, canonical_revision, mutation_id)
)

derived_event_deliveries (
  event_id UUID NOT NULL REFERENCES canonical_change_events(event_id),
  consumer_name TEXT NOT NULL,
  consumer_contract_version TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  last_safe_error_code TEXT,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (event_id, consumer_name)
)

derived_jobs (
  job_id UUID PRIMARY KEY,
  domain TEXT NOT NULL,
  tournament_id UUID NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id UUID NOT NULL,
  contract_version TEXT NOT NULL,
  source_manifest_id UUID NOT NULL,
  configuration_revision BIGINT,
  publication_revision BIGINT,
  execution_status TEXT NOT NULL,
  freshness_status TEXT NOT NULL,
  review_status TEXT NOT NULL,
  activation_id BIGINT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  superseded_by_job_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
)

derived_job_events (
  job_event_id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES derived_jobs(job_id),
  event_type TEXT NOT NULL,
  operation_id UUID REFERENCES operation_receipts(operation_id),
  safe_metadata JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
)

derived_result_revisions (
  result_id UUID PRIMARY KEY,
  domain TEXT NOT NULL,
  tournament_id UUID NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id UUID NOT NULL,
  result_revision BIGINT NOT NULL,
  job_id UUID NOT NULL REFERENCES derived_jobs(job_id),
  source_manifest_id UUID NOT NULL,
  lifecycle_state TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  superseded_by_result_id UUID,
  UNIQUE (domain, scope_id, result_revision)
)

derived_current_pointers (
  domain TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id UUID NOT NULL,
  pointer_revision BIGINT NOT NULL,
  result_id UUID REFERENCES derived_result_revisions(result_id),
  visibility_state TEXT NOT NULL,
  updated_by_operation_id UUID NOT NULL REFERENCES operation_receipts(operation_id),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (domain, scope_type, scope_id)
)

publication_revisions (
  publication_id UUID PRIMARY KEY,
  domain TEXT NOT NULL,
  scope_id UUID NOT NULL,
  publication_revision BIGINT NOT NULL,
  visibility_state TEXT NOT NULL,
  source_revision BIGINT NOT NULL,
  created_by_operation_id UUID NOT NULL REFERENCES operation_receipts(operation_id),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (domain, scope_id, publication_revision)
)

publication_current_pointers (
  domain TEXT NOT NULL,
  scope_id UUID NOT NULL,
  pointer_revision BIGINT NOT NULL,
  publication_id UUID NOT NULL REFERENCES publication_revisions(publication_id),
  updated_by_operation_id UUID NOT NULL REFERENCES operation_receipts(operation_id),
  PRIMARY KEY (domain, scope_id)
)

semantic_fingerprint_manifests (
  manifest_id UUID PRIMARY KEY,
  domain TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id UUID NOT NULL,
  contract_version TEXT NOT NULL,
  digest BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (domain, scope_id, contract_version, digest)
)

semantic_fingerprint_components (
  manifest_id UUID NOT NULL REFERENCES semantic_fingerprint_manifests(manifest_id),
  component_name TEXT NOT NULL,
  owner_domain TEXT NOT NULL,
  normalization_version TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  digest BYTEA NOT NULL,
  PRIMARY KEY (manifest_id, component_name)
)

release_job_dispositions (
  release_id BIGINT NOT NULL,
  job_id UUID NOT NULL REFERENCES derived_jobs(job_id),
  disposition TEXT NOT NULL,
  compatibility_rule TEXT,
  operation_id UUID NOT NULL REFERENCES operation_receipts(operation_id),
  PRIMARY KEY (release_id, job_id)
)
```

## Required invariants

### Canonical score writes

The existing scoring RPC pattern remains authoritative: lock the match, check expected revisions and idempotency, validate gross cardinality, read prepared handicap/hole authority, derive strokes/net/winner on the server, write the hole/match, insert receipt/audit and the minimal event, then commit. Client-supplied net, strokes, winner or points never become writable inputs.

`operation_receipts.payload_hash` binds the allowed gross-only contract. A same-ID request with a different hash is an idempotency conflict. A lost response is resolved by receipt plus canonical readback before any replay.

### Minimal event seam

`canonical_change_events` is a proposed unified derived-state outbox. The score transaction inserts only identity, canonical revision, mutation lineage, event type, contract version and time. It does not construct side-game snapshots, calculate fingerprints, scan history or call external systems.

`derived_event_deliveries` gives each consumer an independent checkpoint. One consumer's deterministic failure cannot block canonical golf or erase another consumer's progress. This proposal builds on the existing Google outbox/post-commit pattern but is not claimed as installed behavior.

### Jobs, results and pointers

Execution, freshness, review and visibility are different columns because `PENDING`, `STALE`, `READY` and `PUBLISHED` describe different axes.

Only `derived_current_pointers.result_id` selects the current immutable result. Result rows do not also carry an independently writable `is_current` flag. A pointer transition inserts the result, compare-and-swaps `pointer_revision`, records the operation receipt and writes job history in one transaction.

A failure can update the job and its delivery but cannot mutate pointer visibility into a state that contradicts the referenced result. A reconciliation query must report:

- pointers to missing or incompatible results;
- pointer revision mismatches;
- more than one active publication pointer per scope;
- jobs that claim success without the referenced result;
- stale or READY jobs that block an action without a supported disposition;
- results whose source manifest or contract version is incompatible with the pointer's domain policy.

This replaces the Calcutta dual-state risk in the pinned source, where `calcutta_v1_current.state/result_revision`, result-row `is_current`, and participant-read derivation can express different current views. In particular, the fail path sets `current.state = 'UNAVAILABLE'` without clearing the result pointer (`supabase/production_migrations/202608290056_production_calcutta_v1.sql:2721-2730`).

### Release compatibility

Activation guards remain exact. Before activation advances, every nonterminal job receives a `release_job_dispositions` row: drain, supersede, block or compatible carry-forward. Carry-forward requires a named compatibility rule, matching semantic source/configuration, allowed attempt/lease state and an immutable receipt. It changes job authority through a private transition; claim/complete never ignore activation.

### Semantic fingerprints

Each manifest enumerates exact normalized components and their domain owner. Component rows make a changed hash explainable and allow consumers to exclude nonsemantic metadata such as attempts, supersession timestamps and old `is_current` flags.

The inspected Release 139 Calcutta/Net Skins hashes use SHA-256 over normalized JSONB text (`supabase/production_migrations/202608290056_production_calcutta_v1.sql:353-361`; `supabase/production_migrations/202608290055_production_net_skins_v1.sql:243-251`). The late-R3 consumed fingerprint includes broad current and historical Net Skins and Calcutta data (`supabase/production_migrations/202609090097_production_late_r3_initialization_v1.sql:100-132`). That exact scoped inventory supports redesign of those paths. It is not a claim that every Odds helper or every repository hash function was audited.

## Index and query requirements

- One partial active-job unique index per domain/scope/contract/source identity, covering only statuses that can still execute.
- Claim indexes beginning with consumer/domain, execution status, available time and creation order; lease expiry indexed separately for recovery.
- Receipt lookup by operation ID, plus bounded scope/time indexes for Director support.
- Pointer primary keys by domain/scope; immutable result lookup by pointer foreign key and domain/scope/revision.
- Manifest lookup by domain/scope/contract/digest; component lookup by manifest/component.
- Event delivery claim and lag indexes by consumer/status/occurred time.
- No score/match write-path index or function whose cost grows with retained result, job, auction or publication history.

Every critical query needs production-shaped `EXPLAIN (ANALYZE, BUFFERS)` evidence with large retained histories and contention. The first run establishes the baseline. Provisional targets align with the infrastructure-owned budget: SQL/RPC transaction p95 at or below 1 second and p99 at or below 2 seconds; end-to-end score mutation p95 at or below 2 seconds and p99 at or below 4 seconds. They become release gates only after measurement on matched tournament compute.

## Security, ownership and retention

- Canonical score, event, job, result and pointer mutations run through security-definer functions with pinned `search_path`, minimal grants and definition-hash verification.
- Mobile clients can write only through the gross-only scoring function and read bounded receipts for their authorized scope.
- Directors can request supported recovery/correction operations and read safe state. They do not receive arbitrary table write privileges.
- Worker claim tokens, secret material and full sensitive financial payloads do not appear in user-visible receipts.
- Immutable receipts, job events, revisions and publication history remain retained for the tournament audit period. Partition or archive by policy; never delete history to make live queries fast.

## Migration sequence

1. Inventory installed functions, triggers, grants, owners and current-pointer inconsistencies without changing data.
2. Add receipts and write them alongside existing operations; reconcile before making them authoritative.
3. Add the minimal event and dual-run consumers while existing synchronous invalidation remains measurable.
4. Prove rollback/commit coupling, replay, lag, duplicate delivery and current-pointer compare-and-swap.
5. Move one derived consumer at a time off the live write path, beginning with the paths exposed by Incident 019.
6. Introduce semantic manifests and compare their output with existing fingerprints on retained fixtures.
7. Migrate current selection to constrained pointers; keep immutable legacy history and publish a reconciliation result.
8. Add release dispositions and block activation when a nonterminal job has no policy.
9. Remove obsolete synchronous paths only after physical scoring, worker pause/catch-up, unknown-response and correction drills pass.

## Calcutta correction contract

The pinned source supports an immutable replacement sequence: unpublish, write a complete auction revision, supersede pending/running work and the current result, reset the result pointer, create an unpublished publication revision, then republish and calculate a new result. The workflow preserves existing golf and requires full-row comparison of prices and ownership.

The read-only validation fixture was captured at `2026-09-27T12:26:41.188212Z`: release 139, SHA `b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6`, configuration 2, auction 37, publication 41 `PUBLISHED`, result 424 `OFFICIAL`, 24 purchases totaling $18,500 and 24 final golfers. It is a historical snapshot, not the current live state.

## Proof gates

- `NA-2026-010` and `NA-2026-012`: installed PostgreSQL read/claim/complete/fail and initializer branches.
- `NA-2026-011`: pending-job release disposition and exact carry-forward.
- `NA-2026-017`: semantic component changes and 12/12 R3 preparation lifecycle.
- `NA-2026-018`: unknown operation outcome and stale-intent prevention.
- `NA-2026-019`: bounded scoring plan, large-history behavior and derived-consumer independence.
- `NA-2026-020`: physical-card reconciliation, exact skips, conflicts and no overwrites.

Detailed acceptance, physical-device evidence, assumptions and risks are in `working/backend-requirements.json`.
