# Score-path proof matrix

PASS is only the explicitly exercised slice, not universal coverage. SQL public function calls are not HTTP/PostgREST proof. Existing mocked API tests are listed separately; RPC/API remains NOT PROVEN here for the integrated candidate. SOURCE PASS means inspected, not behavior certified. Failure injection PASS on a defect row means the defect was reproduced; FAIL in capability columns remains.

| Capability | SOURCE | SQL | RPC/API | INTEGRATION | PERFORMANCE | FAILURE INJECTION | CONCURRENCY | PRODUCTION | PHYSICAL |
|---|---|---|---|---|---|---|---|---|---|
| Canonical gross write | PASS | PASS | NOT PROVEN | PASS | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN |
| Authorization | PASS | PASS | NOT PROVEN | PASS | N/A | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN |
| Idempotency | PASS | PASS | NOT PROVEN | PASS | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN |
| Scoring context | PASS | PASS | NOT PROVEN | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN |
| Handicap authority | PASS | PASS | NOT PROVEN | PASS | N/A | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN |
| Strokes | PASS | PASS | NOT PROVEN | PASS | N/A | PASS | N/A | NOT PROVEN | NOT PROVEN |
| Net | PASS | PASS | NOT PROVEN | PASS | N/A | PASS | N/A | NOT PROVEN | NOT PROVEN |
| Hole result | PASS | PASS | NOT PROVEN | PASS | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN |
| Match state | PASS | PASS | NOT PROVEN | PASS | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN |
| Required receipt | PASS | PASS | NOT PROVEN | PASS | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN |
| Calcutta score isolation | PASS | PASS | NOT PROVEN | PASS | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN |
| Net Skins score isolation | PASS | PASS | NOT PROVEN | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN |
| Odds direct score isolation | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN |
| Timeout | PASS | PASS | NOT PROVEN | PASS | NOT PROVEN | PASS | PASS | NOT PROVEN | NOT PROVEN |
| Lost response | PASS | PASS | NOT PROVEN | PASS | N/A | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN |
| Concurrency (tested score cases) | PASS | PASS | NOT PROVEN | PASS | NOT PROVEN | PASS | PASS | NOT PROVEN | NOT PROVEN |
| Lock race | PASS | PASS | NOT PROVEN | PASS | NOT PROVEN | PASS | PASS | NOT PROVEN | NOT PROVEN |
| Finalize race | PASS | PASS | NOT PROVEN | PASS | NOT PROVEN | PASS | PASS | NOT PROVEN | NOT PROVEN |
| Best Ball | PASS | PASS | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN |
| Scramble | PASS | PASS | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN |
| Singles | PASS | PASS | NOT PROVEN | PASS | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN |
| Irrelevant history (frozen 2026 fixture) | PASS | PASS | NOT PROVEN | PASS | PASS | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN |
| Future annual claim initializers | PASS | FAIL | NOT PROVEN | FAIL | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN |
| Autonomous derived retry | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN | NOT PROVEN |
| Participant outcome after revocation | PASS | FAIL | NOT PROVEN | NOT PROVEN | NOT PROVEN | PASS | NOT PROVEN | NOT PROVEN | NOT PROVEN |

Core SQL tests use an explicit synthetic runtime/admission; active annual attestation is not inferred. Context/handicap PASS preserves the prepared snapshot and compared formulas; it is not a full handicap approval workflow. Lost-response SQL PASS means backend termination/readback, not mobile UX. Odds SOURCE shows no direct calculator in scoring, while broader Odds correctness remains unproven. Full-round proof covering 432 holes + 72 edge holes is not the entire chronological tournament. See [certification](CERTIFICATION.md) and the [ledger](evidence-ledger.json) for tests, fixtures, and limitations.
