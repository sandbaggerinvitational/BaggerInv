# Side-game lifecycle

## Design rule

Scoring commits canonical golf. Side games consume committed golf asynchronously. A side-game failure may make that side game stale or unavailable; it must not make a valid gross score fail.

Each side game has five separate authorities:

1. Configuration or financial inputs.
2. Public visibility/publication.
3. Recalculation demand.
4. Worker job and lease.
5. Immutable result plus authoritative current pointer.

The Director must see those states separately. A single label such as CURRENT or UNAVAILABLE is insufficient when configuration, publication, job and result disagree.

## Calcutta

Calcutta has Director-controlled market publication and worker-produced results. Publication does not mean a result is current, and a result does not itself grant public visibility.

The latest retained 2026 correction snapshot was captured September 27 at `2026-09-27T12:26:41.188212Z`, on Release 139/activation 238/SHA `b2065c...`. It recorded configuration 2, auction 37, publication 41 PUBLISHED, result 424 OFFICIAL, 24 purchases totaling $18,500, complete ownership, and 24 final matches. This is a historical snapshot, not a claim about live state today.

The supported correction behavior evidenced by installed functions is:

1. Unpublish. This writes a new publication revision and hides participant market/result visibility. It preserves the auction and result history.
2. Replace an auction entry through the normal Director flow. The server builds and validates a complete auction manifest. It writes a new immutable auction revision, creates a new UNPUBLISHED publication revision, supersedes active jobs and the old current result, and resets the scalar result revision pending recalculation.
3. Verify every purchase price, all ownership fractions, 100% ownership per golfer, total purchase value and unchanged configuration. A total-only comparison is insufficient.
4. Republish. This writes another publication revision and enqueues recalculation.
5. Claim, calculate and complete through the guarded worker. Only completion installs a new current result.
6. Verify participant market/result projection and payout ownership against the intended correction.

Golf is not edited in this workflow. The physical scoring ledger remains a source input. With one entry save and no other changes, the retained report illustrates 37/41 → unpublish 42 → auction 38/publication 43 → publish 44; actual future revisions depend on concurrent legitimate actions.

Evidence: `/private/tmp/bagger-calcutta-ownership-readonly/REPORT.md:3-27`; source functions at `supabase/production_migrations/202608290056_production_calcutta_v1.sql:1033`, `:1698`, and `:1867`.

## Net Skins

Net Skins configuration fixes round membership. Results are scoped per round. In the 2026 contract, valid OFFICIAL worker completion publishes automatically; there is no separate review-then-publish step. Review canonical golf before processing. An incomplete round produces PROVISIONAL private work with no participant result.

The 2027 design should keep configuration shared only if that is an intentional product rule, while jobs, current pointers and publication remain per round. Director must be able to see R1/R2/R3 independently and retire stale unpublished work without changing membership.

The configured pre-golf response is valid with `published=false`, null result revision and null presentation. That lifecycle state must remain contract-compatible with every supported client. A server must never fabricate an empty published result merely to satisfy a client adapter.

Evidence: `/private/tmp/bagger-net-skins-incident/REPORT.md:60-80` and `/private/tmp/bagger-net-skins-sql-repair/REPORT.md:157-169`.

## Odds

Odds separates current public publication from calculation lifecycle. Incident 016 had both a current After-R2 publication and an old After-R1 SUCCEEDED/READY unpublished calculation. Each independently blocked setup; the old READY row also blocked withdrawal.

Required states are explicit:

- calculation requested/pending/running;
- calculation succeeded and ready for review;
- calculation stale and retained;
- calculation superseded;
- snapshot published/current;
- publication withdrawn while immutable history remains.

Every blocking state needs a supported Director action or an explicit no-safe-action explanation. The server may automatically mark an unpublished calculation stale only when a tested policy proves it is unreferenced and canonical inputs advanced. Published or referenced work is never auto-superseded.

Evidence: `/private/tmp/bagger-r3-pairing-blocker/REPORT.md:72-92` and `/private/tmp/bagger-r3-odds-clearance/REPORT.md:3-21`.

## Event flow

```text
canonical score commit
  -> minimal durable event
     -> Calcutta invalidation consumer
     -> Net Skins invalidation consumer
     -> Odds milestone/freshness consumer (when relevant)
     -> projection and mirror consumers

consumer
  -> compact semantic source revision
  -> deduplicated job
  -> claim/lease
  -> calculate
  -> compare-and-swap completion
  -> current pointer transition
  -> publication transition only under the domain policy
```

The existing code has a durable Google outbox and side-game job tables. A unified minimal side-game outbox is proposed; it is not claimed as already implemented.

## Tournament automation

Safe automatic actions:

- append the minimal committed-change event;
- deduplicate recalculation demand;
- supersede an older unclaimed job with the same scope/input lineage;
- claim and calculate provisional results;
- mark source-advanced unpublished work stale under a proved policy;
- surface blockers and readiness.

Require Director confirmation:

- publish or withdraw Odds;
- publish or unpublish the Calcutta market;
- change Calcutta purchase/ownership facts;
- change Net Skins membership;
- accept any financial payout result;
- override a semantic dependency incompatibility.

Never automate:

- inventing missing golf or side-game membership;
- weakening activation or source guards;
- publishing a stale or partially complete financial result;
- editing Official scores to make a side game calculate;
- repeating a job or operation after an unknown response without receipt reconciliation.
