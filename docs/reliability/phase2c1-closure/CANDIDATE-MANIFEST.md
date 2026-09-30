# Candidate manifest

STATUS: **PARTIAL — NOT STAGING-REVIEW READY**.

BASE SHA: `4f5be5928a362f77edca375919df55be23695177`.
SOURCE CANDIDATE SHA: `63fd9f0e47993eb48e89ae268d03b939b0a5c10c`.
BRANCH: `codex/reliability-phase2c1-capability-closure`.
REMOTE: `origin` (`git@github.com:sandbaggerinvitational/BaggerInv.git`).

The source commit contains126 files: 33 added, 93 modified, 0 deleted. Individual test cases were removed; no entire selected broad-suite test file was excluded. A later documentation/evidence commit contains this manifest; its final review SHA is returned to the owner. This avoids pretending a commit can embed its own hash. Both commits remain on the isolated branch, without merge or deployment.

## Evidence binding

Tests executed at baseHEAD plus captured working bytes. [candidate-manifest.json](candidate-manifest.json) hashes every source file in this source commit; [freshness review](evidence/freshness.json) distinguishes fresh dependency hashes from narrowly adjudicated unaffected additions. Existing operation classifications and commands remain byte-identical apart from the new read-family/suite entry. The last Preview fixture change removed only an extra blank line; both dependent SQL suites reran. Source commit identity is a content binding, not a claim tests ran after the commit existed.

## Installation scope

- Production-shaped **local fixture profile**: new `supabase/production_migrations/202609300127_canonical_annual_create_contract_v1.sql`, after retained125/126. Replaces annual CREATE/current readback behavior only; no tables/indexes/grants/RLS changes.
- Separate **Preview profile**: new `supabase/migrations/202609290002_preview_google_runtime_retirement_v1.sql` and `202609290003_preview_odds_runtime_retirement_v1.sql`. Do not install this profile into Production merely because both contain canonical functions.
- Existing permanent functions changed: annual CREATE + future runtime read; Preview score, Finalize, Reopen, finalized-snapshot capture/invalidation and Odds publication. Three new bounded service-only Director read RPCs. One retired Odds mirror supersession trigger removed; obsolete worker execution revoked; historical rows retained.
- No new table, index, package, cron, distributed service, scoring rule or side-game rule. Automatic Git deployment is disabled for this branch in source configuration; no hosted setting changed.
- New app routes: `/api/director/canonical-overview` and `/api/director/canonical-odds`. Existing optional Google input refresh returns410. Protected Production consoles/admission are preserved; exact pending routing edits did not execute.

## Current result

P0A–E retain scoped localPASS; P0F remainsPARTIAL. Seven required Director capability identities need the shared canonical isolated context; three routing cases remainRED. Google is not restored.432/432 synthetic holes,24/24Final results and zero required automatic backlog remain proved in the named fixture; separatePreview/Odds proofs cover their branches. Broad4072pass/23fail is fully accounted (20 unchanged baseline +3requiredrouting), not all-green certification.

## Future rollback / approval

[Deployment and rollback](DEPLOYMENT-AND-ROLLBACK.md) is documentation only. Current candidate is HIGH risk to advance while capability/admission gaps remain. Hosted staging and Production each require a later separate owner authorization. Application/SQL must be paired; restoring old functions alone does not restore retired triggers/grants. Keep real Google credentials/resources untouched until later hosted proof, authorized Production rollout, stability observation, historical preservation and rollback-window review.

PRODUCTION QUERIED/MUTATED/DEPLOYED/CONFIGURED: NO. HOSTED STAGING DEPLOYED: NO. REAL GOOGLE ACCESSED/CHANGED: NO. COMPETITIVE DATA CHANGED: NO. BUILD11/NATIVE SHIPPING SOURCE CHANGED: NO.
