# Responsibility and test ownership


R=executes, A=accountable decision, C=consulted, I=informed. Backend/Native/PWA/Infrastructure describe engineering ownership roles, not assumed staffed teams. Automation never replaces accountable human authority.

| Operation | R | A | C | I |
|---|---|---|---|---|
| Handicap/pairing approval | Director supported operation | Tournament owner | Scoring owner | Players |
| Prepare/GO/readback | Backend/automation | Tournament owner | Database/Director | Players |
| Open/Lock/Resume/Finalize | Director/Backend | Tournament owner | Operations | Scorers |
| Gross save | Authorized participant/client + canonical backend | Authorized scorer for input | Owner for disputes | Match players |
| Physical recovery/conflict | Director | Owner | Original scorer | Affected players |
| Financial ownership/publication | Director/worker | Owner | Financial participants | Authorized participants |
| Health/alerts | Infra/automation | Engineering operations | Provider | Owner actionable-only |
| Release/rollback | Release tooling/engineering | Owner under release policy | Domain/security owners | Participants if affected |
| Native behavior/physical tests | Native/QA | Native engineering owner | Owner/participant beta | Release owner |
| SQL/performance/security proof | Database/backend CI | Backend owner | Infrastructure | Release owner |
| Full rehearsal/evidence | Certification automation + physical QA | Owner for GO | All domain owners | Participants |
| Provider restart/scale | Provider/admin | Infrastructure owner | Backend | Tournament owner |
| Postmortem/deep audit | Engineering/Codex off Production | Engineering owner | Owner/provider | Future implementers |

Each P0 requirement in the machine catalog names a responsible subsystem. CI owns deterministic proof; database integration owns exact SQL; staging owns deployment/config; physical QA owns iPhone proof; owner acceptance owns operability. Missing named test ownership blocks readiness. Owner is not expected to become the database operator.
