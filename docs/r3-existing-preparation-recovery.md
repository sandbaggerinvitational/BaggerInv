# Exact R3 missing-context recovery

This one-time Director operation materializes the missing scoring snapshots for the existing 2026 Round 3 pairings. It does not replace ordinary Tournament Setup guards and does not open the round.

The installed function binds setup 48, the exact pairing and current-authority fingerprints, 12 Singles matches, 24 unique golfers, Ocean Course/Gold, and approved handicap revision 13. It binds Net Skins configuration 3, Odds publication 7, and Calcutta configuration 2 / auction 37 / publication 41 / result 231. Any changed input denies before writes. Only empty S1 snapshots with no preparation, golf activity, access or leases qualify.

## Security and atomicity

Only `service_role` may execute the entrypoint. The unchanged Production runtime, authenticated Director identity, current role and entitlement checks remain mandatory. The state helper and immutable receipt table have no client grants; the receipt table has RLS. Advisory and NOWAIT table locks fence concurrent setup, score, identity and side-game writers. A failed eligibility check, any intermediate write failure or receipt failure rolls back the entire operation.

Each of the twelve matches receives S2 with server-derived participant/team handicap authority and the existing canonical 18 holes. The match points at S2; its existing hole rows point at S2; its setup detail records preparation at revision 48. Match revisions, participants, pairings, lifecycle, permissions, scores and results do not change. Match-revision/lifecycle side-game triggers are not invoked. The immutable receipt binds the 12 match IDs, 24 golfer IDs, exact dependencies, pre/post hashes, Director and timestamp. Retry reads the receipt and validates the same final state.

## Bounded live reads

The helper reads only current pointers, current configuration/publication fingerprints, current R1/R2 match headers, the 12 R3 contexts, 24 participants and 216 holes. Text sorting uses explicit C collation, independent of database locale. Active job metadata is bounded and contains only IDs/statuses. It never aggregates historical calculation input/checkpoint/result payloads. Do not run the prior historical eligibility aggregation on Production.

Deep preservation and semantic checks run only on the isolated copied database. They prove the existing Net Skins membership is unchanged; the installed Odds input comparison returns no changed inputs; and Calcutta financial/consumed inputs and all historical side-game records remain unchanged. The preexisting Calcutta UNAVAILABLE pointer is not repaired by this operation.

## Execution

1. Complete local and staged recovery, security, concurrency, rollback, actual Open/Lock/Resume and PWA Singles acceptance.
2. Freeze the source; follow normal protected deployment with an exact signed candidate/rollback plan and durable release lock. Never Force Promote.
3. Install the additive migration through the protected release procedure. Confirm unchanged ordinary guard definitions and repeated lightweight health.
4. Read fresh bounded fingerprints and exact closed R3 state. Supply the current authenticated Director and current release runtime scope. Invoke one operation UUID once.
5. If the response is lost, reuse the same UUID and receipt/readback; never invent another preparation attempt.
6. Require actual 12/12 READY, 12 Upcoming, 0 Live/access/leases/scores/results; verify preserved side-game pointers and R1/R2.
7. Close attempt/release lock. The owner alone performs Open Round after review. PWA is the designated R3 scorer.

Evidence for this execution is retained in `/private/tmp/bagger-r3-continuous-recovery`. Installation alone creates no tournament contexts or competitive writes. No native application or participant/PWA scoring source changes are included.
