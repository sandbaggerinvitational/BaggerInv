# Backup and restore

## Provider facts versus account facts

Official provider documentation was observed on 2026-09-27. Supabase documents daily database backups with retention by plan, optional PITR, and downtime during restore. It also says database backups do not restore deleted Storage API objects and do not include custom-role passwords. These are provider facts; the Production plan, backup schedule, retention, PITR state, earliest/latest recovery point, encryption, region, last successful backup, and last restore result are **UNKNOWN**. [Supabase backups](https://supabase.com/docs/guides/platform/backups)

AWS documents automated RDS backups/PITR inside a configured retention period and separately documents cross-Region automated backup replication. These are provider capabilities, not a claim that an AWS design is configured or superior for this system. Documentation observed on 2026-09-27. [RDS automated backups](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html) [RDS cross-Region backup replication](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/AutomatedBackups.Replicating.Enable.html)

## Required backup inventory

Record and monitor:

- provider/project/region/plan and exact database instance;
- backup method, frequency, retention, earliest/latest recoverable time, and job result;
- PITR granularity and verified recovery window;
- separate Storage object protection and custom-role credential escrow/rotation process;
- encryption and access control, immutable/off-account evidence/export where permitted;
- schema migrations, functions/triggers/grants, config and secret version references;
- restore runbook version, last exercise, actual duration, result, and semantic exceptions.

Never infer account protection from provider defaults. Alert on missing or stale backup/PITR evidence and fail the Tournament Mode entry gate.

## Restore procedure

1. Declare incident/exercise, isolate the destination, and record target timestamp and expected loss window.
2. Inventory source recovery points and dependencies without querying broad tournament history on the Production primary.
3. Restore into an isolated network/project with no public traffic, cron, workers, webhooks, or Production secrets.
4. Apply documented credential handling for custom roles and validate Storage objects independently.
5. Verify version/schema/migrations, extensions, functions/triggers, grants/RLS, configuration references, and row-count/hash invariants from bounded views.
6. Run semantic tests for authority, current tournament, participant eligibility, match/hole scores, receipts/history/audit, Finalize/Reopen, side-game rebuild, and same-ID recovery.
7. Record actual recovery point and duration. Compare paper/offline changes after the recovery point with four-eyes reconciliation.
8. Cut over only through the emergency change and single-authority procedure. Keep the old environment fenced and preserved.

## Rehearsal acceptance

Quarterly and pre-tournament restores must meet the approved RPO/RTO, pass semantic checks, prove Storage/credential handling, preserve immutable exercise evidence, and measure every phase. The target remains isolated unless a separately approved disaster cutover occurs. Test data and credentials are removed under the retention policy after evidence capture.

## Roles and AI boundary

The recovery owner selects the point and destination; the database operator performs restore; the application owner validates semantics; the security owner validates credentials/access; the Incident Commander authorizes cutover. Automation and AI may enumerate evidence, compare bounded snapshots, and draft discrepancies. They may not select a destructive recovery point, restore over Production, rotate Production credentials, or transfer writer authority without explicit named-human approval.

