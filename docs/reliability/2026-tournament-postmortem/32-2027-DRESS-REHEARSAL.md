# Chronological 2027 dress rehearsal

**Audit boundary:** historical evidence and source review only. No Production/staging requests, mutations, builds, deployments or source changes in this audit. Proposed designs are not implemented or approved release evidence. Unknown measurements remain unknown.

## Calendar and freeze

T-90 architecture/contracts accepted; T-60 native reliability engineering complete and backend fundamentals stable; T-45 mixed-version beta and performance fixtures; T-30 feature freeze and full synthetic tournament; T-21 physical tournament; T-14 owner rehearsal and bug-fixes-only; T-10 defect cutoff review; T-7 exact candidate/contract freeze with only proven P0 changes; T-3 capacity configuration already rehearsed, no architecture changes; T-1 bounded GO certification. Native submission/adoption must precede backend final freeze with enough App Review/TestFlight contingency; no exact Apple turnaround is promised.

## Exact chronology

Day−1 load real-scale synthetic roster/teams/courses, approve final HI, prepare R1/R2, deliberately leave R3 unpaired, enter auction/ownership, publish and actually process Calcutta, configure Net Skins and Odds; participant/spectator sign-in. Run the real SQL functions, not calculator shortcuts.

R1: GO→owner Open→18 holes for six Best Ball matches with 24 golfers and spectators→lost ACK/duplicate/multi-device/bad network injection→audited correction→Finalize→closeout→Net Skins process/review→Calcutta round update→After-R1 Odds review/publication.

R2: identical chronological operations for six Scramble matches, including app/session held alive from R1 and release-compatible read refresh. Finalize/closeout/side games/After-R2 Odds.

R3 night before: resolve exact Odds dependencies via Director→owner confirms24 golfers/12Singles→PrepareAll→12/12 canonical READY→Net SkinsR3 config→R3 pairing Odds→GO. Inject stale unpublished job, incompatible true dependency and missing preparation separately. No engineering explanation should be required for ordinary steps.

R3 morning: simulate overnight DB restart in isolation, recover bounded health→GO→Open with lost response→status resolves without duplicate. Play full18Singles, physical-card recovery drill, same-match contention, then Finalize/closeout.

Final: all432 Official match-holes and24results, net/strokes/allocations/points verified, final side games or explicit waivers, champion, records/history, zero permissions/leases, owner Close/archive. Exercise ownership correction with unchanged purchase prices and auction total as a separate audited scenario.

## Critical acceptance checklist

Each item is PASS / FAIL / NOT TESTED / NOT APPLICABLE with signed rationale for NA. No PARTIAL PASS or PASS by similar test. Mandatory: R1/R2 GO/Open/18holes/Finalize/NetSkins/Calcutta/Odds; R3 pairings/prepare/config/Odds/GO/Open/18holes/Finalize; final side games/teamresults/champion/history/accessrevocation/zeroleases; DBhealth/native navigation/PWAfallback/physicalrecovery. Every operation requires scoped canonical readback. A failed prerequisite invalidates downstream chronology until rerun from appropriate verified fixture.

## Evidence and owner standard

Freeze manifest, test layers, operations, latencies/resources, seed, failures, fallback usage, manual interventions and final integrity hashes retained. Engineer intervention on a routine workflow is a readiness failure, even if final scores are correct. Owner rehearsal is separate from engineering automation and includes score timeout, stale job, missing context, unavailable feature and unknown Open. Owner uses actual mobile Director without SQL/Terminal/Codex.

Before final GO meeting ask: any P0 open or NOT PROVEN? physical scoring complete? chronology complete? capacity headroom measured? fallback/restore/runbooks rehearsed? rollback compatible? Any required NO means NO-GO. Known noncritical limitations need specific impact/workaround/owner acceptance/expiration.
