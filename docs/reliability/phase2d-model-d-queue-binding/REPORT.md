# Model D Queue publication binding — local certificate

Base: `9ed929788b05d756b4eff6f72d0ec24821f3636e`.
Scope: local owned PostgreSQL 17 / pg-safeupdate and synthetic provider model. No hosted calls, credentials, installations, deployments, financial facts or tournament fixture provisioning.

## Cause and correction

`validateOwnerQueueBatch` compared every batch to `config/certification-resource-registration.json`, so the independently registered Model D batch failed with `SUPERVISOR_PUBLICATION_BINDING_DENIED`. This was an application closed-registry compatibility gap; canonical database and consumer Model D support already existed.

The publisher now passes its server-derived `queueRuntimeIdentity` envelope into both validation of the canonical BEGIN batch and the subsequent canonical BATCH reread. `isCertificationRegistrationEnvelope` checks the existing private WeakMap: request JSON, clones and profile strings cannot mint this context. Only an envelope issued from the validated registration carries Model D purpose. Its complete resource and deployment tuple must match the batch. Without a trusted context the existing original-only validator remains in effect. No extra HTTP fields, environment overrides, generic registrations, processor selection or engine names were introduced.

Production is not served by this Certification publisher and remains denied. Existing original-only owner CLI physical targeting remains original-only; it is not generalized to Model D. Future Model D owner operations use the already-reviewed owner binding package and the Preview publisher handoff, not a widened CLI target.

## Full authority chain and predicate classification

1. Managed owner START commits a bounded fixed-engine reservation under `worker_supervisor_control_v1`. Owner-only ACL, exact registered resource, physical database, current pointer, authority epoch, activation/admission/generation revisions, expected supervisor revision and exact deployment remain canonical prerequisites.
2. Owner permit minting is private; only a digest of the one-use permit is stored. The HTTP body contains only the permit, never target, engine, message, delay or resource.
3. The Preview Function derives the registration envelope from server configuration and validates OIDC project/team/Preview scope before canonical BEGIN. Canonical BEGIN binds the permit/session and returns the batch.
4. Both application batch checks use that same trusted registration context. The original registration literals remain the default owner-tooling boundary. The hard-coded original registration lookup in this validator is the only predicate extended to exact Model D context.
5. QueueClient keeps region `iad1`, fixed topic `bagger-certification-derived-wake-v2`, the exact deployment pin and minimal version/invocation UUID message. Delay, retention, TRY/send/ACK, deadlines, uncertain outcomes and CLOSE are unchanged.
6. Native private callback provider lookup, deployment pin and canonical DISPOSITION/BEGIN bind provider message identity to the single-use reservation. Canonical reservation digest covers supervisor epoch/revision, source authority context and engine scope. START/BEGIN—not batch JSON—selects these values.
7. Canonical engine arrays remain distinct: original five (`TEAM_MOMENTUM`, `TOURNAMENT_STORYLINES`, `TOURNAMENT_INTELLIGENCE`, `PROJECTION_EDITORIAL`, `CALCUTTA`); Model D adds only `TOURNAMENT_FINAL_RECAP`. Original cannot gain the sixth engine through this change.
8. STOP/HALT, reservation CAS, claims, retry envelope, finite attempts, retention and visibility remain shared unchanged invariants. No competitive job or demand is needed by this certificate.

Authority epoch, release binding ID, supervisor epoch/revision, reservation and engine validity are enforced by the existing canonical permit, START and BEGIN layers. The application does not manufacture or replace those values. Release SHA and full deployment tuple are also matched to trusted runtime at publication.

## Proof

Final focused suite: 31 passed / 0 failed / 0 skipped, source stable. It covers the actual application publication handler against PostgreSQL, original Preview provider and publication tests, and new Model D cases:

- Disabled unresolved checked-in registration cannot authorize execution; copied envelopes are denied.
- Exact Model D batch accepted; mutations to every resource and deployment field denied.
- Cross-resource batches and mixed original/Model D project/deployment tuples denied.
- Wrong profile, resource, physical URL, project, Preview environment, branch, SHA, deployment, credentials/runtime registration are denied before provider construction.
- OIDC wrong project denied; fixed topic and deployment pin observed in provider model.
- Client-selected resource and message schema additions denied.
- Anon/authenticated/service_role cannot mint owner permits; Director/participant client authority is not owner authority. Fabricated reservation denied.
- Stale supervisor revision, changed authority epoch/binding/activation/admission/generation context and arbitrary or partial engine list denied canonically.
- Canonical owner START → one-use permit → application publisher → TRY/ACK → native QueueClient callback/private envelope → BEGIN → one bounded NO_WORK tick succeeds.
- Exact publication replay sends nothing twice; consumed permit cannot be reused; duplicate consumer delivery cannot execute twice.
- STOP and an owned local HALT control-state model deny execution; no job or domain state is inserted by those models.
- Empty local fixture stays at zero players/matches/match holes/scores; pending work and active claims are zero after STOP.

The historical fault-transport source comparison in `test/certification-queue-publisher.test.mjs` now compares with this task's approved base. Its prior `71d6a393` reference predates the already-certified Calcutta claim boundary. No runtime fault logic was changed to satisfy the test.

Broad and build results are retained in `evidence/application.json` and `evidence/build.json`. Broad acceptance requires exact equality of the 20 established failure identities, zero new failures and zero skips. An initial broad run matched the baseline but its source snapshot changed only because the new focused test was refined concurrently; it is retained as `application-initial.json`. The final broad run uses the frozen source/test set.

## Database and installation lineage

Application-only correction. No forward SQL, image, manifest, historical migration, bootstrap, role or RLS change is needed. `evidence/unchanged-contracts.json` proves 46 base/current artifact hashes equal, including the complete Model D image, all incremental SQL, registry, fixture, engines, supervision, consumer, timing, lockfile and Vercel manifests.

Model D manifest digest: `c50d395eeab4a2e6b35815537b4e27b42af8c93df003d31afdda0d9de146d1b5`.
Schema digest: `a82345ddbaa01dadb153baeed1973f30290cf7084ff8038bf50e247122fb5ae2`.
The future fresh installation uses this unchanged certified database lineage paired with the new application base successor. Configuration manifest stays disabled with unresolved identity placeholders. Real hosted identity resolution belongs only in the later registration-only successor.

## Isolation and continuation

Hosted Model D `heoqynwlmqiejyxdmbmv`: not accessed or mutated. No new project, password reset, credential read/rotation, deployment, D9 or D10. Production, original Certification, old Preview, Google and real messaging: zero access/mutation by this task. Hosted checkpoint is not claimed freshly verified by this local run.

Next owner action after local PASS: authorize resumption of Model D D2–D8 on existing project `heoqynwlmqiejyxdmbmv` using the new certified base, then hosted-identity registration-only successor, exact Preview deployment/binding, focused trust acceptance and empty safe checkpoint. D9/D10 remain unauthorized.

## Final acceptance result

PASS. Final focused: 31/31 pass, no skips, source stable. Broad: 4,077 pass / 20 exact established failures / 0 skip, source stable, no new or missing failure identities. Build: PASS. Original validator comparison: 22/22 exact return/denial matches. 864-hole rerun: NO. No RLS, role, database image, manifest, worker or domain mathematics changes. Hosted continuation requires separate owner authorization.
