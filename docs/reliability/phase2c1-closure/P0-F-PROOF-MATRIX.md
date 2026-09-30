# P0-F proof matrix

**PARTIAL.** PASS cells apply only to the row’s scoped claim and listed fixture. API/INTEGRATION uses shipping handlers/adapters with explicitly synthetic identity/activation and local SQL transport where specified. Production and physical proof are always NOT PROVEN. SOURCE alone never closes a runtime capability. N/A is omitted conservatively; unexecuted layers stay NOT PROVEN.

| Claim | SOURCE | UNIT | POSTGRESQL | API | INTEGRATION | SECURITY | FAILURE INJECTION | PERFORMANCE | RELEASE COMPATIBILITY | PRODUCTION | PHYSICAL | Scope / evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Director canonical overview / Finalize / Reopen | PASS | PASS | PASS | PASS | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | director; director-preview; scoped advertised actions only |
| Director authorization / scope | PASS | PASS | PASS | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | Synthetic identity seam; actual handler and SQL actor checks |
| Director feature-local error / same-operation recovery | PASS | PASS | PASS | PASS | PASS | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | No global shell/physical proof |
| Annual CREATE protocol / future year / readback | PASS | PASS | PASS | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | annual-create21 cases; DRAFT, not READY/Open |
| Annual CREATE idempotency / conflict | PASS | PASS | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | Exact operation+payload replay; no duplicate authority |
| Annual CREATE atomicity | PASS | NOT PROVEN | PASS | PASS | PASS | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | Injected transaction/readback failures; owned local PostgreSQL |
| Annual CREATE security | PASS | PASS | PASS | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | Actual SQL owner/current-scope grants; synthetic hosted identity |
| Annual current read / exact team-side lookup | PASS | NOT PROVEN | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | Historical42703 reproduction, existing unique index,1-row query plan |
| Annual v2 wire hash | PASS | PASS | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | Actual JSONB hash; v1 unchanged; full activation chronology not inferred |
| Annual workers / known42883 inventory | PASS | NOT PROVEN | PASS | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | Known14-function inventory,26-test selection |
| Routing gap1: valid diagnostic read admission | FAIL | FAIL | NOT PROVEN | FAIL | FAIL | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | RED; rejected source edit pending owner approval |
| Routing gap2: read success then write denial | NOT PROVEN | FAIL | NOT PROVEN | FAIL | FAIL | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | RED valid-read prerequisite; not evidence writes were admitted |
| Routing gap3: canonical outage/no fallback | NOT PROVEN | FAIL | NOT PROVEN | FAIL | FAIL | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | RED cannot reach intended transport classification |
| Director owner Odds calculation / publication | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | director-odds-publication13tests; fixed current read index; no owner publication automated |
| Required full Director setup/entry/auction/lifecycle capability parity | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | PARTIAL; retained SQL/model proof is not isolated client transport proof |
| PWA score persistence / recovery | PASS | PASS | PASS | PASS | PASS | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | Shipping adapter with injected localSQL transport |
| Build10 retained DTO decoding | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | 24 actual retainedSwift decoder checks; UTC condition; no physical client |
| Lock / Resume / Finalize scope | PASS | NOT PROVEN | PASS | NOT PROVEN | PASS | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | Phase2C current score interaction; no full Open/Prepare proof |
| Compatible release admission | PASS | NOT PROVEN | PASS | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | Two isolated retired-release admission tests; not hosted rollout/rollback |
| Zero-Google exercised tournament | PASS | PASS | PASS | PASS | PASS | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | 432 holes/24Final; no required jobs; actual remote sockets denied |
| Score history scale/tail follow-up | PASS | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | 12000 rollbackRPC samples; notHTTP/commit/power-losscapacity |
| Broad failure accounting | PASS | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | Exact493-file selection, individualdeletion/rename/failure identities; does not turnREDintoPASS |

Read the exact capability rows in[CAPABILITY-GAPS.md](CAPABILITY-GAPS.md), executed result counts in[EVIDENCE.md](EVIDENCE.md), and failure disposition in[TEST-ACCOUNTING.md](TEST-ACCOUNTING.md). Model/SQL tests for an existing protected Production-bound command do not prove it is callable by a safe isolated Director client.
