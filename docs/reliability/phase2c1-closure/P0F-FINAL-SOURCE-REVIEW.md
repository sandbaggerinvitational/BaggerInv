# P0-F final source and security review

Review scope: the approved additive isolated Director API, its browser transport and mounted setup/control/entries/auction editors. Source base is `7b6ca99510dc2f44cc411bfe7769e7f0c05ed962`; exact reviewed file hashes below identify the uncommitted candidate independently of its future commit. The initial review made no runtime edits; the build finding and narrowly reviewed correction are recorded below.

**STRONGLY SUPPORTED — no remaining blocking source/security finding identified in the reviewed scope after the correction below.** This is not a hosted, Production or physical-client certification. The final evidence receipts remain authoritative for executed test totals and source freshness.

## Admission and privilege

PROVEN — SOURCE: POST requires the request's same origin; the route requires active Director entitlement without bootstrap. The server rejects Production, the diagnostic lane, impersonation and caller-supplied authority fields. Resource and actor come from server configuration and authenticated identity. Current exact database binding, resource, ingress, actor and context are independently enforced by the installed SQL gateway. The service credential remains in server-only code. No browser/native raw privileged database client is introduced.

PROVEN — local POSTGRESQL/SECURITY cases: migration130 captures and checks body identity, owners, all ACL entries, search paths, volatility, security-definer attributes and dependencies. Unknown stored dependencies, custom grants, search-path changes and unexpected default grants stop installation. Direct private-core calls are denied to anon, authenticated and service_role. The service-role prepared read spanning installation also remains denied. Protected match-control OID remains unchanged; the setup reader's relocation is covered by the stored-dependency guard and prepared-call test. The positive protected comparison uses unchanged real admission and exact captured pre-migration definitions inside rolled-back transactions.

## Route reachability and unchanged defaults

PROVEN — SOURCE and scoped component tests: `CanonicalDirectorOperations` constructs the provider-neutral transport in a client component and passes it to the existing client editors. The existing Production editor defaults remain `request=fetch`, `isolated=false`, default original Net Skins transport, and `auctionOnly=false`. No server-only module or secret is serialized through component props.

The isolated setup editor suppresses Awards in both navigation and rendering. Auction-only mode prevents configuration transport. The installed entry/API allowlists continue rejecting operations beyond the approved family/action set. No canonical failure falls back to Google. Owner financial publication is not added or automated.

## Build-discovered client boundary correction

The initial static review missed a transitive client import: `CanonicalDirectorMatchControls` imported the action selector from `production-director-console.js`, which also reaches server-only draft/Calcutta modules. The local Next build correctly rejected this boundary. The failed build is preserved as `evidence/p0f-approved/build-attempt-01.json` and `.tap`; it is not a passing result.

PROVEN — SOURCE/UNIT: the unchanged `productionMatchControlActions` implementation now lives in import-free `lib/match-control-actions.js`; the existing server module imports/re-exports it, preserving its public API. The extracted function body is byte-identical to the base implementation (SHA-256 `a1602234014a887616670d76fd2d10b0d2f74f8bf87de8d701b346bb5ae5a218`). No server-only marker, privileged code or authorization moved into the browser. The isolated editor retains `Confirm Change`; the default Production editor again shows its pre-existing `Confirm Production Change` label. The fresh workspace receipt is PASS, **17/17**, including the client import boundary, unchanged action semantics and default/isolated behavior. The final build receipt, once rerun, supplies the independent bundling proof; these source/unit checks do not substitute for it.

## Unknown-outcome containment

PROVEN — SOURCE plus scoped behavioral component/API tests: the isolated setup editor retains the reviewed operation UUID after an attempt and disables reload, restaging and discard until confirmed. Net Skins entries retain the exact values and operation identity, prevent editing of the pending round and avoid cross-round refresh/remount discarding it. Auction-only editing retains its pending request, disables editing/discard/reload and retries that same request. Match controls retain the reviewed UUID and disable cancellation while uncertain.

A repeated transport attempt first resolves the exact existing receipt; UNKNOWN does not cause a blind execution or new operation identity. Fresh current authorization permits status lookup using the old token as receipt identity only. A matching committed receipt remains distinct from successful current readback. The UI confirms only verified canonical response/readback. A rejected retry is conservatively not treated as proof that an earlier request failed to commit.

Operational logging is best effort and separate from required canonical receipts. Errors remain local to the Director capability; no session-reset or Google fallback branch was introduced.

## Limits and retained risks

- UNKNOWN state is deliberately held for receipt reconciliation. An absent receipt alone does not authorize a new mutation or abandonment; this review does not invent a broader Round Control recovery protocol.
- These Director review identities reside in component/transport memory. Recovery across browser/process destruction is **NOT PROVEN** by these changes; no durable browser queue is claimed.
- Handicap authority/readiness/Prepare is covered; this work does not add isolated handicap-index authoring, annual governance expansion, financial configuration or publication.
- Hosted authentication middleware, staging resource registration, full Director usability, physical devices and Production behavior remain **NOT PROVEN** here.
- The current application still requires its canonical database. Google retirement is not database failover or backup/restore proof.

## Reviewed file hashes

| File | SHA-256 |
|---|---|
| `app/api/director/canonical-operations/route.js` | `cbc0446b5fd60f7f867531fa64126a65891e6df66a153379897765c91760078c` |
| `lib/isolated-director-operations.js` | `ddaffca05a3f5cd7642181cdcf2b58e06e8f717fd893549357c2b54326929541` |
| `lib/canonical-director-operations-client.js` | `9e0ebd1bf00084dec8e9daf0251223427e52ca88bdd55a158f708195e51dd3b8` |
| `app/admin/director/CanonicalDirectorOperations.js` | `901b4934a730901f023900d2c1eb154db0fae0df2cf68d44a02b2f7162ec07ae` |
| `app/admin/director/CanonicalDirectorMatchControls.js` | `d95bdefcebf97fa865c71e8537e505c1eb41372994e0d6f2c46d065078c6bd8c` |
| `app/admin/director/ProductionTournamentSetupPanel.js` | `8f3bccc19e52e3f3bd31433562559d2e0d3fbed4fa5643b34a9b0caeb55612b5` |
| `app/admin/director/ProductionNetSkinsEntries.js` | `17316d02d8c0c270dc8e23516e6bcb5c4534b31997148666ec61c21665e825ef` |
| `app/admin/director/CalcuttaManagementEditor.js` | `57453ecea40e7ad0a70e0a1f54799623a89c02ef9918897fcfc8ea229b0f2ae5` |

| `lib/match-control-actions.js` | `e6df4c31b18192d9bb39c07a2dfcacdcabcb36d9855e3531b189a38d98b38983` |
| `lib/production-director-console.js` | `3a4249fc86b6cda05cdd1b29d835cfe9ce66297e0765c97147da3d68dcdc16f5` |
| `test/reliability-p0f-director-workspace.test.mjs` | `f67985334d472f8f7bbc66d9f31c34fa779e4f5601e163e0c6643d4d812bf365` |

Supporting proof: `P0F-SETUP-CONTROL-SECURITY.md`, `evidence/p0f-approved/protected-equivalence.json`, and the final `setup`, `capabilities`, `workspace`, `api`, `context`, `financial` and `release` runner receipts. Failed protected-fixture attempts are preserved separately and are not counted as successful suite runs.

Boundary declaration for this review: Production queried/mutated/deployed NO; real Google accessed/changed NO; native shipping source changed NO.


## Historical two-adapter review before final History RPC approval

The exact two-file diff was independently reviewed against the subsequent owner approval. History derives read eligibility/provenance only from `state.productionShadowCandidate === true` and the existing validated diagnostic helper; its fixed2026 and ordinary isolated/cutover branches remain intact. Prediction explicitly requested diagnostic handling now precedes ordinary selection, returning only exact eligibility/reason/project and no fallback. No new RPC, role, SQL object, credential exposure, write/control/publication authority or fabricated cutover metadata was introduced.

No-network proof: existing routing42/42, retirement45/45; focused and existing adapter compatibility selection100/101. The sole required failure is the actual History reader choosing an unrecognized diagnostic RPC name before fetch. That separate adapter remains byte-identical toHEAD; the exact correction is proposed, not implemented. Broad4077/20 retains20 established baseline failures, and buildPASS. The new44tests are outside the fixed493-file broad selection; none was skipped or relabeled expected-red.

Reviewed source hashes:
- `lib/history-2026-read-source.js`: `ef18033f26d62158821b17d4bb9aa3c2f9297025c0dfaff8bfa9996bc5587df8`.
- `lib/prediction-input-bundle-source.js`: `3b77beb0362d0a735952ba0e27c3e9c726465ff2f8daf07ac4c763b1ce6febd1`.
- `test/reliability-p0f-read-adapter-extension.test.mjs`: `bbef5a83b3183a9df3b20cf146207ba49d1475f03c4b0947d491826ebe02ea69`.

## Final History RPC approval extension review

PROVEN — SOURCE: the final diff is confined to the owner-approved `lib/history-2026-supabase.js` routing correction. The flag comes from validated canonical source, not caller options/JSON. Fixed2026 target/year validation remains before RPC choice. The existing translator independently validates the context; its allowlist and all SQL/role/RLS authority are unchanged. No cutover metadata or mirror flag is fabricated. Ordinary isolated and actual-cutover RPC/body semantics are unchanged. Independent review found no additional adapter or policy change.

PROVEN — LOCAL API-ADAPTER/UNIT:112/112 source-bound adapter tests pass, including55 focused cases with all original44 identities preserved and11 added. The formerly required History transport failure is now positive behavioral PASS, not an expected-red waiver. Actual History service produces the sanitized public DTO from synthetic canonical data, preserves24matches/46scorecards/828gross values, and strips private fields. Guide, leaderboard, completed-history and player-editorial adapters are exercised. Denials and local error containment are retained. Transport is mocked under remote-socket denial; this is not hosted SQL or Production proof.

Current exact hashes:
- `lib/history-2026-supabase.js`: `0c119b587548cbf62b5411da4483fe8d4c0fdf45efc38cda7893647f8d7984c9`.
- `test/reliability-p0f-read-adapter-extension.test.mjs`: `55713693c8a92139d5fce808103085c04ad12b947d5875f0bb2820d829d6c7d7`.

The preceding100/101 result and old test hash are historical and preserved in `evidence/p0f-approved/pre-history-rpc/`. Refreshed routing42/42, security84/84, retirement45/45 and buildPASS supply the final affected proof; broad totals and unchanged diagnostic comparison are in the final evidence index.

## Packaging whitespace check

The staged check also includes previously untracked files. One extra blank line at the new pure helper EOF was removed without changing its function body. Workspace, retirement, broad and build receipts are rerun for the resulting byte hash. Verbatim raw TAP records and the preserved rejected-proposal unified diff retain their original whitespace as evidence; the source/document hygiene check excludes only those recorded artifacts and reports the exception explicitly. Their receipt hashes remain authoritative.
