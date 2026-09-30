# Independent closure security review

Review after annual and Director runtime source freeze. Result: no new blocking security finding in the reviewed changes. This is SOURCE review supported by scoped local tests, not a penetration test or hosted certification. Final source hashes and final suite/build results remain in the root evidence manifest.

Reviewed tracked runtime changes: Director page, readiness and operations components; annual panel, request contract and server; Odds input handler and client; Odds scope sanitizer; Vercel isolated-branch autodeploy suppression. Reviewed added runtime files: canonical Director client/helper/handler/console, annual client and JSONB request-hash helper, Preview retirement migration290002 and annual migration127.

- No Google adapter/package/credential requirement was reintroduced. Historical resource constants already present in protected server scope remain provenance, not provider invocation. The removed Odds import is terminal410; current verification reads canonical data. No new SaaS or worker subsystem exists.
- Browser adapters carry operation identity, revision and reviewed domain values; no service-role key, private database URL or privileged direct-table access is serialized. The annual hashing module is imported from the server-only annual module, not the browser client.
- Existing annual API activation, origin, entitlement, current tournament scope and actor checks remain. Target year is separate from server-owned authorization year. Source hash/anchor checks make migration drift fail closed. The team lookup uses the existing unique tournament/side key. No RLS/grant or golf/side-game formula change occurs in127.
- New isolated Director API requires canonical active non-impersonating Director entitlement and exact isolated resource identity. Mutation rejects missing/cross origin before authority reads. Server builds actor/scope from entitlement and validates result scope. It does not enter a Production-bound API by spoofing deployment identity.
- New Director receipt resolver is read-only and service-role-only. Existing score/lifecycle functions remain canonical writers; required receipts, snapshots and audit stay atomic. The Preview migration preserves historical job rows, removes delivery enqueue/grants, and adds no direct score-write API.
- Lost response/readback retains the same operation ID and UNKNOWN/COMMITTED status. Explicit known canonical rejection clears only the rejected predecessor and refreshes current authority. Unknown status/body, proxy errors or logging outcomes are not treated as proof of rollback.
- Native shipping source and dependency packages are unchanged. `vercel.json` adds only the isolated closure branch to deployment-disabled branches; no live platform setting is changed.

Remaining limits: full isolated setup/financial/Mark Live/Lock/Resume capability parity remains PARTIAL; three canonical read routing gaps are separately governed. Existing Production-named SQL fixtures do not prove hosted identity/admission or browser usability. New Preview migration revokes old Google worker grants, so application-only rollback cannot recreate retired external delivery; hosted migration/rollback and account-provider proof require a later authorized task. No Production, staging or Google account action occurred in this review.

## Reviewed source identity

Base commit: `4f5be5928a362f77edca375919df55be23695177`. SHA-256 hashes below bind this review to exact local file content.

| File | SHA-256 |
|---|---|
| `app/admin/director/CanonicalDirectorConsole.js` | `95c18ffeca29356b55c4cfba74f1742f1c8b181601f9d9df1f3f7f73cfbe5968` |
| `app/admin/director/ProductionDirectorOperations.js` | `e1275974ece272a3d21d8388322ce4dc2384bbbddee9cae48e5d41513d012635` |
| `app/admin/director/ProductionFutureYearAdministrationPanel.js` | `c477c055f470025ffe5599d40863f8d791d9c54cae6f437fb3df516d803d3017` |
| `app/admin/director/game-center-readiness/GameCenterReadinessClient.js` | `36cdf791369e189da282b2c75c65788a1acdf99c9fc1baf09022c830fd17169b` |
| `app/admin/director/page.js` | `e77826508856cac9ecec28f855b60d514c220cf777ca1e11f434ef36691ad981` |
| `app/api/director/canonical-overview/route.js` | `e667bf29f98f04b4641a71fc96a6c34a3d52260d7cbd63720fe8d14690d83e36` |
| `app/api/odds/inputs/route.js` | `8d2523571aa9a7d6360180b0f080d9e0e498455e4c57b704f85e8732d23c09dd` |
| `app/odds-center/admin/OddsAdmin.js` | `b1ea3e3eaa1fc8994a013cea6b4627cb0c607ce565873e2eddc0f2214bb3e85c` |
| `lib/canonical-director-client.js` | `ad0e4aba8e5fccd46b0af605ee0ace7682a2e05fc8413b95a60cc6ba5f4dcea3` |
| `lib/canonical-director-overview.js` | `2d893243410144767d6655c68007d4014fceb33423df9226571e2fce1df3039d` |
| `lib/future-year-administration-client.js` | `fbed6c828e34eacd3c1ceda20f75e5dae26c69ec12bd84fb5fcbd8e471dbf6fd` |
| `lib/annual-runtime-request-hash.js` | `da6a2faa6800136a99e26b69c6cd2cf4277f9b9b4cac48cf649fcab07160132e` |
| `lib/production-future-year-administration-contract.js` | `627eb61eb98933c88c69955bd9d5538ce6a5488151aa28fe77c8cdff177bdc96` |
| `lib/production-future-year-administration-server.js` | `2487524e49fb51f473273235fa5bc4fdc81941baf101f4db1a6851fc379fda47` |
| `lib/production-odds-calculation-contract.js` | `0b34ede4980698e7e4349142987c50dfc2eb32f75c9b562e7e8826cb32a82739` |
| `supabase/migrations/202609290002_preview_google_runtime_retirement_v1.sql` | `83132af15f70bb86f88c4568fa4ba0d34b4826b6270314c97ac27aba5c326bbc` |
| `supabase/production_migrations/202609300127_canonical_annual_create_contract_v1.sql` | `f1d6a293eaeb56a899d897ed3f182549529f3af4efe2da1dfbfe004f6017ec57` |
| `vercel.json` | `d56924f8c9efa7c2134451f783a765af6cf01823ee79fc70b67ccd8a4c22a58b` |

Scoped test counts at review: Director21/21, Odds inputs4/4, Preview9/9. Retained canonical capability SQL invocation30/30 includes imported utility tests and the Preview test. After the supplemental Odds proof below, seven required capability identities remain PARTIAL; three are PASS_SCOPED and one is optional maintenance. No passing model/source test closes the missing isolated authoring surface.

## Supplemental canonical Odds review

SOURCE review plus13/13 actual local API/PostgreSQL tests: exact isolated admission, active non-impersonated Director entitlement, mutation origin, bounded current read with private checkpoint/claim/input fields omitted, owner confirmation, completed canonical result/current-input verification, role/grant denial, cross-tournament denial, audit rollback, same-job recovery and zero retired delivery. New application code requires the installed retirement marker before mutation. No browser service credential import; no Google client import; no native source change. Hosted identity verification remains NOT PROVEN.

| File | SHA256 |
|---|---|
| `lib/canonical-director-odds.js` | `7170748e7fa8ac4f912e45957910ea990b7ebd4f7de0704c7c82d304fb5a9dce` |
| `lib/canonical-director-odds-client.js` | `d5b4284fb439657726531d704170382e8251440a3648a9634dcb8f73efedc20b` |
| `app/admin/director/CanonicalDirectorOdds.js` | `fa2da3496dd97c3ab485c28ae6ca0a31635578d603f6b5c07c16e47b17c2c0f0` |
| `app/admin/director/CanonicalDirectorConsole.js` | `1f086de85d0d89d1606403a016f49a64d4e773f443e368706e4744372895e4a3` |
| `app/api/director/canonical-odds/route.js` | `5d2063fa161f028faa9235e1806e4dcc253ab22f26c7e8dffbb08f6afc407715` |
| `lib/operational-rpc-contract.js` | `ad32efdf6e0ee2b0c9af0d851c9fe9c66bf22b5971d477f5341ebaa335c93140` |
| `supabase/migrations/202609290003_preview_odds_runtime_retirement_v1.sql` | `430dd6f941791fc132a15cb7cfdf376229566b95d06d2dc6afaad3382fe8cbd0` |

This supplement supersedes the earlier hash for CanonicalDirectorConsole only. Migration003 function/grant restoration requires future rollback review; historical rows are preserved. MaxDuration800 matches the existing Odds worker route, not a new score timeout. No external cleanup was performed.
