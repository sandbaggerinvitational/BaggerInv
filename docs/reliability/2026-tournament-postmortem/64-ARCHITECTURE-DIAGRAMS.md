# Service and authority dependency map


```mermaid
flowchart LR
 N[Native] -->|critical score/read + auth| API[Vercel APIs]
 P[PWA] -->|critical score/read| API
 D[Director] -->|owner confirmed round/financial operations| API
 S[Spectator] -->|optional bounded public reads| C[CDN/cache]
 C --> API
 API -->|identity validation| A[Supabase Auth]
 API -->|critical canonical RPC/current reads| DB[PostgreSQL primary]
 DB -->|minimal transactional event| O[Durable outbox]
 O --> W[Derived workers]
 W --> DB
 RC[Protected release control] -->|compatible binding + locks| API
 RC --> DB
 A -->|sign-in delivery dependency| EM[Email/SMS providers]
 DB -->|backup/sanitized restore| CL[Maintenance/certification clone]
 API --> M[Independent telemetry]
 DB --> M
 N -->|privacy-safe errors/intents| M
 CARD[Physical cards] -->|owner reconciles via Director| D
```

PostgreSQL and API availability are single critical digital-scoring dependencies; PWA does not protect against a shared backend outage. Existing authenticated session continuity during providerauthoutage needs explicit contract proof. Email/SMS is critical for new sign-in, should not become synchronous dependency for every score. Exact2026providerconfiguration beyond evidence is UNKNOWN.

Target simplicity: retain one PostgreSQLcanonicalauthority, existingVercelAPI, modestdurablejob/outboxseam, boundedpubliccache, independentmetrics, isolatedcertificationclone and first-classDirector. No need for microservices, broad event-sourcing rewrite or multiregiondistributedfinancialsystem at24-playerannualscale. Reevaluate on measured multi-tournamentconcurrency, sustainedresource/budgetlimits or availabilityrequirements.

See [critical paths](65-CRITICAL-PATH-DIAGRAMS.md), [native architecture](25-NATIVE-NAVIGATION.md), [infrastructure](INFRASTRUCTURE-BLUEPRINT.md). Diagrams are proposedtarget except explicitly cited2026dependencies.
