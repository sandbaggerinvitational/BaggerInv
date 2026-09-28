# Phase 1 application regression notes

## Certification result

The compared Phase 1 candidate introduced **no new failure name** relative to the unchanged `b2065c90` baseline in the corrected application selections. This is not a green suite: the server-runtime comparison fails 26 tests in each checkout, and six of those same-named failures report different underlying diagnostics. The result supports a bounded “no additional failing test name” conclusion. It does not prove that every protected byte boundary is unchanged or that the application is release-ready.

The paired results are:

| Selection | Candidate | `b2065c90` baseline | Comparison |
|---|---:|---:|---|
| 493 server-runtime files under `--conditions=react-server` | 4,127 pass / 26 fail / 4,153 | 4,127 pass / 26 fail / 4,153 | 0 candidate-only names; 0 baseline-only names |
| Four ReactDOM SSR files under the default condition | 30 pass / 0 fail | 30 pass / 0 fail | Equal and green |
| Six browser files with the installed Chromium runtime | 17 pass / 0 fail | 17 pass / 0 fail | Equal and green |

The server selection is the 494-file non-PostgreSQL/non-browser application selection with four ReactDOM SSR files removed and the three server-export files added. The selection manifest contains 493 paths and has SHA-256 `83b9d606f8fdf27a8efcc667b3a6e0176bc83108de5c5e2884c7f5f2e10dc684`. Forty-five PostgreSQL integration files remain outside this application certificate and belong to the separate database certification.

## Baseline failure evidence

After normalizing checkout roots, test ordinals and durations, 20 of the 26 common failures have the same diagnostic signature. Six have the same test name but a different first mismatch. The table records the initial comparison assessment, before the independent instrumentation review:

| Test | Candidate diagnostic | Baseline diagnostic | Assessment |
|---|---|---|---|
| Current Calcutta candidate integrity | New `lib/operational-rpc-contract.js` is outside the retained runtime inventory | Isolated-checkout dependency target differs | Same name, different cause; unresolved integrity gate |
| Release 133 source boundary | `production-calcutta-v1` route digest differs | `node_modules` appears as an unrelated runtime addition | Same name, different cause; unresolved integrity gate |
| Calcutta clear scope | `production-net-skins-v1` route is the first mismatch | Historical recovery document is the first mismatch | Same name, different cause; unresolved scope gate |
| Release 134 source boundary | `production-calcutta-v1` route digest differs | Historical PostgreSQL test digest differs | Same name, different cause; unresolved integrity gate |
| PN-1 protected boundary | `mobile-v1-scoring-post-commit.js` differs at the telemetry import | `participant-identity-authority.js` differs at a retained phone-operation import | Independent protected-byte review required |
| PN-2 protected boundary | `production-current-tournament-runtime.js` differs at `observedJsonRpc` instrumentation | `production-scoring-operations-server.js` differs from its retained digest | Independent protected-byte review required |

The complete 26-name set and compact diagnostics are in [REGRESSION-RESULTS.json](./REGRESSION-RESULTS.json). Because a same-named failure can hide a changed cause, aggregate equality alone is not treated as regression clearance.

The subsequent [independent instrumentation review](INSTRUMENTATION-REVIEW.md) inspected all 48 instrumentation files and the five direct baseline/candidate behavioral comparisons. It found no concrete authorization, canonical-operation, cache, payload or privacy regression and classified these six checks as historical whole-file/path freezes incompatible with the explicitly authorized additive Phase 1 instrumentation scope. That review resolves the source-review action; it does **not** turn any of the six failing tests into a pass or certify a deployment. The 26-failure baseline debt remains visible.

The 20 matching signatures include the existing analytics digest, leaderboard UI, mobile identity shape, participant authentication, safe-method evidence, phone lifecycle and custom-code assertions. Their presence in both checkouts establishes baseline existence for this run; it does not waive or resolve them.

## Browser and runtime handling

The initial sandboxed browser attempt was not counted because loopback listening was denied. A second attempt could launch only the test that passed an explicit executable path; four tests still lacked the standard Playwright cache location. The recorded run sets both the installed module and browser-cache locations, allows the loopback fixture servers, and completes all 17 assertions in both checkouts. The browser fixtures abort non-loopback requests, and no external service was required.

The four ReactDOM SSR files were deliberately kept out of the `react-server` process and passed separately under Node’s default export condition. This avoids turning an incompatible export condition into a false application failure.

## Supporting Phase 1 summaries

Existing task-local summaries record 79/79 harness-compatibility checks, 19/19 focused application checks and 17/17 telemetry checks. They are supporting evidence only; they were not substituted for the paired baseline run. Their hashes and source paths are recorded in the JSON result.

## Evidence boundary

The paired baseline source is exact commit `b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6`. Its source tree is unchanged; an untracked `node_modules` symlink supplies the same dependency installation as the candidate and explains dependency-path diagnostics in the baseline. The compared candidate was commit `09042493d6cf6e73f7f18bc56ff19ed7f339ad60` plus the Phase 1 working tree at the recorded run time. Subsequent bounded telemetry job-ID propagation and additional fixture/evidence work were checked by the final focused collector and build. This broad result is not silently re-dated or claimed as a rerun of every final source byte. `LOCAL-EVIDENCE.json` identifies the exact final tested source manifest.

The raw TAP files are temporary local evidence. `REGRESSION-RESULTS.json` retains their SHA-256 values, exact counts, common failure names and material diagnostic differences. No Production database, provider account, staging environment or external endpoint was contacted during this certification.
