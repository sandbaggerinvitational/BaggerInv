# Local certification decision

PASS for the locally implemented private Queues v2 candidate. Hosted Part2B1 is
not certified by this decision. Native provider gates remain mandatory before START.

| Proof | Result |
|---|---|
| Core protocol/security/canonical worker tests | 46 pass / 0 fail / 0 skip |
| Durable transient/terminal/halt recovery | 4 pass / 0 fail / 0 skip |
| Real process crash/lease reclaim/supersession/contention | 6 pass / 0 fail / 0 skip |
| Combined focused | 56 pass / 0 fail / 0 skip |
| Frozen broad application suite | 4,077 pass / 20 established failures / 0 skip |
| New unexplained failures | 0; exact baseline failure names/counts compared |
| Production build | Exit 0 |
| All final executable manifests | Stable and identical across proof runs |
| Secret scan | 0 matches; no real credential file used |
| 864 holes | Not run; scoring/domain implementations unchanged |

Machine receipts and compressed raw logs are under evidence/. The raw broad exit
code is retained as 1 because the 20 baseline failures were not hidden or repaired.
The broad result is accepted only by exact comparison with the retained baseline.
Thirteen complete dependency-list assertions were updated for the approved pinned
SDK; no product behavior or presentation assertion was removed. Initial harness
setup assertions and mock processor completeness were corrected; final tests have
no unexpected failure. Initial runs overlapping final source edits were superseded
by final frozen-source runs, not used as the final certification claim.

The worker, delivery engine, demand producer, registration and base Vercel manifest
are byte-identical to the approved base. The shared bounded supervisor changes only
the non-admitted duplicate early return. All domain/claim/retry/recovery logic is
reused; no scoring chronology rerun is justified.

The private new control functions/tables remain denied to anon/authenticated/
service_role. Only consumption is available through the existing narrow server
role wrapper, requiring an owner-minted opaque reservation and exact current
Certification binding. No client minting, role grant, private-core exposure,
existing RLS change, generic proxy or Production configuration was introduced.

The current installed supervisor can remain. The forward artifact safely retires
old dispatch functions and adds queue metadata while preserving the original
installation receipt and truthful history. It was installed/replayed only on
owned local PostgreSQL. No hosted SQL/configuration/deployment was changed.

Ready for separate owner authorization to install/deploy/rebind and run gated
hosted Part2B1. Account entitlement/private build/protected Preview/real identity/
delivery/timing/metering/termination remain unproven locally. Stop if any fails;
do not weaken reservations or native privacy to proceed.
