# Current official provider contracts

Reviewed 2026-10-05; URLs are authoritative documentation/source. Documentation is
not account-specific hosted proof. Provider administrators/code deployers and the
provider are distinct from SQL `service_role`, anon and authenticated roles.

## Vercel

- [Cron](https://vercel.com/docs/cron-jobs) invokes the Production deployment URL.
  [Environments](https://vercel.com/docs/deployments/environments) supports separate
  Preview variables and Pro/Enterprise custom environments, but does not document
  isolated Preview/custom Cron. Do not call a production-configured deployment a
  Certification substitute merely because it lacks a custom domain.
- [Queue concepts](https://vercel.com/docs/queues/concepts): push topics are
  deployment-partitioned; delivery returns to the publishing deployment; consumers
  have no internet URL. Delivery is at least once. Delays up to seven days and
  finite maxDeliveries are supported. Old-deployment work continues after promotion
  or rollback. Native privacy does not replace Bagger authority predicates.
- [Queue quickstart](https://vercel.com/docs/queues/quickstart): Node 22+; SDK
  publishing automatically uses OIDC in deployed functions. A `queue/v2beta` trigger
  makes the consumer private. No custom scheduler bearer/HMAC required.
- [SDK](https://vercel.com/docs/queues/sdk): delay/TTL/idempotency, delivery metadata,
  retry callback and concurrency configuration support finite batches. Queue retry
  policy must not reset canonical job attempts.
- [Workflows](https://vercel.com/docs/workflows) supplies durable orchestration and
  sleep. [Current SDK deployment source](https://github.com/vercel/workflow/blob/main/docs/content/docs/v5/deploying.mdx)
  and [framework integration source](https://github.com/vercel/workflow/blob/main/docs/content/docs/v5/how-it-works/framework-integrations.mdx)
  describe generated private queue-backed flows. [start source](https://github.com/vercel/workflow/blob/main/docs/content/docs/v5/api-reference/workflow-api/start.mdx)
  has exact deploymentId targeting and Preview branch behavior for `latest`; do not
  use `latest` here. Main source evolves: an implementation must pin an SDK/version
  and repeat corresponding source/build checks. Existing worker belongs in a Node
  step, not the constrained workflow VM. Inputs/results are recorded: never pass
  credentials into workflow data.
- [OIDC](https://vercel.com/docs/oidc) and [reference](https://vercel.com/docs/oidc/reference)
  provide short-lived runtime identity on all plans. Documented claims identify
  team/project/environment, not an exact deployment ID. Function tokens are reused
  up to 90 minutes and expire at two hours; they are not single-use/30-second
  scheduler tickets. Do not trust a client header or decode without verification.
- [Automation bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)
  is project-wide protection bypass, not worker or owner authority. It is a reusable
  credential. Do not put it in pg_net queues or use it as the replacement auth.
- [Server secrets](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
  can be branch/environment scoped and write-only in management surfaces. Runtime
  code/deployers/provider remain trusted. No Supabase SQL getter for Vercel env is
  exposed by this repository. Native Queues requires no new signing environment key.
- [Function duration](https://vercel.com/docs/functions/configuring-functions/duration)
  can cap each tick; request background continuation is not an independent scheduler.

## Supabase

- [Scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions)
  explicitly use pg_cron + pg_net and recommend Vault for credentials. The current
  example uses a publishable key: it is public application identity, not sufficient
  owner/scheduler authority. Substituting a secret key reintroduces queue custody.
- [Edge secrets](https://supabase.com/docs/guides/functions/secrets) are runtime env
  set via Dashboard/CLI/Management control plane, unlike a Vault SQL view.
  [RBAC](https://supabase.com/docs/guides/platform/access-control) permits specific
  project roles to manage/view secret metadata/code. No documented database-role
  interface to arbitrary Edge env values was found. **INFERENCE:** SQL service_role
  does not acquire Management API or Edge code-deployment authority merely by being
  a SQL role. This is not a newly observed hosted secrecy proof. All project Edge
  code with access to shared secrets, authorized deployers and the provider must be
  trusted; secret-returning/signing-oracle functions invalidate the boundary.
- [Edge authentication](https://supabase.com/docs/guides/functions/auth) documents
  user, secret, publishable and none modes. A secret-key cron request through pg_net
  is reusable queued authority; publishable/none is publicly invocable. No suitable
  credential-free, private native scheduled Edge wake identity was established.
  OIDC verification in an Edge handler could avoid a shared key but does not itself
  supply an autonomous Vercel/Supabase trigger.
- [Edge architecture](https://supabase.com/docs/guides/functions/architecture),
  [limits](https://supabase.com/docs/guides/functions/limits), and
  [dependencies](https://supabase.com/docs/guides/functions/dependencies): Deno/npm
  support is not proof this Next/Node/server-only worker graph bundles unchanged.
  Limits include 256MB, 2s CPU, 150s free / 400s paid wall time. More custody surfaces
  and runtime qualification make Edge direct execution inferior for this worker.
- [Database webhooks](https://supabase.com/docs/guides/database/webhooks) use pg_net;
  changing triggers does not eliminate readable request custody.
- [Vault](https://supabase.com/docs/guides/database/vault) exposes plaintext to
  authorized SQL SELECT through its decrypted view. Retained hosted role grants
  establish the service_role blocker. Encryption at rest is not SQL-role denial.
- [Changelog](https://supabase.com/changelog.md) was fetched and reviewed. Relevant
  longstanding removals/limitations include JWT-secret database GUC removal and
  prohibition on manual cron.job updates; neither is a secret/scheduler workaround.
  Current middleware/Edge auth features do not document the private autonomous wake
  primitive needed to make the old design acceptable.

## Incremental cost assumptions

No new fixed monthly resource or third service for the recommended design. Existing
Vercel/Supabase subscription costs remain; no actual account invoice/credit/feature
entitlement was fetched in this review. No paid resource is created.

[Queue pricing](https://vercel.com/docs/queues/pricing) is regional usage pricing;
4KiB chunks, idempotent sends and concurrency-capped push operations have multipliers.
[Current pricing page](https://vercel.com/pricing) lists queue operations starting
at $0.60/million. Use the selected region's current rate at implementation review,
not a promise of included free Pro usage.

Illustrative three days of one-minute ticks = 4,320 deliveries. At an assumed
**8 billable operation units per successful small tick** and $0.60/million, queue
usage is about **$0.0207**. The operation count is a budgeting assumption, not a
measured provider bill; retries, heartbeats, payload sizes and mode change it.
[Function pricing](https://vercel.com/docs/functions/usage-and-pricing) lists iad1
$0.128/CPU-hour, $0.0106/GB-hour and $0.60/million invocations. With 1GB memory,
0.1s CPU and 2s wall time per tick, illustrative compute is about **$0.0434** and
combined about **$0.0641**, before credits, network, database and logs. At the
45s soft ceiling for every tick, memory alone is about **$0.5724**. Real CPU and
all provider usage must be measured; this is not a total-cost or capacity guarantee.

[Workflow pricing](https://vercel.com/docs/workflows/pricing) adds $0.02/1,000 events,
$0.50/GB written and $0.50/GB-month retained to queue/compute usage. Events per tick
need measurement; no fixed resource fee is documented. [Edge pricing](https://supabase.com/docs/guides/functions/pricing)
is $2/million beyond plan allowance (500K free, 2M Pro/Team). An Edge dispatcher
would add that, egress and receiver costs, while still needing safe trigger auth.
External-host costs are intentionally not invented because an existing-platform
mechanism now meets the architectural need.
