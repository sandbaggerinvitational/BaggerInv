# Deployment and rollback boundary

**NOT READY FOR STAGING.** This is documentation only. No hosted environment is created or changed. Production deployment and hosted staging each require a separate explicit owner authorization. The current task does not authorize either.

## Candidate order

The canonical annual schema remains the ordered Production-named migration series125 →126 →127, installed only in disposable local fixtures here. Migration127 replaces exactly two functions: annual CREATE target-year admission and canonical participant-team read. It adds no table/index/grant/RLS change. Matching application code must accompany127 because the old server does not send the now-explicit target year. The old CREATE was already contradictory; rollback is not permission to revive it.

The independent Preview schema uses202609290002_preview_google_runtime_retirement_v1.sql after its existing installed schema. It removes Google enqueue/claim behavior, preserves historical rows and canonical audit/snapshots, and adds service-only capability/receipt reads. The exact-source guards intentionally reject drift or repeated application. The two migration directories are different schema installation paths, not one interchangeable sequence.

Future staging must first close the seven required isolated capability identities and three read-only routing gates. Then certify migration order/identity, account authorization, authenticated client routes, same-operation recovery, no Google network/configuration, current-read privacy, full formats, workers, full sequence, finite timeout and rollback. Current local seams do not certify hosted Auth, PostgREST, pooling or supervision.

## Rollback constraints

Application rollback to the prior retirement candidate preserves tables and history, but its annual server cannot use corrected127 CREATE. Disable that annual mutation during rollback or roll forward to matching source; retain required receipts and the safe read repair. The runtime wire-hash correction agrees with existing PostgreSQL receipt digests and does not change valid historical v2 receipt identity. Do not rewrite V1 receipts.

Old Preview application code that expects Google workers cannot be restored merely by changing an application SHA: the new database no longer produces Google work and revokes worker grants. A separately reviewed function/grant restoration package would be necessary, and would conflict with the owner's current retirement decision. Prefer a forward correction. No historical Google row is deleted.

Release139 mixed-version compatibility and actual hosted rollback have NOT been proven in this task. The future deployment plan must test them, retain audit/receipt data, and stop if rollback would break authority. Existing Production Google credentials/resources must remain unchanged through staging, later separately authorized Production deployment, zero-Google observation, rollback-window closure and historical preservation review.

Future deployment risk: HIGH while required capabilities/routing remain incomplete; no promotion recommendation. The branch disables Vercel auto-deployment in source. Push is source publication only, not permission to create a hosted candidate. No repository GitHub workflow deployment configuration exists in this checkout; external account settings were not inspected.

## Preview Odds retirement addition

The Preview profile also requires `202609290003_preview_odds_runtime_retirement_v1.sql` after migration002. It preserves the canonical publisher checks and owner action, removes the mirror sink/supersession trigger, revokes retired worker execution, and adds a service-only bounded Director current-job read. It has an exact predecessor/candidate function-source guard and a repeated-application test. New application writes require the retirement contract marker, preventing app-before-migration from creating Google work. Historical jobs/snapshots remain stored.

Future rollback must pair application and appropriate SQL publisher/worker/trigger definitions after reviewing already-published canonical results; reverting application alone does not restore the retired consumer. Do not restore Google automatically. Existing external credentials must remain unchanged until a later authorized rollout and rollback-window decision. No deployment or external cleanup occurs in this task.
