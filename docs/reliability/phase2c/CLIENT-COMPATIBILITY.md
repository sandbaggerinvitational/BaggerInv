# Client compatibility proof boundaries

## Current proof snapshot

Generated 2026-09-29T21:40:11.927846+00:00. These labels apply only to the selected current-source artifacts. They do not close the overall phase or approve deployment. Pending/stale receipts remain NOT PROVEN.

| Proof | Current artifact validation | Scope |
|---|---|---|
| Recovery50 and current candidate DTOs | PROVEN_LOCAL | Real local SQL/API; injected provider identity/transport |
| Retained Swift24 decoder checks | PROVEN_LOCAL | macOS models; UTC; no native HTTP/queue/UI |
| 1×/2×/5×/10× after supported Lock | PROVEN_LOCAL | Local indexed receipt lookup; not Production capacity |

Detailed validation reasons are retained in the review package [recovery scope review](evidence/recovery-scope-review.json); final checked-in reports must link the corresponding durable execution artifacts.

The exact final counts and source identities live in [recovery execution](evidence/recovery.json), [recovery details](evidence/recovery-proof.json), [Swift decoder evidence](evidence/native-decoder-proof.json) and [protected annual execution](evidence/annual-admission-run.json). A retained passing decoder run applies only to the recovery DTO artifact hash it records; rerun it when that artifact changes. No table below turns a pending rerun into PASS.

| Capability | Implemented/tested path; final evidence required | Limitation |
|---|---|---|
| Existing PWA save/replay/conflict/next-hole | Shipping persistParticipantScore → local transport → actual candidate SQL (PWA/PWA-REPLAY) | Identity/context are supplied test boundaries; not browser or hosted Auth |
| Lost PWA response | Required current cases: actual commit → injected response loss → supported Lock/Finalize → actual status handler/readRPC; new PWA adapter writes remain denied | Existing UI does not yet call status automatically |
| API process restart | Actual submitting adapter child exits without response; fresh handler child resolves committed receipt | Local IPC and Unix-socket transport, synthetic current identity; not deployed HTTP lifecycle |
| Mobile score DTOs | Shipping mobileScoringHoleResult → shipping persistence adapter → actual SQL for BB/SC/SI | Actual backend model contract, not native transport/session/queue/UI |
| Retained Build10 model | Real Swift JSONDecoder and isContractCompatible(for:) over accepted/replay/negative acknowledgement and MobileErrorResponse cases | macOS model integration; separate final24-check artifact, including conflict and actual SQL57014 error DTOs; no simulator/physical proof |
| Native default-off admission | Existing PN2 compiled-route inventory and actual recovery factory deny before provider calls | Success paths still use isolated provider boundaries |
| Existing Director control | Real match Lock/Finalize and whole-round Lock used with receipt recovery | Not Director browser usability or full Open/Prepare chronology |
| Future tournament dispatch | Real annual guards and dispatcher accept 2099 scoring/Lock/recovery across compatible release | Synthetic annual authority construction; not the full annual setup lifecycle |

SOURCE INSPECTED: compared with Phase 2 base b1ceaa89, the shipping PWA persistence adapter, mobile score presentation/DTO implementation, and current PWA/native identity resolvers are unchanged. The scoring-authority adapter and Production dispatch registry receive additive operation entries. Migration122 changes the two score receipt INSERTs to retain immutable origin; it does not change score request/response, formulas, revision-aware corrections or replay admission order. Runtime shape compatibility still depends on the specific cases executed above.

## UTC and native lineage

PROVEN in the retained non-UTC counterexample: PostgreSQL emitted a valid timestamp with -05:00 and the unchanged retained MobileTimestamp decoder rejected it as invalidTimestamp. The backend DTO did not rewrite it. See [counterexample](evidence/native-timezone-counterexample.json). Compatibility is conditional on an explicitly UTC database/session profile established before scoring; do not rewrite recorded JSON to obtain PASS. Hosted staging must check its actual session timezone. Production timezone has not been queried.

The retained decoder model's Build10 lineage is STRONGLY SUPPORTED by contemporaneous provenance and matching retained copies. Its exact source hashes and actual Swift execution are PROVEN for those retained files. The pinned native Git object is unavailable. Neither establishes a physical device result or execution of MobileAPIClient, queue persistence or navigation.

## Supported environment and rollback

The new recovery operation uses current Production scoring/read authority (or its protected annual dispatcher). There is no new Preview scoring-authority RPC. The legacy scoringShadow adapter fallback cannot be assumed to make this Production-scoped endpoint available in a generic Preview environment. An isolated hosted rehearsal must explicitly configure and verify its safe candidate authority/transport; never relax Production guards or point it at the live database for a test.

Old clients keep the unchanged score contract against the candidate database. The local tests actually execute those unchanged adapter/DTO modules. This is narrower than booting an entire old application artifact against 124: that mixed-version application rollout/rollback has not been rehearsed. The new recovery route is unavailable again if its application code is rolled back; old clients never consumed it automatically.

Retain the additive nullable origin column and accepted receipts during application rollback. Retain compatible worker delivery or deliberately stop it with visible durable backlog; an old worker must not be assumed to understand 124 retry/dead-letter policy. Existing 121 INSERTs name columns explicitly and can omit the nullable field at source level, but restoring those SQL bodies would cause new receipts to remain unbound/UNKNOWN and change the certified manifest. Dropping the origin column while patched submitters reference it would break accepted score commits. A database reversal requires a separately reviewed and tested function/manifest/worker package; a forward correction is safer than an unreviewed single-function reversal. No operational rollback PASS is claimed.

Build10 queue/navigation, hosted Auth, physical scoring, full tournament usability and 2027 readiness remain separate requirements. Current clients' compatibility does not mean that they now implement recovery UX.

## Exact current compatibility additions

The three existing final-hole format cases now require the actual PWA status handler and denied new write through the unchanged persistence adapter after supported Finalize. This strengthens existing cases; it does not add an implemented PWA recovery UI. The three mobile DTO cases now also invoke an actual conflicting mutation and an actual canonical RPC blocked until an isolated25ms statement timeout. Existing backend error mapping is retained: idempotency conflict→409/IDEMPOTENCY_CONFLICT; SQLSTATE57014→500/INTERNAL_ERROR. That generic timeout presentation is unchanged, not repaired by decoder compatibility. The retained Swift MobileErrorResponse decodes these exact candidate payloads only when the current24-check artifact validates.

## Explicit compatibility classification

BACKWARD COMPATIBLE BUT DOES NOT USE NEW RECOVERY: the tested unchanged PWA adapter and retained Build10 model/UTC contract continue to accept their supported score shapes. The existing clients do not automatically adopt the additive recovery endpoint. This is not native HTTP/queue/UI or physical-device proof. No broad client-runtime compatibility PASS is inferred.
