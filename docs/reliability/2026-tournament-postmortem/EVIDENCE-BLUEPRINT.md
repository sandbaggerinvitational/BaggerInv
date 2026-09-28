# Evidence system and durable proof chain

This is a proposed evidence policy and proof model. Evidence is an immutable historical observation with explicit applicability, not an evergreen green check. The ledger separates facts, inferences, recommendations, and open questions. Physical owner observations are valid at their layer; an exact backend cause requires correlated backend evidence. No evidence found does not mean an event did not occur.

| Layer | What it proves | What it does not prove | Capture | Storage | Future certification is invalidated by |
|---|---|---|---|---|---|
| SOURCE | Code mechanism or contract at an exact SHA | Runtime correctness or physical behavior | Path, function, lines, and immutable SHA | Versioned documentation and source manifest | Changes to affected source |
| UNIT | Executed deterministic isolated assertions | Database, provider, or device behavior | Test ID, seed, and log | CI artifacts and evidence ledger | Logic or fixture changes |
| SQL/RPC | Actual function, permissions, and transaction behavior on an identified database profile | Client UI or Production capacity | Migration and function hashes, request, rollback, and plan | Restricted test artifact store | Function, schema, extension, or major-version changes |
| API | Authentication, configuration, encoding, error, and endpoint semantics | Phone persistence or the complete chronology | Sanitized request trace and response contract | Test artifact store | Endpoint, configuration, or contract changes |
| INTEGRATION | Components cooperate in the tested topology | Unmodeled network or provider cases | End-to-end trace and bounded state | Test artifact store | Changes to any involved component |
| PERFORMANCE | The measured workload, distribution, and resource profile | Different compute or an unmeasured peak | Dataset, seed, compute, query plan, sample count, and p50/p95/p99 | Benchmark store and trends | Query, index, compute, or history-shape changes |
| FAILURE-INJECTION | The specified fault is contained and recoverable | Every possible fault | Fault profile, key, receipt, and before/after state | Test artifact store | Failure-handling or dependency changes |
| SIMULATOR | iOS simulated UI and persistence path for the named build | Physical radio or device acceptance | xcresult, runtime, and device kind | Build artifact store | Relevant behavior, OS, or contract changes |
| PHYSICAL | The exact physical interaction, OS, network, and build tested | Every phone or untested flow | Device, role, test, expected and actual results, time, and useful photos | Private QA store | Client, contract, or OS changes that affect behavior |
| STAGING | Hosted deployment and configuration compatibility | Production authority or load | Deployment ID, manifest, and smoke result | Release artifact store | Deployment, configuration, or schema changes |
| PRODUCTION READBACK | Bounded canonical state for exact identifiers at a timestamp | History-wide integrity or capacity | Exact IDs, revisions, receipt, and cheap read | Private audit evidence | Later authority changes; the historical observation remains valid |
| FULL LIFECYCLE | Chronological transitions in the exact fixture and environment | A changed candidate or physical behavior unless included | Operation timeline, results, and final invariants | Rehearsal artifact store | Changes to any protected lifecycle dependency |
| OWNER ACCEPTANCE | The owner performed the listed actions | Unlisted SQL, security, or capacity properties | Checklist, interactions, result, and time | Signed review record | Changes to the affected workflow |

## Manifest and proof chain

A release manifest binds the release and activation, backend SHA, Native version, build SHA, schema and function versions, contract versions, fixture version and seed, test-suite results, physical devices, performance baseline and compute profile, known limitations, artifact URIs, hashes, timestamps, and rollback material. The proposed machine-readable structure is [evidence-manifest.schema.json](evidence-manifest.schema.json).

The required chain is requirement → implementation → relevant unit, SQL, API, and integration proof → performance, failure, and lifecycle proof → physical proof when required → release evidence → owner acceptance. A missing link prints **NOT PROVEN**.

A claim generator validates layer, environment, fixture, and freshness. It never fills missing physical evidence. Recommendation confidence is not runtime proof. Performance comparisons require equivalent compute, dataset, plans, sample count, and cold or warm state. A local 2.6 ms measurement and a Production wall-time observation are not directly comparable. An infrastructure-cause claim requires resource, restart, and query correlation; a warning alone supports only a hypothesis.

## Retention and privacy

After owner approval, version control stores sanitized documentation, requirements, architecture decisions, fixtures, and schema. Large CI results, xcresults, video, and query plans belong in private immutable artifact storage with a durable manifest. Canonical operation receipts belong in the audited database or archive. Provider resource data and API and Native operational telemetry belong in a separate observability store with alert and export retention that covers the tournament and postmortem.

The exact provider retention limits and account plan were not verified here. The collector must prove coverage rather than assume it.

The proposed policy preserves release and incident manifests and essential canonical receipts for the lifetime of tournament history. It retains high-resolution metrics and logs for the full tournament period through the postmortem and at least the next dress rehearsal, then tiers or downsamples them after review. Cost, privacy, and contract requirements determine exact raw retention. Raw diagnostic payloads do not belong in hot transaction tables.

Use stable nonsecret identifiers, redaction, and access control. Authentication cookies, tokens, service keys, email addresses, and phone numbers must not enter a public repository or metric labels. Required financial and gross-score facts stay in protected audit records rather than general telemetry. Physical screenshots may require redaction. Retention includes testing artifact integrity, readability, and restore availability; a temporary file's presence is not durable evidence.

## Production evidence boundary

Only deployment health, the actual release and activation, current authority, and explicitly authorized physical acceptance belong in Production. Load tests, chaos tests, synthetic writes, deep plans, historical scans, and full-database comparisons belong in a clone, staging, or local environment. An evidence gap cannot justify a damaging live-primary action.
