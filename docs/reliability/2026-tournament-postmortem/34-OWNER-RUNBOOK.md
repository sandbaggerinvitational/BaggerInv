# Owner tournament-day runbook — proposed 2027 interfaces

**Audit boundary:** historical evidence and source review only. No Production/staging requests, mutations, builds, deployments or source changes in this audit. Proposed designs are not implemented or approved release evidence. Unknown measurements remain unknown.

**Status: DOCUMENTED, NOT REHEARSED.** “GO Check,” “Closeout,” “Scorecard Recovery” and “Next Safe Action” are proposed controls, not a claim they exist in Release139. Existing controls such as Open Round for Scoring must still follow installed authority until the redesign is implemented.

| Phase | Where / action | Expected canonical state / GO | Do not press / STOP | Fallback |
|---|---|---|---|---|
| Day before | Director Operations → readiness / data review | 24 roster, approved HI, correct courses/tees/formats; R1/R2 contexts; R3 future state explicit; auction and side games reviewed | No Tournament Ready on missing physical/performance proof | Delay digital reliance; rehearse cards |
| R1 morning | Operations → GO Check | 6 READY/Upcoming; 24 golfers; zero access/leases/scores; resources green | No Open with stale context or red DB | Keep scoring closed, cards ready |
| R1 Open | Review → Open Round for Scoring once | Receipt proves 6 Live/6 access | No second request after timeout | Exact status/same-ID recovery |
| R1 during | Current Round / scoring health | New Official holes and canonical readback | Do not resave Official hole to clear client | Accepted PWA, otherwise cards |
| R1 closeout | Closeout → review completed cards; Finalize supported matches | 6 Final,108 Official,6 results,0 access/leases | No finalization of missing/conflicting golf | Physical recovery |
| R1 side games | Lifecycle → eligible calculation → Review → Publish | Separate result/publication receipts | No automatic financial approval | Delay publication, golf unaffected |
| R2 Open/play | GO then Open once; same scoring checks | 6 READY→6 Live; Scramble contract | No assumed readiness from R1 | PWA/cards |
| R2 closeout | Closeout, eligible Net Skins/Calcutta/Odds review | 6 Final,108 Official; After-R2 milestone | No stale READY job hidden | Resolve exact supported dependency |
| R3 pairings | Setup → Round 3 Pairings → Review/Confirm | 12 Singles,24 unique; setup revision advances | Pairing success is not preparation success | Keep round closed |
| R3 preparation | Operations → proposed Prepare All → readback | 12 current contexts and 12 READY; Ocean/Gold, approved HI | Do not bind future side-game authority before prep if guarded | Exact blocker workflow, no bypass |
| R3 side games | Configure membership / review R3 Odds | Config matches prepared pairings; publication inputs current | No silent inherited stale result | Delay optional publication |
| R3 morning | GO Check + resource headroom | 12 Upcoming,0 Live/access/lease/score/result | No Open on merely healthy HTML | Closed + physical contingency |
| R3 Open/play | Review Open once; receipt; designated scorer | 12 Live/12 access; Singles scoring | Never replay unknown with new ID | Same-ID status; PWA/cards |
| R3 closeout | Closeout/recovery/Finalize | 12 Final,216 Official,12 results,0 access/leases | No guessed physical gross | Retain cards for review |
| Final side games | Review current final calculations | Net Skins/Calcutta/Odds final or explicit waiver | No ownership/publication change without review | Financial closeout can remain pending |
| Tournament close | Close Tournament → champion/result/archive review | 24 Final,432 match-hole Official, canonical points,0 access/leases | No close hiding unresolved conflicts | Leave close pending |

If scoring fails, preserve gross values and the original operation. Switch clients only after checking prior-hole Official status and unresolved local intent. A feature-only outage does not justify locking an otherwise safe scoring round. Actual integrity/security threat does justify suspension/owner Lock under the supported contract.
