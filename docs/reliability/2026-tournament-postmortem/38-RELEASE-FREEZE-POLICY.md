# Release freeze policy

## Windows

| Window | Default policy |
|---|---|
| T-14 days | schema and data-contract freeze; only approved backward-compatible reliability changes |
| T-7 days | application and infrastructure shape freeze; rehearsal candidate fixed |
| T-48 hours | Tournament freeze; exact candidate, configuration, authority, migrations, and dependencies sealed |
| Active rounds | no routine change; emergency protocol only |
| Recovery closeout | remain frozen until evidence, reconciliation, and incident owner approve NORMAL |

The tournament calendar and timezone must be recorded before the first freeze gate. Changes include code, database functions/triggers/grants, schema/data migration, feature/config flags, secrets, provider compute/storage/pool/region settings, cron, DNS, authority/admission/runtime pointers, observability rules, and client compatibility rules.

## Entry requirements

The release manifest identifies commit, deployment, release, activation, migrations, database functions, config/secret versions, provider region/compute/storage/pool, authority generation, native builds, alert catalog version, and recovery point. Independent reads must match the manifest.

Entry also requires two passing event-shaped rehearsals, valid backup/PITR evidence, an isolated restore rehearsal, on-call coverage, rollback candidate, zero unresolved unknown writes after bounded same-ID recovery, zero forbidden history-primary paths, and green authority/observability.

## Enforcement

Release tooling blocks out-of-window changes. Protected credentials and provider dashboards require named operators and durable audit. Configuration drift pages during Tournament Mode. A successful deployment is not release completion: activation, authority, health window, physical journey, competitive diff, and evidence closeout must pass.

AI tools may prepare diffs, evidence summaries, query analysis, and runbook suggestions in isolated workspaces. They may not receive Production write credentials or independently deploy, migrate, resize, restart, restore, fail over, switch authority, replay scores, Finalize/Reopen, or publish competitive results. A named human remains accountable for every state-changing approval and observes the result.

## Exceptions

Active-round exceptions follow `39-EMERGENCY-CHANGE-PROTOCOL.md`. The exception must address an active, material safety/availability problem; identify the smallest bounded change; preserve or improve rollback; and have an incident record. Convenience, analytics, performance exploration, and unrelated fixes wait until the freeze ends.
