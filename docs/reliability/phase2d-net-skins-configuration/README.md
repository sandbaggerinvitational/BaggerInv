# Full Net Skins configuration through Certification Director authority

Local remediation only. Hosted Certification, Production and legacy Preview were not accessed or changed. No deployment, queue publication, supervisor START, financial provisioning or tournament rehearsal occurred.

## Finding and selected path

`POST /api/admin/production-net-skins-v1` deliberately returns 404 outside Production before authentication or database dispatch. That route and `lib/production-net-skins-server.js` remain byte-identical to base `745b2d38adbdeaea1a731ee13de4b57b4a62c835`. The missing capability was an admitted Certification configuration operation, separate from the existing saved-entry operation.

The existing `/api/director/canonical-operations` transport now recognizes the fixed `NET_SKINS_CONFIGURATION` family, with only `configure` and its private read/recovery path. It admits `DIRECTOR.CONFIGURE_NET_SKINS` and `DIRECTOR.READ_NET_SKINS_CONFIGURATION`. It is not a generic RPC proxy or a new public route. Ordinary Preview cannot use this family.

The installed shipping `configure_production_net_skins_v1` domain body is extracted once to private `production_control.canonical_configure_net_skins_v1(jsonb,jsonb)`. Its existing public Production wrapper invokes the null-context arm. Every original Production statement remains in that arm; the focused certificate compares the complete normalized body, including runtime/Director validation, revision CAS, manifest, writes, supersession, receipts and audits. Certification supplies only an already-validated private canonical context and uses the same manifest/domain statements. No calculation engine is copied.

## Authority and admission

The server requires Passport-verified, non-impersonated active Director entitlement. The resource registry requires the exact Certification resource, physical project, Preview runtime, team/project, branch, SHA and immutable deployment. SQL independently verifies the current registered resource revision, deployment/release, authority epoch, activation/admission revisions, current tournament and authenticated Director link/entitlement.

The new private dispatcher and forward install also explicitly require:

- `CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51`;
- `trmcwrljjxwhgtikfdgu`;
- canonical synthetic tournament `2026`.

The configuration operation uses the established `DIRECTOR` phase and durable competitive ingress lease. It requires current Certification admission and OPEN canonical ingress; it does not bypass these gates. The existing owner activation control changes Certification admission and ingress together. This remediation does not introduce an independent switch, enable any authority itself, or widen match scoring permissions. The later hosted run must record the actual activation state and restore disabled/paused through those controls.

Participant A/B, signed-out, anon, ordinary authenticated users and a bare service credential cannot become Director operation authority. Client DTOs cannot select resource, project, actor, tournament, release, deployment, publication policy, rules or arbitrary operations. Production and `idgigvjjqkfbqjeredpb` shapes are denied without accessing either hosted resource.

## Configuration contract

The caller supplies exactly:

```json
{
  "family": "NET_SKINS_CONFIGURATION",
  "action": "configure",
  "payload": {
    "expectedConfigurationRevision": 0,
    "eligibleRoundNumbers": [3],
    "entryRevisions": {"3": 1}
  },
  "operationRequestId": "<stable UUID>",
  "expectedContextToken": "<current server-issued context token>"
}
```

Rounds must be unique supported round numbers 1–3. Entry revision keys must match selected rounds exactly and be positive integers. The server derives tournament, resource, actor, release/context and request fingerprint. An absent isolated configuration pointer is a revision-zero CAS expectation, not a fabricated revision-zero financial record. First configuration creates the real immutable revision 1 and its canonical pointer. A stale configuration revision is denied; stale saved-entry revision is adapted narrowly to `PRODUCTION_NET_SKINS_ENTRY_REVISION_CONFLICT`/PT409. Other infrastructure exceptions are not converted to domain conflicts.

The unchanged `full_net_skins_manifest_v2` reads saved explicit entries. Each selected round must be configured, ENTRIES_SAVED, nonempty and at the exact saved revision. It verifies canonical round format, match/side/player identities, active tournament participants and duplicate opt-ins. The manifest contains:

| State | Installed rule/source |
|---|---|
| Tournament, round ID/number/name/format | Canonical 2026 tournament and BB/SC/SI rounds |
| Entries | Saved explicit opt-ins, entry key/revision/binding fingerprint, canonical match and player IDs |
| Entry type | Individual for BB/SI; pairing for SC |
| Buy-in/pot | $25 individual; $50 SC pairing; entered count × fixed buy-in |
| Hole scope | Holes 1–18 |
| Handicap/calculation | `production-full-course-handicap-v1`; existing full-course engine |
| Completion | `ALL_ELIGIBLE_ENTRIES_18_HOLES_AND_REFERENCED_MATCHES_OFFICIAL` |
| Ties/carry/rounding | `NO_SKIN_NO_CARRY`, `NO_CARRY`, `NONE` |
| Publication | Fixed `OFFICIAL_ONLY`; configuration does not publish a result |
| Source/version | Entry revisions, per-round and overall configuration fingerprints, immutable configuration revision |
| Provenance | Registered Certification identity and synthetic URN; no Google access |

The core writes existing configuration revisions, calculation-input configuration/entry tables and current pointer. It supersedes incompatible older calculation jobs/results using the unchanged shipping rules. Configuration itself creates no immediate calculation job, publication or processor call. Later canonical enqueue/score/lifecycle operations own truthful demand; required work then uses the certified autonomous worker.

## Saved revision 1 and evidence

Saved-entry revision 1 is independent of the financial configuration revision. The local integration creates it through the existing shipping save operation, configures from it, and verifies its entire row remains unchanged. It is neither deleted nor reset. The hosted continuation must read back the preserved saved revision and its eligibility; reuse it if valid. Any later entry correction must be a supported successor save, never a reset of revision 1.

The core emits the actual `PRODUCTION_NET_SKINS_V1_CONFIGURED` receipt, configuration fingerprint/revision/manifest and both scoring and operation audit events. The existing ingress protocol adds truthful operation admission/outcome history. Recovery derives the receipt from the immutable configuration ledger, matching operation/resource fingerprint and original Director, rather than manufacturing an independent success record.

Exact replay returns the committed configuration without another revision or audit. A different DTO under the same operation UUID conflicts. Receipt comparisons preserve domain identity; the existing ingress envelope strips optional null properties on replay. A lost committed response recovers after admission is disabled without executing configuration again.

## Privacy and unchanged surfaces

Full configuration/financial readback is Director-only through this family. The existing participant-safe `NET_SKINS_RESULT` projection remains separate and contains no configuration actor Auth UUID or request payload hash. Anon/authenticated direct private-table reads and all client-role private helper executions remain denied. Existing backend service-role table SELECT privileges are unchanged; a backend SQL credential is not a Director identity and cannot obtain this client operation authority merely by presenting that credential. No table grants, roles or RLS policies change.

No changes to Production transport, UI, worker/queue supervision, claims, leases, scoring, golf mathematics, Calcutta or Odds. No new environment variables, secret, provider surface or fallback.

## Forward installation

Artifact: `supabase/production_incremental/certification-net-skins-configuration-v1.sql`.

The transaction takes the existing admission fence and requires the exact Certification installation, disabled admission, paused ingress, no unresolved ingress leases and no Production cutover rows. It checks all six predecessor bodies before changing anything. It preserves their OIDs, owners, ACLs, security mode, search paths and remaining function metadata; a mismatch rolls back the entire installation. Four new private helpers inherit the existing configuration owner and receive no application-role EXECUTE grants. Replay checks their exact hashes and closed ACL/security metadata; widened helper privileges fail rather than being silently repaired.

Historical migrations/bootstrap are unchanged. A fresh canonical local installation plus the approved predecessor forwards and this artifact installs successfully with pg-safeupdate enabled. Exact replay converges. The artifact must not be applied to Production.

## Local certificate

`tools/reliability/certify-net-skins-configuration.mjs` strips real credentials and denies all remote sockets. Owned PostgreSQL 17 runs with the actual pg-safeupdate extension. The integration uses the shipping browser transport, actual Director route source and server adapters; only external session lookup/HTTP RPC transport is modeled. Database resource/actor/entitlement/ingress/CAS/receipt checks and writes are real.

Evidence is in `evidence/focused.json`, `application.json`, `build.json` and their raw logs. Source manifests bind executable inputs. Focused cases cover predecessor rollback, replay, private ACL drift, saved-entry preservation, configuration/policy/current pointer, audits, replay/conflict, stale revisions, resource/release/deployment/Director denials, client field injection, Production404, private/public reads, lost response, NOT_COMMITTED reconciliation and disabled/paused final state.

The established broad selection is retained; new cases run in the focused certificate. Baseline is 4,077 passing / 20 established failures / zero skipped. No 864-hole run or hosted Part 2B-1 recertification.

Final results: focused **65 passed / 0 failed / 0 skipped**; broad **4,077 passed / 20 established failures / 0 skipped**, with no new failures; production build **PASS**. All three executable source manifests remained stable. Build-time dynamic reads report their expected unavailable state with provider credentials removed; they do not contact a provider. Raw logs retain native output whitespace and their recorded SHA-256 digests.

## Separately authorized hosted continuation

1. Freshly verify the reported safe checkpoint and saved entry revision 1. Stop on material drift.
2. Install only this forward artifact on Certification while OFF/disabled/paused; verify hashes, metadata, closed helpers and idempotent replay.
3. Push/deploy the reviewed application candidate to the existing isolated Certification Preview; verify exact SHA, team/project/branch, immutable origin and resource configuration.
4. Perform the certified safe release rebind with no unresolved claims/leases/outcomes and supervisor OFF; verify replay.
5. Activate only the existing required Certification/Director controls and record actual admission/ingress state. Do not open an alternative authority path.
6. Authenticate the synthetic Director. Read full configuration and saved entries through the existing gateway.
7. Submit one real configuration using current configuration CAS and preserved eligible saved entry revision(s). Verify canonical revision/pointer, receipt and both audits.
8. Prove exact replay, conflicting replay and bounded configuration-specific authorization/resource/privacy negatives. Production route remains Preview404.
9. Continue the interrupted Part 2B-2 at Net Skins entries/calculation/publication/readback; use canonical demand and the already-certified autonomous worker where required.
10. Continue Calcutta nonempty successor/history/privacy, then Odds calculation/publication/readback.
11. Prove the exact FinalRecap prerequisite negative gate with the intentionally incomplete tournament; do not begin Part 2C.
12. Drain/reconcile all required work and operation outcomes. STOP the supervisor and close remaining authority.
13. Return scoring/Director admission DISABLED and ingress PAUSED; preserve the primary scores, truthful fixture/financial history, and zero pending/claims/leases/UNKNOWN/unexpected dead letters/stranded work.

These steps were prepared only. No hosted capability or configuration success is claimed by this local certificate.
