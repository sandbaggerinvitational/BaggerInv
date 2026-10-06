# Certification Calcutta publication path

Local remediation of the Part 2B-2 publication gap. Base source: `2a002dfd526d04a3dc6060cfc47c8f4938c01c16`. No hosted connection, mutation, deployment, Queue publication, supervisor START, financial facts or Part 2C execution occurred. The hosted OFF/disabled/paused checkpoint is preserved owner-provided evidence, not a fresh hosted read.

## Shipping contract and correction

`POST /api/admin/production-calcutta-v1` checks `VERCEL_ENV=production` before authentication, then the Production cutover/request guard and active Director entitlement. The server resolves the fixed resource and tournament, validates configuration/auction/publication CAS fields and calls `publish_production_calcutta_v1`. Its Production route and server adapter are unchanged; the actual Preview handler still returns 404 before authentication or database access.

The installed publication ledger publishes an auction policy, `DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET`. It does **not** contain a result UUID. Immutable results and their current pointer are separate. Publication preserves the calculated result and its mathematics; subsequent lawful recalculation for the same published auction does not require a duplicate publication revision. The shipping participant projection carries explicit freshness/stale/updating and lifecycle-compatibility semantics. Those semantics are unchanged.

The existing Certification gateway now admits only `DIRECTOR.READ_CALCUTTA_PUBLICATION` and `DIRECTOR.PUBLISH_CALCUTTA` for the fixed `CALCUTTA_PUBLICATION` family. It invokes the same private `production_control.canonical_publish_calcutta_v1` used by the Production wrapper. A null context retains the existing Production runtime guard. A Certification context must be a live canonical marker with Director phase, exact registered resource/project, bound release/deployment, current revisions/generation, active entitled Director, and admitted ingress. Director admission must be enabled using the existing owner controls. A bare service-role credential supplies none of that Director authority.

Certification additionally requires a calculated result that is current for the configuration, auction and canonical source fingerprint. It locks access/setup and match source rows in the existing lifecycle order, then the Calcutta current row, before comparing the result and publishing. Missing calculation, stale result, wrong source, wrong auction and stale publication CAS fail closed. This Certification predicate does not change Production's ability to publish auction policy before calculation.

The browser submits an operation UUID and existing context token through `/api/director/canonical-operations`. The exact seven publication expectations are:

```
expectedConfigurationRevision
expectedConfigurationFingerprint
expectedAuctionRevision
expectedAuctionFingerprint
expectedPublicationRevision
expectedResultRevision
expectedSourceFingerprint
```

These are comparisons against server-selected current state. Clients cannot supply result UUID/payload, tournament, resource/project, deployment/release, Director identity, SQL/function/module, publication policy, or arbitrary operation name. The server derives the fixed family/action, actor and resource-bound request fingerprint. The domain core emits the existing `CALCUTTA_V1_PUBLISH` receipt and both publication audits. The ingress ledger reconciles that actual receipt; it does not fabricate a committed outcome. Exact replay and fresh identical confirmation create no duplicate revision; conflicting operation replay is denied.

## Participant read and financial boundary

Certification's former Calcutta alias reads legacy configuration, which cannot represent the canonical full-net publication. The new fixed `READS.PUBLISHED_CALCUTTA` alias therefore calls the same private projection core as `read_production_calcutta_frozen_2026_v1`. Only a server-resolved active tournament participant is accepted; observer/target/source/authority fields are rejected. `/api/leaderboards/calcutta` selects this canonical read only after the existing exact Certification read authority and authenticated identity checks. Production and ordinary Preview retain their prior route selection.

The unchanged installed policy intentionally discloses the published market's prices and ownership fractions to active participants. Unpublished market/result facts are withheld. Private tables, receipts, claim tokens, internal source trees and supervisor state remain unavailable. Opaque fingerprints and freshness fields already in the shipping DTO remain included. Web and participant/mobile DTO validation pass on the actual owned-database projection. No RLS/policy/table ACL or role expansion is made.

The Queue worker remains calculation-only. No worker RPC alias, engine identifier, processor, claim/lease/backoff/attempt rule, or Queue message changes. `publish_production_calcutta_v1` stays forbidden in the Certification worker adapter and all four new helpers have owner-only execute ACLs. The inherited publication enqueue is retained: with the already-current calculated result it returns `CURRENT`, creates no new work, and creates no Odds demand.

## Local proof

The runner strips real credentials and rejects remote sockets. Owned PostgreSQL 17.11 runs actual pg-safeupdate. The proof provisions the reviewed synthetic fixture, preserves empty auction revision 2, creates Director purchase/ownership successor 3 (P01, price/pot 1, P12 ownership 100%), and uses real match scoring-lock transitions to advance the source. The installed Queue SDK callback, private consumer, common worker, canonical claims and existing Calcutta processor create immutable UNPUBLISHED result A. The canonical provisional calculation produces value 0.4 from the installed fixture rules; no financial/scoring mathematics is changed or manually fabricated.

The actual Director HTTP handler and server adapter publish A, preserve its calculation, emit receipt/two audits, and advance the publication pointer. Source advance makes an A publication request fail. Autonomous local native-SDK model calculation creates B and Director confirmation succeeds without republishing the already-published auction. A and empty revision 2 remain immutable history. Published auction edits remain denied by the existing financial lock.

Focused cases include missing result, exact/conflicting replay, stale result/source, auction/result/publication CAS, both participants/signed-out/anon/ordinary authenticated/wrong Director, bare service role, worker denial, wrong resource/project/deployment/release, Production/old-Preview-shaped contexts, development/Production identity, private helper/table ACLs, permitted participant projection, rejected reader injection/nonmember, lost application ACK reconciliation, complete drain and STOP/disabled/paused.

Evidence: `evidence/focused.json`, `evidence/focused.tap`, `evidence/domain.json`, `evidence/application.json`, `evidence/application.tap`, `evidence/build.json`, `evidence/build.tap`. Each runner records source hashes and whether source remained stable. The frozen application selection preserves the established 20 failures. The 864-hole run is unnecessary because domain/scoring mathematics is unchanged.

Validation result: **103 focused tests passed; 4,077 broad tests passed with the same 20 established failures, 0 skips and 0 new failures; production build passed.** All three source snapshots remained stable. The broad raw runner exit is 1 because the established failures remain; its baseline comparator accepted the unchanged failure set. No 864-hole run.

## Forward install

Artifact: `supabase/production_incremental/certification-calcutta-publication-v1.sql`.

One transaction takes the existing admission lock and requires exact Certification registration/physical project/database, supervisor OFF, admission disabled, ingress paused, no unresolved admitted/UNKNOWN ingress, and no Production resource/activation. It checks **all eight** original body hashes before creating any helper. Only exact old/new hashes are accepted. Four owner-only private helpers are created, and eight reviewed bodies are replaced using their existing function definitions, preserving OIDs, owners, ACLs, SECURITY DEFINER modes, search paths, language, volatility, parallel and strict properties. New helper hashes/owners/ACLs/search paths are checked. Replays converge; predecessor mismatch rolls back; private helper ACL drift fails rather than widening or silently repairing privileges. Existing v1-v7 and attempt-cycle installation history remains intact. No historical migration/bootstrap is edited.

| Function | Exact predecessor SHA-256 | Corrected SHA-256 |
| --- | --- | --- |
| `public.publish_production_calcutta_v1(jsonb)` | `8d7bdb91712cda908bc546ba2772eab47079d7468e05bde77716ce8fead649cd` | `79af55b9f11f693944b11f36b5cdc422f130ae8647d503f3baf76ca05a56cde7` |
| `production_control.certification_operation_phase_v1(text,boolean)` | `a3f81f1b3bc2570313115fce2a9b1ab85d691eb94cbc58586fda7925fa8e5059` | `0b9d4cad7e0870e1a2a163d8eb48dabc1d5a0061e05c34a07ff73ae7aa5fc69b` |
| `production_control.certification_ingress_required_v1(text)` | `8c21bbe56b306995dc8451b2889c6d0c332a2136f5ef6ae77894ef01197bd916` | `be5c6cc54f60443bc6bdd32f8e86ac71ec12f47395b0597f3a7c2e8aa6c9c8ab` |
| `production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean)` | `54a2c792062a83a7eccda779bf5364852aa58e78995d5e6f658be6b74beb4204` | `8dea95b16851cbb1b972cd66ce85fe4573ce4941c4a870f7fe5cf83da5cb59de` |
| `production_control.certification_ingress_canonical_receipt_v1(production_control.certification_ingress_leases_v1)` | `e5fd779ec34e89796c49e7bd4fdab33f7a3084d7ffc111500c992c05b24d9419` | `8a72561e4555af046c10f434474670ac693acd4ae489dedaa93ca62bf8ced0aa` |
| `public.read_certification_director_recovery_material_v1(jsonb)` | `be0134c5cf95c57d56123b7a41185ef8c12f43dd314b3ac180327cf5f6875b05` | `32d5ad0f97373e7e3ca4143a88fdfdcbd9f9bce1056c7a771e3a60ea5de55aca` |
| `public.read_production_calcutta_frozen_2026_v1(jsonb)` | `00ee60cdd4e4a7db4be3bac4f110e46c7af266e1bea6a8926c7c4798f04e2d31` | `cfb40103bd3d7402dcb3da3160308cc72bf536773666ef7eca28d4ece3367a25` |
| `public.read_certification_projection_v1(jsonb)` | `06c9133ed64cce969baa6f56de6533b4e5386fa1b9ed0ea38089870e84764504` | `b2a5f297dc9b07dddb10de715b6adb4677b7738ffe6fd118253c5deab46c1bee` |

## Odds relationship (inspection only)

Calcutta publication is **not** an installed Odds prerequisite. The inspected Odds source contracts bind prediction settings, ratings, pairings, leaderboard/match state and their source fingerprints; they do not require a Calcutta publication. Odds still has a separate checkpointed processor and is not added to the Queue engine registry here. No Odds execution or remediation occurred. The next hosted run must independently satisfy its existing supported execution-path gate before executing Odds.

## Prepared hosted continuation — not executed

1. Freshly verify the preserved isolated Certification checkpoint, Net Skins configuration/entry revision 1, empty Calcutta revision 2, primary FINAL/18 unchanged scores, and zero work/claims/leases/UNKNOWN. Stop for material drift.
2. While supervisor OFF/admission disabled/ingress paused, install only this forward SQL; compare the eight hashes, metadata and private ACLs; replay and verify rollback on mismatch without preserving a changed state.
3. Deploy the exact locally certified candidate to the isolated Certification Preview, verify SHA/project/team/branch/environment/origin/consumer, then safe owner release rebind and idempotent replay. Do not touch Production or old Preview.
4. Activate only required Certification/Director authority. Preserve Net Skins revision 1 and Calcutta empty revision 2; create the minimum lawful nonempty successor through existing Director operations, then genuine source demand.
5. Use the certified finite Queue supervisor normally for CALCUTTA calculation; no manual worker/processor/job insertion. Verify current immutable UNPUBLISHED result.
6. Through the synthetic entitled Director and `/api/director/canonical-operations`, read fixed publication metadata and publish using the exact seven CAS expectations. Verify immutable result/history, canonical pointer/receipt/audits, replay, conflict and bounded authority/source negatives. Worker must remain unable to publish.
7. Verify authenticated participant web/participant presentation reads and private financial read denial. Finish outstanding Net Skins result certification without rescore merely for convenience.
8. Inspect current Odds execution architecture. Continue only if an already-reviewed supported path is available; otherwise stop for separate Odds scope authorization. No automatic registry expansion.
9. Verify exact FinalRecap incomplete-tournament negative gate. Do not fabricate a full tournament.
10. Drain/reconcile required work, claims/leases, UNKNOWN, unexpected dead letters, stranded work, reservations/handoffs/faults and unresolved financial/Director operations; owner STOP; restore OFF/scoring disabled/Director disabled/ingress paused and coherent fixture.

Preserve Part 2B-1 PASS without repeating its fault matrix. No Part 2C authorization is implied. All hosted installation/deployment/execution steps require a separate explicit owner authorization.

Provider security reference reviewed: [Supabase database functions](https://supabase.com/docs/guides/database/functions). The implementation uses private helpers, pinned search paths and explicit owner-only execution privileges, verified locally from catalogs; no unsupported provider ACL changes are required.
