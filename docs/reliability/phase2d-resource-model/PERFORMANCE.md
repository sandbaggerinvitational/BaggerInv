# Local ingress performance — complete provisional 131–152 profile

**PROVEN — local PERFORMANCE at recorded source only.** No Production, hosted or network target. The complete declared migration profile is installed in memory; this is not a released installer or complete R2 certification.

Fixture `CERTIFICATION_INGRESS_HISTORY_V1`; PostgreSQL 17.11 (Homebrew), ARM64 macOS; Node v26.7.0. There are 6,800 validated samples, with 100 separate warmup samples excluded. Each primary operation has three batches of 100 samples per scale; fingerprint/close have 100 per scale. Seed: deterministic history cardinalities, random UUID operation identities. Workers are absent. All measured samples are retained. The finite statement timeout remains 5,000 ms.

The method is one real RPC inside a rollback-contained sample with a persistent local socket per batch. Admission, canonical execution (including required terminal outcome/audit), recovery and current reads are measured separately. Complete commit/HTTP latency, internal query count and lock-hold duration are **NOT PROVEN**. p99 is **NOT PROVEN** at 300 samples per primary operation/scale.

| Scale | Terminal history | Samples | p50 ms | p95 ms | Max ms | SD ms |
|---|---:|---:|---:|---:|---:|---:|
| 1× | 432 | 300 | 2.128 | 2.856 | 15.585 | 1.297 |
| 2× | 864 | 300 | 1.936 | 2.767 | 14.040 | 1.166 |
| 5× | 2,160 | 300 | 2.053 | 3.473 | 14.664 | 1.282 |
| 10× | 4,320 | 300 | 1.967 | 2.942 | 17.120 | 1.556 |

| Same-method local control | Before p50 | After p50 | Delta ms | Before p95 | After p95 |
|---|---:|---:|---:|---:|---:|
| 1× | 1.939 | 2.128 | +0.189 | 2.691 | 2.856 |
| 2× | 2.002 | 1.936 | -0.066 | 2.733 | 2.767 |
| 5× | 1.948 | 2.053 | +0.105 | 2.764 | 3.473 |
| 10× | 2.017 | 1.967 | -0.050 | 2.822 | 2.942 |

The 10×/1× execution median ratio is 0.924. Maximum observed statement time is 17.120 ms against 5,000 ms. This is observed query-path headroom, not capacity, contention or end-to-end availability proof.

**STRONGLY SUPPORTED:** no material history-driven growth appears in this fixture. The median does not rise with scale. Compared with the earlier same-method profile, medians vary in both directions; p95 is higher at every scale, most visibly at 5× (+0.709 ms, about 26%). These runs do not isolate the cause of that tail variance or prove identical performance. No systematic history-scale regression was detected; attribution of between-run tail changes remains **UNKNOWN**.

66/68 batch maxima occur on the first call of a new session. A first-call effect is **STRONGLY SUPPORTED** by those positions; session initialization is a **PLAUSIBLE**, uninstrumented explanation. No samples were deleted. Worker correlation was not tested.

All 16 captured exact actor/operation, current-generation, resource and pointer plans use existing indexes and return one row. No new index was added. Top-level statement count is one per sample; nested statement count is unmeasured.

[Raw samples and plans](implementation-evidence/ingress-performance.json), [summary/comparison](implementation-evidence/ingress-performance-summary.json), [tail positions](implementation-evidence/ingress-performance-tail-analysis.json). Earlier profile 147 measurements and failed harness attempts remain preserved. Earlier Phase 2/2C score-only timings are not directly comparable to this durable-ingress method.

Local bounded-history interpretation must be assessed against the actual table above; no Production performance claim is made.
