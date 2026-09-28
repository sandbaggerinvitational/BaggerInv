# Certification blueprint

This document proposes the 2027 certification pipeline. It does not claim that the pipeline or its gates are implemented.

Every change declares its semantic impact and the proof layers it affects. Commit CI runs deterministic checks. Pull-request certification adds the relevant SQL, API, security, and integration tests. Candidate certification adds performance, failure-injection, and lifecycle evidence. A tournament candidate adds the complete Never Again suite and a full synthetic tournament. The final candidate adds required physical-device and owner-acceptance evidence.

Protected promotion binds the exact release manifest to staged proof, rollback material, and a fresh bounded health read. Production acceptance is read-only unless an explicitly authorized real new-hole acceptance action is appropriate to the tournament context; certification must never create synthetic Production golf.

Engineering complete does not establish tournament certification. Source inspection does not establish runtime behavior. A simulator does not establish physical-device acceptance. A calculator result does not establish SQL behavior. A healthy query does not establish capacity.

Certification reports are generated from requirements and fresh artifacts. A missing, flaky, or failing P0 proof blocks promotion. A noncritical limitation may be accepted only with an identifier, impact, workaround, owner, and expiry; it cannot mask a core failure.

The readiness report covers scoring, lifecycle, side games, Native, PWA, Director, database, security, capacity, observability, operations, release control, and physical recovery. Each domain reports **PASS**, **FAIL**, or **NOT PROVEN**, with its last verification time, evidence, and limitations. It does not reduce readiness to an aggregate percentage.

Evidence includes the source SHA, build, schema and contract versions, configuration, fixture, compute profile, test artifacts, plans and distributions, physical-device results, chronology, known limitations, rollback material, and runbooks. Contract changes invalidate only the dependent proofs identified by the dependency graph. During the release freeze, source and configuration remain fixed.

See [54-TEST-MASTER-LIST.md](54-TEST-MASTER-LIST.md), [31-NEVER-AGAIN-SUITE.md](31-NEVER-AGAIN-SUITE.md), [59-TOURNAMENT-READINESS-STANDARD.md](59-TOURNAMENT-READINESS-STANDARD.md), and [EVIDENCE-BLUEPRINT.md](EVIDENCE-BLUEPRINT.md).
