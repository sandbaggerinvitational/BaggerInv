# Change summary and review scope

Only Phase 2 migration, tests/benchmarks, evidence, and reliability documentation change. Shipping native, application score rules, API response models, handicap formulas, client authorization, and Production are unchanged.

| File / family | Why / requirement | Behavioral effect | Proof / risk |
|---|---|---|---|
|`supabase/production_migrations/202609280121_score_derived_intents_v1.sql` |BE-SCORE-002,BE-JOB-001,DB-PERF-001 |Score-origin derived materialization becomes durable intent; existing worker claims drain; pending reader/close integration; exact rehearsal predicate index |SQL atomicity/consumer/eligible/migration/plan proofs; high deployment risk until open delivery/attestation gates close |
|`test/support/reliability/phase2-score-fixture.mjs` |Trustworthy actual SQL score/failure/concurrency proof |Owned isolated fixture,full seed mutation identity,explicit synthetic runtime substitutions |432 distinct IDs,fullround oracle; hosted admission intentionally absent |
|`test/support/reliability/phase2-eligible-history.mjs` |Force Release 139 applicable receipt branches |Synthetic recognized current/stale/superseded/incompatible receipts |SQL branch spies; protected issuer lifecycle not proven |
|`test/reliability-phase2-score-proof.integration.test.mjs` |Invariants,idempotency,atomicity,unknown outcome,concurrency,golf |Actual canonical calls,20clientrace,owned restart,fault hooks,fullthreeformats |30 behavioral cases; test-only destructive faults restricted to owned cluster |
|`test/reliability-phase2-derived-proof.integration.test.mjs` |Durable delivery and isolation |Three consumer failures,coalescing,backlog,ordering,burst,privilege checks,standalone control preservation |14 behavioral cases; explicit drains do not prove autonomous scheduling |
|`test/reliability-phase2-migration-safety.integration.test.mjs` |Safe candidate install and hidden branches |Clean-effective/upgrade,reapply/hash rejection,grants/manifest,scope,current-generation,annual 42883,worker40P01 |11 cases; known defects characterized,not marked fixed |
|`test/reliability-phase2-eligible-history.test.mjs` |Actual SQL/engine side-game equivalence |16branch rows +publicclaim/calculator/completion checks |19Node tests; syntheticPROVISIONAL financial scope |
|`test/reliability-phase2-fence-history.test.mjs` |Required guard must exclude irrelevant restored history |Actual guard/RPC,0/100/1000rows,index plan/security truth |4Node tests; isolatedcandidateindexdrop/reinstall only |
|`tools/reliability/benchmark-phase2.mjs` |BE-SCORE-002/PERF-001 |Validated accepted score samples,resource metadata,reset counts,plans |1000per scale; rollbackRPCtiming,nohostedlatency |
|`tools/reliability/benchmark-phase2-eligible.mjs` |Eligible history uncertainty |8branches×4scales×30accepted writes,deterministicorder |Empiricalp95;p99unproven |
|`tools/reliability/measure-phase2-locks.mjs` |Lock/transaction budget |Test-only timestamp after actualmatchlock,serverRPCclock,transaction wallbounds |100percase; exactCOMMITrelease notmeasured |
|`tools/reliability/phase2-plan-capture.mjs` |Queryplan regression evidence |Nestedauto_explaincapturedasdeduplicatedrepresentatives |Overlappingnestedmetricscannotbesummed |
|`tools/reliability/phase2-performance-gate.mjs` and its test |Fail closed on missing or inconsistent proof |Checks provenance,allscales/branches,counts/percentiles/variance,forbiddenhistoryfamilies |18UNITtests; approvedfalse; independentplanreviewrequired |
|`tools/reliability/phase2-network-deny.cjs` |ZeroProduction boundary |Blocks remote TCP/TLS/socket traffic for broad/build child runs |Localfoundation/network safety tests; no live target accepted |
|`tools/reliability/run-phase2-application.mjs`, comparison helper and its test |Exact baseline regression comparison |Same493filemanifest on exactPhase 1 andcandidate; credentialstrip/networkdeny |4127/26 both; first freeze diagnostic difference explicit; six UNIT cases reject hidden/new failures and require review of changed diagnostics |
|`tools/reliability/certify-phase2-foundation.mjs` |Preserve Phase 1 safeguards |Runs unit,baselineSQL,build separately; writesPhase 2 receipts |NoPhase 1ledgerrewrite |
|`tools/reliability/collect-phase2-evidence.mjs` |Traceable certification |Hash-bound claims/artifactmanifest; rejects incomplete measurement claims |PARTIAL remains explicit; no autoapproval |
|`docs/reliability/phase2/**`,ADR |Review,proof,remaining P0,deployment-only plan |No production behavior |Links/hashes/counts/source-scope/secret review |
|Never Again catalog additive entry |NA-2026-019 |Adds current Phase 2 proof pointer without altering Phase 1 observation |Native expected-red states retained |

New table:one. New table indexes:four including primary/unique. Existing-table indexes:one precise partial rehearsal guard index. New private intent functions:three plus manifest wrapper. Sixteen existing function definitions patched with exact source-hash checks, including four trigger functions. Trigger registrations are not dropped/recreated. Core `submit_production_hole_score`, `finalize_production_match` and `match_progress` bodies are unchanged. No timeout increase.

Deployment is blocked pending supported recovery, autonomous delivery, annual runtime/attestation and complete non-Production proof. No live migration/rollback was executed. The three-family intent approach is an ADR variation requiring review; it does not silently close the broader one-event/five-consumer postmortem requirement.
