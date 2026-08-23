# Championship Odds execution resilience

This contract applies only to the isolated Preview Championship Odds calculation workflow. It does not alter the prediction model, the engine version, Production execution, public Published Odds reads, or Google reporting.

## Boundaries

The Director workflow is deliberately two-stage:

1. A calculation request freezes the canonical Supabase Odds input bundle and creates a durable calculation job.
2. A successful job becomes `READY` for a separate Director publication decision.

Job completion never creates a published milestone and never creates a Google mirror job. Public consumers continue reading the last immutable current-official snapshot throughout a calculation.

## Identity and immutable inputs

`championship-odds-calculation-job-v1` hashes:

- tournament and phase;
- complete frozen canonical input fingerprint;
- Prediction Settings fingerprint;
- engine and publication contract versions;
- checkpoint contract version;
- deterministic seed; and
- supported iteration count.

The resulting SHA-256 invocation fingerprint is the job ID. An equivalent request resolves to the same job; a changed canonical input creates a new job and supersedes unpublished jobs for the older source state.

## Random-stream continuity

`odds-calculation-checkpoint-v1` stores the exact 32-bit state of the existing seeded PRNG after the last completed iteration. A checkpoint also stores raw team/player accumulators, deterministic roster order, total iterations, and completed iterations. Chunks never reseed. JSON/JSONB round-tripping preserves the integer PRNG state and IEEE-754 accumulator values, so chunk boundaries do not change draws or aggregation order.

The synchronous compatibility function and the durable worker execute the same chunk primitive. The synchronous function is one chunk; the durable worker uses 2,500-iteration chunks.

## States and claims

Jobs use:

- `PENDING`
- `RUNNING`
- `SUCCEEDED`
- `RETRYABLE`
- `FAILED`
- `SUPERSEDED`

Only a service-role RPC can claim or mutate a job. Claims use row locks, a unique claim token, and a bounded lease. Checkpoints and completion writes require the current claim token. Expired claims can resume from the last durable checkpoint without repeating accepted iterations. A result commit is idempotent by result fingerprint.

## Publication eligibility

Before publication, the service reloads canonical Supabase inputs and compares the complete input, settings, engine, and contract fingerprints. A changed dependency marks the result stale/superseded and blocks publication. A verified result is timestamped for the actual Director publication operation; the stored deterministic calculation values are not recalculated.

The existing publication transaction and Google reporting mirror remain downstream of the Director publication decision. Publication and mirror retries retain their existing idempotency contracts.

## Failure and recovery

Failures before a chunk leave the prior checkpoint intact. Failures after a checkpoint resume from that checkpoint. A failure after the final checkpoint performs only deterministic finalization on retry. A failure after result commit observes the already-succeeded job and cannot create a second result.

The initial Preview request returns after scheduling server-side work. The Director may close the page. Reopening the same phase/count requests the same deterministic job and resumes monitoring; retryable or expired work is re-claimed through the protected operation.

For certification, the same Director-only Preview route can execute the unchanged synchronous engine against a completed job's frozen input snapshot. It compares the complete logical result and SHA-256 fingerprint without publishing, mirroring, or changing job state. This diagnostic may retain a long request because it is a read-only reference probe; normal calculation requests remain durable and browser-independent.

## Production protection

The calculation API returns `404` unless Vercel is in Preview and the certified Supabase Odds input source resolves successfully. Production keeps its existing synchronous Google-approved behavior. The migration and every job RPC require the literal `PREVIEW` environment and revoke access from public, anonymous, and authenticated browser roles.
