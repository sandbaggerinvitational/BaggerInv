# Operations blueprint

This is a proposed operating model for 2027. A runbook remains **DOCUMENTED**, rather than rehearsed or certified, until the required people have executed it against the named environment and retained the evidence.

## Tournament sequence

The day before play, the owner reviews the roster, handicap index, course and tee context, and financial inputs. Tournament Mode is enabled only under owner authority. Operations also verify current metrics, capacity headroom, backups, and the physical fallback.

On the morning of play, the Director reads the current brief, records GO or NO-GO, and, after GO, the owner opens the round. The resulting canonical receipt and readback establish the round that is authoritative.

During play, the group uses a designated primary client. Operations watch service health, scoring completeness, and any mutation whose outcome is unknown. Golfers continue to record gross scores physically, even when the primary client is healthy.

After play, the Director completes closeout, invokes the supported Finalize operation, confirms eligible side-game computation, and presents results for owner review and publication. The interface must always show the next safe action.

For R3, the proposed sequence is:

1. Confirm R2 is complete.
2. Clear only the exact obsolete Odds state identified by the current dependency check.
3. Generate and review pairings.
4. Prepare all 12 R3 matches.
5. Read back exactly 12 READY matches.
6. Configure and publish eligible side games.
7. Run the morning GO or NO-GO check.

## Failure handling

The fallback order is the Native client, an independently healthy PWA, the Director's physical recovery workflow, and paper or Notes. The PWA is a second client path; it is not a database failover.

When the Native score queue fails, it preserves the submitted intent and mutation ID and reads the Official score before any handoff or retry. A server failure preserves the gross score and stops ambiguous retry until the operation is classified as committed, not committed, or unknown. An optional-feature error stays within that feature. Lock the tournament only when canonical integrity or owner authority is threatened.

## Close and correction

Final close requires complete golf, results, points, and champion facts; zero active access grants or leases; zero unresolved mutations; side games either complete or covered by an explicit waiver; and owner confirmation of the archive.

Any post-close correction must be versioned, reasoned, and audited. A correction that changes competitive results requires stronger owner approval than a display-only correction.

The operating goal is that normal tournament work never requires Terminal, SQL, or Codex. Emergency release work remains engineering-controlled and limited to the exact approved scope.

See [34-OWNER-RUNBOOK.md](34-OWNER-RUNBOOK.md) and [35-INCIDENT-RUNBOOKS.md](35-INCIDENT-RUNBOOKS.md) for the proposed procedures and recovery detail.
