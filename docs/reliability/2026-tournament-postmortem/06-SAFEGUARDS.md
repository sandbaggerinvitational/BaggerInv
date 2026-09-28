# Safeguards retained and hazards redesigned

| Control | What it prevented / evidence | Friction | Decision |
|---|---|---|---|
| Canonical server strokes, net values, and results | Client display and queue faults did not rewrite golf; R1 allocations and final cards remained canonical | Server availability is a single critical dependency | KEEP; bound the critical path |
| Gross-only input | Recovered cards did not invent net or handicap values | Requires a proper recovery UI | KEEP |
| Atomic whole-round transaction | The R1 first-write error rolled back all 6 matches; the original R3 Open produced no child receipts | An unknown response is difficult for the owner to resolve | KEEP; add self-certifying receipt UX |
| Idempotent mutation ID | A relaunch replayed the same ID and produced one commit; changed payload conflicted | The client latch hid a useful action | KEEP; expose unknown outcome |
| Readiness and dependency guards | R3 could not Open with stale snapshots; side-game facts remained protected | Semantically compatible preparation was blocked | REDESIGN around narrow facts; never bypass |
| Release and activation guards | Prevented mismatched runtime authority | Pending jobs were stranded; an audit advanced activation | KEEP for security; decouple compatible job contracts |
| Durable release lock and signing | Bounded reviewed promotion without force | Owner Terminal access was required away from the Mac | KEEP emergency security; a planned freeze should avoid routine use |
| Canonical readback and receipts | Distinguished UI claims from real 0/12 state; skipped 38 matching holes | Required manual engineering inspection | AUTOMATE scoped readback |
| Physical cards | Recovered uncommitted golf | Added transcription and verification burden | KEEP; add Director recovery |
| PWA fallback | A native queue fault did not end R1/R2 | The first use exposed a missing key; the shared server later failed | KEEP as a first-class path and certify independently |
| Fail-closed authority | Database unavailability denied unsafe progression | A generic error looked like incompatibility; native global reset removed context | KEEP the write fence; preserve UI and intent |
| Exact job recovery | Preserved the same Calcutta authority instead of fabricating an acknowledgement | Hidden engineering capability | Provide supported job contracts and receipts |

Move historical fingerprints, derived financial recalculation, nonessential public projections, and deep diagnostics off the scoring critical path. Keep audit, receipt, idempotency, and scoring math transactional. Guard correctness and usability both matter. “Denied safely” is not sufficient product readiness when no supported clearance exists.

