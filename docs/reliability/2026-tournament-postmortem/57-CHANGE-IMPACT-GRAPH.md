# Dependency-aware change impact and evidence expiration


Proposed graph nodes: source module/function, schema/RPC, endpoint/contract, native/PWA model, operation/capability, requirement, suite, artifact. Edges: implements, calls, serializes, depends_on, verifies. Each dependency declares semantic fields rather than broad “any release changed.” Unknown new dependency defaults to review, not optimistic exemption.

| Change | Required invalidation/rerun | Retain unrelated proof |
|---|---|---|
| Score RPC/math/context | All formats; native/PWA/Director recovery; idempotency; finalization; performance/security | Pure unrelated History layout |
| Native queue/Date persistence | Upgrade/migration, kill/lost ACK, exact SQLite roundtrip, multi-device and physical scoring | Backend math if unchanged |
| Shell/session/error handling | All feature-error/tab/background/auth transitions and physical continuity | SQL formula proof |
| Pairings/HI/course/tee | Affected preparation/readiness/scoring allocations and side-game semantic compatibility | Unrelated tournament/year |
| Side-game schema/lifecycle | Real claim/process/publish/history chronology + installed native compatibility | Scoring only if critical-call graph unaffected |
| Compute/pool/region | Latency/capacity/failure/restore proof | Calculation correctness with unchanged code |
| Release/activation protocol | Pending jobs, first write, old clients, rollback and hosted binding | Static artwork |
| Odds text/style only | Presentation/accessibility | Score RPC and SQL proof |

Use semantic contract version and implementation hash plus fixture/infrastructure profile in artifact freshness. A compatible release can reuse unchanged evidence only with explicit dependency proof. Physical evidence expires when behavior-affecting client/contract changes; timestamps alone do not make an unchanged test stale, but tournament release still needs final-candidate acceptance.

[Machine graph](change-impact-graph.json) supports impacted-suite selection, generated physical checklists, evidence status and freeze gates. It is a proposed seed graph, not a complete automatically extracted repository call graph.
