# Phase 1 final source and evidence review

Reviewed: 2026-09-28. Reviewer: `/root/phase1_quality`. Baseline: exact Release 139 `b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6`. Scope: the current uncommitted Phase 1 checkout, not a deployed service. No PostgreSQL cluster, provider request, build, Production action, or commit was performed for this final review. Only this report was edited.

**Verdict: no unresolved blocking source-boundary or privacy defect identified in the reviewed scope.** Final measurement, plan, overhead, build and certification receipts are being completed separately; their pending state is not treated as a source defect or converted to PASS here. This review is not tournament certification.

The reviewer independently inspected the application instrumentation, correlation SQL test and resource helper. Earlier in this task the reviewer implemented the NA-017 and benchmark-validation corrections below; their verification is test evidence, not a claim of independent authorship review.

## Source boundary and privacy

The tracked application diff contains instrumentation around existing handlers, authorization/context work, RPC transports and calculation/post-commit phases. Inspection found no new authorization decision, canonical SQL call, retry, provider request, scoring rule, authority lookup, or RPC payload change. Existing application status/body/error mapping remains in the original handlers/adapters. Correlation adds a UUID header to private responses and existing RPC calls; shared-cache responses omit the attempt-specific response header. No tracked `supabase/` or `candidates/` source differs from Release 139. Native application behavior is not changed; vendored native code is a test input.

Telemetry uses a fixed event allowlist and bounded identifiers, typed codes and hashes. It excludes arbitrary payloads, SQL, URLs, headers, exception messages and stacks. Identifier syntax alone cannot establish that a caller-supplied string is nonpersonal: the documented caller contract and restricted retention remain necessary. Sink exceptions are contained; console durability, exporter configuration, access controls, retention and synchronous sink latency remain unproven. RPC acknowledgement remains distinct from independent canonical readback and pure database time. The existing paired regression evidence retains 26 failures on each side and the reviewed byte-freeze differences; this review does not relabel those failures as passing.

## Corrected findings verified in source

- NA-017 formerly accepted missing operation IDs, empty dependency objects and changed golfer-to-match assignments. It now requires the operation UUID, six reviewed dependency revisions, exact participant/team/course/tee mappings and independent canonical lifecycle counts. Supplied-evidence consistency does not authenticate the evidence's canonical origin.
- Benchmark RPC output formerly passed with `null` or malformed success evidence. The shared result contract now requires `ok:true`, rejects partial failures, validates SQL input shapes/boolean scalars, and checks every captured timed result. Score samples additionally require `code=ACCEPTED` and reject `idempotent:true` or `semantic_noop:true`, matching the installed score SQL contract. Timed SQL is unchanged; validation occurs afterward and raw result payloads are not written into errors or evidence. A failed batch cannot return successful timings.
- Query-plan capture now uses the same lifecycle database selection as the latency harness. A successful plan row requires both a valid operation result and at least one captured plan.
- The evidence collector now includes incremental SQL and candidate SQL in its source inventory, covering the additional installed fixture inputs.

## New SQL and resource proof

`reliability-score-history-postgres.integration.test.mjs` exercises the actual score function with 10x history and zero eligible compatibility receipts. A stable failure-injection function detects any irrelevant historical fingerprint evaluation; the historical compatibility implementation must fail and the Release 139 implementation must accept the mutation while preserving gross/strokes/net results. This proves the selected ineligible-receipt branch, not every eligible recovery branch or a latency SLO. All test transactions remain local and rollback-based.

`reliability-correlation-postgres.integration.test.mjs` binds two distinct request IDs to one unchanged mutation ID, invokes the actual SQL function, reads exactly one matching receipt and verifies idempotent retry without changing that receipt. Its synthetic fetch bridge deliberately omits hosted authentication/network behavior. Both attempts and readbacks occur inside one transaction, later rolled back: this is not durable or cross-session commit proof. The test correctly leaves RPC `canonical_readback=NOT_OBSERVED` despite its separate test readback.

`measurementResourceSnapshot` uses the owned local SQL helper and selects the current database's counters. Snapshots run outside timed samples. Their documented limits correctly distinguish cumulative/possibly delayed buffer and transaction counters from physical IOPS, peak resource use or provider headroom; `track_io_timing=off` prevents zero timings from being described as zero physical I/O. Host load/free memory includes unrelated processes.

The diagnostic CLI remains plan-only. The injected adapter has no credential loader or operational Production entrypoint. Catalog regex checks apply to trusted repository definitions, not arbitrary SQL. Timeout cancellation depends on the client; dedicated restricted roles, pool limits and a gateway remain future deployment controls. Raw database credentials can bypass this tooling.

## Verification and final artifact assembly

Final focused execution: **20 tests passed, 0 failed, 0 skipped** across `reliability-benchmark-results`, `reliability-readback` and `reliability-observability-review` (approximately 154 ms). This included the new accepted-score/replay/no-op checks. The two SQL tests above were source-reviewed here, not executed by this reviewer; use their separately recorded collector results.

The repository has the telemetry schema/coverage/privacy contract, diagnostic catalog/budget, benchmark fixture and baseline, processor evidence, architecture baselines, Never Again fixtures, regression comparison, evidence index, traceability and next-phase recommendation. Before final delivery, the owner should finish the already scheduled receipts, link the correlation SQL evidence in the index, merge NA-019 as the sixth Never Again catalog entry, and refresh report numbers/digests to those final receipts. The final source manifest and secret scan must describe the final bytes. These are known assembly steps, not newly discovered implementation defects.
