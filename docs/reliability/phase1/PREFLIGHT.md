# Phase 1 preflight and change boundary

## Repository and historical Production identity

The calling checkout was `/Users/claybeltran/Developer/BaggerInv`, branch `codex/prelaunch-presentation-corrections`, HEAD `65b9767c9abe75fbf192d6fb82a301231bc95dda`, with unrelated uncommitted work. It was not used for implementation or commits.

Phase 1 uses the managed worktree `/Users/claybeltran/.codex/worktrees/reliability-phase1/BaggerInv`, branch `codex/reliability-phase1`, based on exact Release 139 SHA `b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6`. Historical release objects were obtained through Git, not by reading the live database. A separate unchanged worktree at that SHA is used for baseline test comparisons.

**Production release / activation:** retained historical evidence identifies Release 139 / Activation 238. **Current Production operational status: UNKNOWN; not queried.** Neither the age of that evidence nor tournament completion is proof that Production is no longer operationally active. All tooling in this phase therefore treats it as protected. No live health request was necessary to build an isolated foundation.

## Postmortem inventory

Source: `/private/tmp/bagger-2026-postmortem/`. Required deliverables: **107/107**. Actual substantive root Markdown/JSON artifacts: **119** (118 source-manifest entries plus that manifest). Missing: **0**. Empty: **0**. Unreadable: **0**. Scratch generators and external raw incident artifacts were excluded, with reasons in the preservation receipt.

Destination: [`../2026-tournament-postmortem/`](../2026-tournament-postmortem/). The 119 files were copied without rewriting findings, stable IDs, priorities, first actions, Build 11 scope, or the Supabase recommendation. Four preservation metadata files bring the destination to **123** files. Secret scan and hashes passed before commit `09042493`.

The durable report package references additional temporary evidence. Preserving those references is not the same as preserving all raw evidence: 54 non-source external artifacts still need bounded privacy review and an access-controlled durable archive. This remains explicit in the external-evidence manifest.

## Allowed and excluded work

Allowed: telemetry/correlation, isolated benchmarks, behavioral regression fixtures, diagnostic admission, requirements/evidence documentation. No production migrations or native application files are changed. Vendored Build 10 Swift files are immutable test inputs; they are not Build 11 code.

No Production, staging or provider setting is changed. No score, result, handicap, pairing, Net Skins configuration, Calcutta fact or Odds publication is changed. Synthetic local fixture writes are restricted to fresh, task-owned PostgreSQL clusters. No deployment or release attempt is created. Main is not pushed.

The approved foundation does not authorize the remaining postmortem backlog. Discovered failures are recorded, not opportunistically repaired.
