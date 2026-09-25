# Net Skins SQL expression repair

Baseline: Production Release 134, activation 233, application `f41a09a2b06f27147faf93721e8377878f6bdf1d`. Net Skins configuration 2 contains 24 R1 individuals and 12 R2 pairs, no R3, no calculation jobs and no result revisions. Native Build 10 remains `e7652b9b65595861f4f7cdf0b8326491581a27b8`.

The incremental installer changes only seven `pg_catalog.least` / `pg_catalog.greatest` qualifications in three exact installed PostgreSQL definitions. LEAST/GREATEST are PostgreSQL conditional expressions, not callable pg_catalog functions. Each old and corrected definition is SHA-256 pinned. An unexpected definition fails the entire transaction. Reinstallation is inert. CREATE OR REPLACE preserves privileges, owner, SECURITY DEFINER, settings, arguments and return types. No table, grant, configuration, entry, job, result, activation guard or application runtime change is made.

- `read_production_net_skins_frozen_2026_v1(jsonb)`: unqualify one GREATEST used to aggregate result revisions. The public wrapper remains unchanged.
- `claim_production_net_skins_v1_recalculation(jsonb)`: unqualify LEAST/GREATEST in the existing lease initializer. Minimum 15 seconds, maximum 300, default/null 60; invalid integer input still fails.
- `normalize_production_net_skins_v1_official_result(integer,jsonb)`: unqualify two LEAST and two GREATEST expressions used for canonical pair matching. Winner order is irrelevant; unknown/null/incomplete pairs are not admitted. Membership and all official-result guards remain unchanged.

## Certification

Run `BAGGER_NET_SKINS_SQL_FIXTURE=<private fixture directory> node --test --test-name-pattern='Net Skins exact installed' test/net-skins-sql-expressions-postgres.integration.test.mjs` with PostgreSQL 17. The fixture directory is a read-only Production export, kept outside source control. No contacts, credentials or provider secrets are checked in. Test fixture functions replace only external deployment/input providers; actual installed read, runtime activation guard, enqueue, claim, lease, receipt, normalization and completion functions execute against disposable SQL tables with native constraints.

The configured pre-golf read succeeds with no result or publication. Twelve lease input cases, activation/environment/configuration denials, anonymous/participant denials, duplicate enqueue/claim/complete retries, simultaneous claims, expired leases and exhaustion are tested. Actual R1/R2 canonical entries and Full Net allocation shape feed isolated completed-golf fixtures. Official normalization is denied while matches remain Upcoming. Completed fixtures normalize both formats, preserve pair order invariance, reject malformed outputs, and complete through SQL. PROVISIONAL completion remains unpublished. OFFICIAL completion publishes automatically. R1/R2 result revisions are per round.

`test/net-skins-sql-source-boundary.test.mjs` pins every pre-existing Release 134 file and permits only the incremental SQL installer plus new tests/documentation. Historical release-specific boundary tests target older changes and are not widened; current-source equivalence replaces those historical assertions. Historical auth-rehearsal assertions expecting global sign-out/old bootstrap are already failing on unchanged Release 134; current auth behavior and its functional regressions remain unchanged.

## Pre-golf native limit

Build 10 decodes the corrected CONFIGURED response. Its detailed Net Skins adapter requires legitimate published results. This accepted pre-golf product limitation is not repaired by this SQL change. Never fabricate empty skins, publication or results to satisfy that adapter.

## Post-R1 owner workflow (do not execute during deployment)

1. Review and Finalize all six R1 matches individually. Verify complete official 18-hole results, correct participants, and frozen Full Net context.
2. Director → Net Skins: verify configuration 2, R1 24 individuals and R2 12 canonical pairs. Do not Configure again or change frozen entries.
3. `Queue Recalculation` queues configured rounds using current canonical source fingerprints. The current UI has no per-round selector, so this may queue R2 as well. Queueing does not publish.
4. `Process Queued Calculation` processes one pending job per action, ordered by request time and round. Inspect the receipt/recent calculations. A complete official R1 result is published automatically by completion. **There is no separate review-before-publish control. Review official golf inputs before processing.** A processed uncompleted R2 is PROVISIONAL and has no public result. Do not repeatedly enqueue/process to manufacture a display.
5. Verify R1 official result, skins, values, source freshness and participant readback. Then physically check unchanged Build 10 → Leaders → Net Skins. If absent or inconsistent, stop and diagnose; do not alter membership or invent results.
6. Preserve R2 membership for its later legitimate results. Configuration revision is shared, but jobs, result revisions, supersession and official publication are scoped per round. A later R1 recalculation does not replace R2's result.

The existing UI's Process button is driven by the current local enqueue state; reload can hide it despite a pending job. This change does not redesign that control. A calculation error requires read-only diagnosis before retry.
