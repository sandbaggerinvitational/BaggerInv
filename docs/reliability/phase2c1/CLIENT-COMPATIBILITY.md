# Client compatibility — Phase 2C.1

Status: **PARTIAL**. Candidate backend contracts have local source/injected-handler evidence. A complete isolated Director page and editing replacement has not been established. No hosted, Production, physical-native or browser acceptance is claimed here.

## Evidence and limits

FACT — SOURCE INSPECTED: shipping native source is unchanged by this scoped retirement work. PWA score routes still delegate to canonical persistence, return the existing canonical score/readback response, and schedule only internal derived work. Google archive/outbox completion no longer controls response success.

FACT — UNIT / INJECTED HANDLER: the focused [delivery report](evidence/runtime-delivery-focused.tap) contains **40 passed / 0 failed / 0 skipped**, including 22 new retirement tests. It covers actual imported handler bodies with replaced dependency bindings, canonical DTO mapping, internal fan-out, authentication denial, Final readback failure handling, terminal retired endpoints, and worker-health uncertainty. This does not prove real RPC execution or full application boot. The report was generated from an uncommitted working candidate; a final source-stable certification must rerun it.

FACT — UNIT / INJECTED AUTH: the [Director entitlement report](evidence/director-entitlement-retirement.tap) contains **15 passed / 0 failed / 0 skipped**. It retains account revocation and current lease semantics; denies Passport bootstrap; and tests five invalid canonical configuration cases with an active legacy Passport that must never be consulted. This is not provider or hosted identity proof.

## Compatibility matrix

| Surface | Candidate behavior | Evidence layer | Status / remaining proof |
|---|---|---|---|
| PWA `/api/scoring/current` and `/api/scoring/matches/[matchId]` | Existing canonical responses and permission/rate limits retained; Google callbacks removed; Competition, Intelligence and Calcutta retained | SOURCE; injected handler tests | Scoped contract behavior proven locally; browser, actual API/RPC and full boot not proved by these tests |
| Native Build 10 backend | Native scoring post-commit callback drops two legacy Google sinks and retains three internal sinks; canonical response is not changed by this callback | SOURCE; unit contracts / protected equivalence | No shipping native edits; physical Build 10 compatibility remains NOT PROVEN |
| Director canonical lifecycle POST | Existing supported canonical operation/receipt retained; legacy `mirror` DTO says `delivered:0`, `failed:0`, `pending:false`, `retired:true` | SOURCE; injected handler tests | Commit acknowledgement no longer waits on Google; actual complete lifecycle and isolated page not proved here |
| Live Matches GET | Canonical tournament live view + match authorization matrix for frozen 2026 and future years; existing mapping preserves Best Ball/Scramble/Singles display fields | SOURCE; injected handler tests with actual mapper | Wrong/failed scope denies before fallback; no Google. Real SQL/data parity and hosted surface require separate evidence |
| Production Director console | Existing canonical APIs remain Production-bound and canonical-account-gated | SOURCE; injected overview tests | No Production read or hosted proof. Its current wrappers cannot be pointed at isolated Preview by spoofing environment |
| Isolated Preview Director page | Still selects `DirectorDashboard`, whose legacy `/api/director` GET now returns terminal410 | SOURCE | **Required compatibility gap. Core page/control operation NOT PROVEN; do not report zero-Google Director PASS** |
| Legacy migration/Google worker routes | Terminal410, no provider, credential or callback dispatch | SOURCE; injected handler tests | Retired operation, not a successful replacement. Historical import/fence tooling remains separate maintenance evidence |
| Worker health | Ignores retired Google controls/history; required internal controls and measured queue count determine health | SOURCE; unit mapper | Missing internal observation remains NOT_OBSERVED. Existing Google-only history counts do not prove required-worker health |
| Optional legacy CMS/media/Passport utilities | Old Google-backed dashboard bindings unavailable | SOURCE | No one-to-one canonical replacement established for all convenience/presentation utilities; required functionality must be inventoried explicitly |

## Exact Director blocker

`app/admin/director/page.js` selects `ProductionDirectorConsole` only for Production. All non-Production branches still use `DirectorDashboard`. The retired dashboard GET returns410, so accepting an isolated canonical Director identity does not produce a working core Director console.

Simply rendering `ProductionDirectorConsole` in Preview would not solve this: it fetches `/api/director/production-overview`, which requires an active `production-director-entitlement`. Its defaults call `production-current-tournament-runtime` and `production-cutover-read-control`, both bound to verified Production authority. Tournament Setup and Players & Access routes similarly enforce Production admission. Changing `VERCEL_ENV`, resource URLs, entitlement source, or activation claims to bypass those gates is not an acceptable replacement.

Some safe isolated primitives already exist: bounded canonical tournament/authorization reads, Preview scoring authority read, canonical Finalize and Reopen. But `mutateCanonicalMatchControl` explicitly rejects Preview operations outside the Production scoring-operations path; Mark Live/Lock/Resume/access and several setup/side-game editing surfaces are not transparently available through a page selector.

RECOMMENDATION: finish a distinct isolated canonical Director adapter and capability selection using existing supported canonical contracts, retaining active account/lease, origin, exact database identity and tournament-scope admission. Do not enable controls until their actual supported RPC/security behavior is proven. This is the missing replacement/proof work, not permission to redesign the Director UI or to weaken Production boundaries.

Required proof: page boot without `/api/director` legacy GET; bounded authorized canonical overview; exact isolated identity; rejected anonymous/revoked/wrong-scope/Production resource configurations; actual supported setup/round/side-game operations and readback; unsupported capabilities explicitly denied; unknown worker health remains unknown; zero Google transport. Until then, Director compatibility prevents a complete Phase2C.1 retirement PASS.

The detailed [source design](evidence/director-isolated-replacement-design.md) records available functions and missing contracts. No Director page/source-selection change was implemented in this scoped review.

## Security correction, not a waiver

The first broad diagnostic found that invalid canonical Preview configuration could fall through to a legacy Passport check. An active stale Passport could therefore defeat the intended canonical revocation test. The implementation now returns `DIRECTOR_CANONICAL_AUTHORITY_REQUIRED` for invalid canonical admission and no longer bootstraps an entitlement from Passport. Current canonical account and lease checks remain required.

The existing entitlement test file grew from9 to15 tests: two retired-behavior expectations were rewritten, the live surface guard was updated to separate terminal retired routes, five invalid-config denial cases and one retired-endpoint transport case were added. No test was skipped. The focused fifteen-test pass proves those injected scenarios only; Production-shadow candidate authorization and broader source-stable regression still require their own proof.

## Broad regression adjudication

[Per-test adjudication](evidence/application-failure-adjudication.json) explicitly maps every failure in both diagnostic runs:

- First: 4,153 tests; 3,947 passed; 206 failed; 26 baseline failure identities plus180 new identities.
- Second: 4,159 tests; 3,968 passed; 191 failed; 26 baseline identities plus165 new identities, including5 not in the first diagnostic.
- Union: 211 distinct failing identities, each with classification, actual diagnostic reference, required action and proof limitation.

Both receipts state `sourcesStable:false` / `NOT_PROVEN_SOURCE_CHANGED`. They cannot certify a candidate or demonstrate no new regression. A retained baseline identity is not proof that its cause is unchanged. An obsolete Google assertion is not a pass. Mixed test files retain canonical authorization, score rules, audit, scoping, privacy and no-fallback requirements; the catalog authorizes no file exclusions or security waivers.

Source-stable broad certification remains required after fixtures, exact obsolete assertions and genuine canonical compatibility gaps are resolved. Remaining unadjudicated runtime behavior must not be hidden behind retirement terminology.

## Boundaries

Production, real Google, participant notifications and competitive data were not accessed or changed by this work. No native shipping source or Build11 behavior was changed. Google account cleanup and credential revocation are later owner-authorized actions after hosted/deployed proof and historical preservation. Backup/restore, capacity, full tournament chronology and physical client acceptance remain separate open proof layers.

## Final scoped identity correction addendum

A later reviewer found a distinct admission gap: an explicitly requested invalid Production-shadow candidate could fall through to otherwise valid Preview identity, and administrative callers did not honor blocked authority. The minimal correction is covered by [before/after behavioral evidence](evidence/identity-admission-security-correction.md): new7 tests reproduced6 failures before correction; after correction those7 and21 existing tests pass (28/28). This does not close the isolated Director page replacement gap or substitute for final broad certification.

[Rebind capability semantics](evidence/rebind-effective-capability-fields.md) clarify that retained Google request booleans describe effective disabled code paths, not actual Production secret deletion or credential revocation.

## Final source-stable broad run

The final frozen-source run is **3,971 passed /188 failed /4,159 tests**, with0 skipped. All26 baseline failing identities remain and0 baseline identities are resolved;162 additional identities still fail. Only19 baseline error signatures are unchanged, while7 fail at different assertions/source blobs. Full details and corrected classifications are in [final broad adjudication](evidence/final-broad-adjudication.md) and the [per-test JSON](evidence/application-failure-adjudication.json). The final suite is FAIL; it is not baseline-equivalent and no retired assertion receives PASS credit.

Three remaining canonical candidate routing/failure-injection gaps show restrictive `unavailable`/configuration denial, not observed authorization widening. Supported scope and fixtures must still be reconciled before those requirements are certified. The specific side-game rollback and nested Google-fence source assertions were resolved as retired expectations from exact final evidence; mixed security and canonical cases remain required.

P0-B autonomous delivery is separately PASS at its local required-worker scope. Overall Phase2C.1 remains **PARTIAL** because the isolated Director replacement, actual annual CREATE protocol and broad compatibility/proof work are unfinished. Do not advance to hosted/staging certification from these results.
