# Incremental cost model

No new paid project, service or external scheduler is created. Planned new fixed recurring cost: $0. The existing Supabase project runs its local cron/queue; database compute and egress consume existing provider allowances/metering.

Illustrative full two-hour window: 120 invocations, each using the entire 60-second provider ceiling, one active vCPU and 2 GB memory in iad1. At $0.128/CPU-hour, $0.0106/GB-hour and $0.60/million invocations, the modeled function subtotal is $0.298472 before transfer, edge requests, database usage and credits. The 45-second soft limit generally lowers this; actual CPU, region, memory, overlap and I/O determine charges. This is an estimate, not a verified account bill or all-in spending cap. [Vercel current pricing](https://vercel.com/docs/functions/usage-and-pricing).

The local task provisions nothing and causes no hosted execution cost. Later installation must confirm the existing project plan/runtime/protection mechanism and extension availability; a required paid resource or external scheduler is an owner stop condition.
