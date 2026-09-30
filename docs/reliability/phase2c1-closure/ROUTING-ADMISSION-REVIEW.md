# Canonical read routing — review boundary

Status: BLOCKED ON EXPLICIT OWNER CONFIRMATION after two automatic approval-review rejections. No rejected mutation executed. This is a concrete design review, not implementation evidence.

## Reproduced failures

The retained diagnostic read lane already has request-bound host, commit, project, Auth, captcha, rate-limit and exact server-transport checks. `scoringShadowRpc` independently translates only allowlisted read RPCs and rejects mutations. Scoring endpoints invoke the separate read-only mutation rejection. Retirement's generic selector stopped recognizing this lane, so supported canonical reads are rejected before those adapters execute.

`evidence/before/routing.json` contains the original six failures in the two selected files, including all three unresolved routing/proof gaps. `routing-safety.json` contains new expected-red tests using entirely synthetic credentials and denied sockets. One additional source-level boundary defect is identified: an invalid requested diagnostic lane can currently fall back to otherwise valid ordinary Preview selection. That must remain blocked in the intended replacement.

## Proposed narrow change

1. Recognize the existing exact **read-only** diagnostic authority in `canonicalReadEnvironment`; a requested invalid lane must fail closed instead of becoming ordinary Preview.
2. Remove live Google configuration as a prerequisite for that lane. Keep database provenance identifiers as immutable historical keys, never as Google credentials or authority. Preserve existing diagnostic response fields where possible; no consumer API shape change is required.
3. Use canonical scoring terminology/configuration. The independent scoring-mutation blocker and the RPC write denylist/positive read allowlist remain unchanged.
4. Explicitly deny Odds publication whenever the read-only lane is selected, even if a caller supplies a publication variable.
5. Update the request overlay and synthetic fixtures consistently. Do not change ordinary isolated or Production activation authority, RPC grants/RLS, actor admission or canonical score transactions.

## Required security proof

- Exact positive canonical read with no Google configuration.
- Each host/SHA/project/Auth/credential/captcha/rate-limit/resource mismatch denied.
- Requested invalid diagnostic lane cannot fall back to Preview.
- All named scoring, control, Finalize, Reopen, job, import and publication RPCs denied before transport.
- Existing request-origin and read-only scoring contracts retained.
- Actual service adapters reach canonical outage classification without any Google attempt.
- No actual Production or Google request: all transport is mocked or denied.

The first rejected proposal incorrectly represented retired workbook admission with an unconditional approved boolean; that approach is discarded. The later rejection also cited authority semantics and a diagnostic API change. The final proposal does not fabricate approval and should retain compatibility fields rather than changing that API merely for naming.

No approval has yet been recorded. Other authorized annual and Director work is independent and can continue. P0-F cannot be certified while these routing gates remain unresolved.
