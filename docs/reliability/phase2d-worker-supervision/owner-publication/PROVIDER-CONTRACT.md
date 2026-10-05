# Owner publication identity review

Reviewed 2026-10-05. No provider credentials were acquired or refreshed in this
task. Research used official documentation/source and installed CLI/SDK files.
The retained hosted inspection is evidence from the preceding authorized run.

| Entry | Actual identity / limitation | Evidence class |
|---|---|---|
| `vercel project token` | Development OIDC; no environment-selection flag | Installed CLI 62.2.0 help and official CLI command source |
| Project token API | Project/team and `source`; no Preview/deployment minting parameter | Official generated REST SDK schema |
| `vercel env run -e preview` | Runs a **local** command with selected variables. Environment loading does not establish an immutable Preview runtime. The returned token's claims must be checked independently; changing `VERCEL_ENV` cannot change a signed JWT | Documented local command; no supported Preview token minting contract found |
| Local owner token from stopped hosted run | `environment=development`, rejected before Queue SDK creation | OBSERVED HOSTED, retained identity-only evidence |
| Preview Function | Provider supplies function OIDC in request context. Subject includes Preview; token scopes team/project/environment | PROVIDER-DOCUMENTED; actual new deployment claims remain a hosted gate |
| Production Function | Subject/environment Production; Bagger rejects it for Certification | PROVIDER-DOCUMENTED + local negative proof |
| External CI/control plane | Its native OIDC identity is not a Vercel Preview Function identity. It can reach protected Preview under configured Trusted Sources; that does not transform its identity | PROVIDER-DOCUMENTED |
| Queue REST API | Uses Vercel OIDC with team/project/environment scope; deployment header partitions messages | PROVIDER-DOCUMENTED |

No documented stronger owner/admin Queue publication API bypassing OIDC scope was
found. A management bearer token is not substituted for a Preview OIDC token.
Build/function credentials are not scraped from deployment metadata or exported
to the laptop. Custom-environment identities are distinct and remain denied.

The SDK's `getVercelOidcToken()` resolves the provider request context inside a
Function, with an environment fallback. Bagger calls it **inside** the publication
request and checks Preview/team/project/expiry. Vercel Queues verifies JWT
signature/audience; decoding locally is only an additional scope filter.
OIDC does not document deployment/SHA/branch claims. Those are separately checked
against Vercel server system values, the fixed resource manifest, and current
canonical database binding. Neither HTTP body nor forwarded Host provides them.

Queue SDK 0.7.0 uses explicit `deploymentId` or `VERCEL_DEPLOYMENT_ID` for pinning;
the local broker/development path can omit the pin. The new publisher rejects
development and local broker overrides before SDK construction. The consumer
remains byte-identical. The publisher and consumer use the same immutable Preview
deployment, as documented for push-mode partitioning.

The local development token is still usable for **Deployment Protection
self-access** through `x-vercel-trusted-oidc-idp-token`. It never enters QueueClient
and never authorizes Bagger START/publication. Existing protection need not be
weakened. Vercel's default rule permits a project's development caller to reach
its own Preview; real account settings must still pass hosted acceptance.

Official sources:

- [CLI environment commands](https://vercel.com/docs/cli/env)
- [OIDC lifecycle](https://vercel.com/docs/oidc)
- [OIDC identity/reference](https://vercel.com/docs/oidc/reference)
- [Trusted Sources](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources)
- [Queues authentication/API](https://vercel.com/docs/queues/api)
- [Deployment partitioning and private consumers](https://vercel.com/docs/queues/concepts)
- [Official CLI project-token implementation](https://github.com/vercel/vercel/blob/main/packages/cli/src/commands/project/token.ts)
- [Official project-token API schema](https://github.com/vercel/sdk/blob/main/src/models/getprojecttokenop.ts)
- [Official env-run implementation](https://github.com/vercel/vercel/blob/main/packages/cli/src/commands/env/run.ts)

Queues entitlement is **NOT ESTABLISHED** by local proof. The preceding failure
occurred before native publication; it neither proves entitlement nor an
entitlement denial. Real Preview publication, delivery, protection, provider
identity, metering and termination behavior remain separately authorized gates.
