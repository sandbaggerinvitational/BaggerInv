# Next task and review gate

Before implementation, the owner and engineering team should review the incident register, causal confidence, certification gaps, exact P0/P1 list, Build 11 scope, backend/current-pointer/dependency design, infrastructure verdict, test strategy and unknowns. This is a concrete design review; it does not authorize ad hoc Production changes.

**NEXT CODEX TASK:** Implement the approved observability and non-Production benchmark foundation.

**Purpose:** preserve approved evidence durably, add correlation and domain-health telemetry, and create a Production-shaped isolated harness that reproduces the SQL claim, native persistence and score-query cost failures. This is one bounded foundation phase, not all hardening.

**Prerequisites:** the owner reviews this package and identifies a durable private artifact destination, safe isolated test environment and approved telemetry access. Follow existing repository change controls. No Production writes, provider changes or schema deployment without separate explicit scope.

**Done:** an injected score timeout and unknown outcome are traceable; the real SQL/persistence baseline is repeatable; historical queries cannot be accidentally routed to Production; and the ledger states required proof gaps. Report before/after plans and the no-secrets check. Do not expand into Build 11 feature work or an AWS migration.

**Recommended configuration:** GPT-5.6 Sol, Extra High (`xhigh`), matching the owner's explicit preference; use scoped parallel source, SQL and observability work and a separate consistency review. The official model page lists `xhigh` support: [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), checked 2026-09-27. This is a task-specific recommendation, not a claim that model choice replaces tests or review.

**Do not start yet:** AWS migration, because the measured hardening gate comes first; new features, side games or analytics; visual redesign; broad schema surgery; or native/backend lifecycle integration against unsettled contracts. A small queue fix may start once its serialization and reconciliation contract is approved; it does not need to wait for the entire Director redesign.

