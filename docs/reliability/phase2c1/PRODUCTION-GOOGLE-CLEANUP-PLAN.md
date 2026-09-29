# Future Google cleanup — documentation only

**NOT EXECUTED. Separate owner authorization required.** No live configuration/account was inspected.

1. Finish candidate replacements/proof and review migration/rollback.
2. Separately authorize isolated hosted/staging certification without Google credentials; verify boot, all required APIs/workers, History/Records, annual operations, network absence and rollback.
3. Separately authorize Production release, migrations and acceptance. Never create fake scores in the real tournament archive.
4. Observe canonical health/readback and legitimate traffic; correlate release/activation with outbound adapter/job creation telemetry. No Google jobs/attempts should occur. Legacy queues are retained history, not pending delivery obligations.
5. Review historical artifacts and preserve any unique required data in protected durable storage.
6. After rollback dependencies close, remove obsolete Production configuration/scheduled invocations; then revoke obsolete credentials/permissions under separate explicit authorization.
7. Verify subsequent legitimate operation remains healthy. External artifact deletion is a separate reviewed action, never an automatic cleanup side effect.

Candidate variable names: GOOGLE_SHEETS_ID, GOOGLE_SHEETS_SPREADSHEET_ID, PREVIEW_SCORING_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL, PRODUCTION_GOOGLE_PRIVATE_KEY; legacy Google ingress/mirror, Odds mirror, archive/outbox worker secrets and Guide sync flags. See dependency register for full source inventory; no values are recorded. Presence in actual Production is UNKNOWN.

Repository vercel.json has only account-deletion cron. External scheduler configuration is UNKNOWN. Review retired `/api/cron/scoring-google-outbox`, `/api/cron/round-scorecards-archive`, `/api/cron/future-match-google-compatibility`, `/api/cron/guide-sync` schedules later; do not alter unrelated account-deletion schedules.

Observation proposal: at least14days **and** one occurrence of every known periodic reporting schedule after deployment; verify annual initialization separately in hosted synthetic fixtures rather than waiting a year. If any schedule is unknown, do not infer silence proves absence. This is proposed, not an evidence-backed Production guarantee.

Old releases may require Google credentials. Preserve credentials through the agreed rollback window; never re-enable old application behavior with candidate grants/functions partially installed. External resources: KEEP HISTORICAL until classified; EXPORT THEN ARCHIVE if unique; DELETE LATER only explicitly approved; UNKNOWN→owner review. All cleanup needs prerequisites, approval, verification and a recovery path.

The isolated branch alone has `git.deploymentEnabled:false` in candidate vercel.json to prevent Git-push automatic deployment. Other branches and existing cron entries are unchanged. This is repository-source configuration, not a live-project setting. [Official Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled) documents the branch-level behavior. No provider/project API was queried.
