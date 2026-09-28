# Top ten automation priorities and ROI

Relative ranking uses incidents addressed, owner burden and implementation complexity; no fabricated hours or financial savings.

| Rank | Automation | Value | Complexity | Safety boundary |
|---|---|---|---|---|
| 1 | Exact mutation status and canonical readback | 018/006/017; prevents false success/failure | M | Owner authorizes mutation; resolver reads |
| 2 | Round GO and Prepare verification | 017/013; catches missing contexts before Open | M | No automatic Open |
| 3 | Score critical-path performance gate | 019; prevents an all-client outage | M/L | CI only |
| 4 | Database headroom and admission alerts | 022–024; stops dangerous diagnostics | M | No automatic competitive change |
| 5 | Round closeout | 020; finds missing golf/access | M | Owner Finalize/Close |
| 6 | Director Scorecard Recovery | 020; removes emergency engineering | L | Owner reviews gross values |
| 7 | Stale-job detection and supersession | 011/016; prevents hidden blockers | M | Exact unpublished safe class only |
| 8 | Next Safe Action and side-game lifecycle | 016/017; reduces hidden ordering | L | Publications reviewed |
| 9 | Evidence and claim generator | All proof gaps; prevents proxy PASS | M | Never fabricates proof |
| 10 | Current-state brief and invariants | 017/018/025; simpler owner status | M | Reads and alerts only |

Trigger, action, failure and receipt fields are in the [automation master](52-AUTOMATION-MASTER-LIST.md). Automations fail visibly with stale or unknown authority; none may clear a blocker by altering competitive meaning.

