# Canonical routing gaps

All three identities were reproduced before source changes. Current status is **BLOCKED / NOT PROVEN**, pending the explicit owner confirmation described in [ROUTING-ADMISSION-REVIEW.md](ROUTING-ADMISSION-REVIEW.md). No Google fallback is permitted.

| ID | Failing identity | Actual path | Root cause | Required proof |
|---|---|---|---|---|
| ROUTE-01 | all migrated candidate selectors resolve only certified Production shadow reads | request-bound diagnostic environment → domain selector → allowlisted canonical SQL read | The generic canonical selector lost recognition of the existing exact read-only transport scope | Positive canonical selectors plus exact identity/transport mismatch denial; no mutation rights |
| ROUTE-02 | candidate can never acquire Odds publication authority | candidate Odds input selector → publication admission | The positive read assertion fails before the denial assertion; this is not evidence of expanded publication permission | Canonical input readable while publication remains explicitly denied, including caller attempts to enable it |
| ROUTE-03 | representative candidate Supabase services fail closed with zero Google fallback | History and other canonical service adapters → request-scoped outage injection | History rejects configuration before it reaches intended canonical outage classification | Actual adapter reaches typed canonical outage, zero Google attempts and no fallback |

The legacy Google default/rollback and old provider-specific error assertions in the same files are distinct from these three required cases. They must be rewritten against the authorized canonical contract, never converted into passing provider behavior.

Before: [routing receipt](evidence/before/routing.json), [TAP](evidence/before/routing.tap.gz). Supplemental security expectations: `test/reliability-phase2c1-closure-routing.test.mjs`. Its initial result is RED, not coverage credit.

No Production request is part of this proof. Production-shaped constants in synthetic adapter tests are fixture identity only; remote networking is denied and actual fetch is replaced where a transport response is necessary.
