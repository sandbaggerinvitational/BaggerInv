# Candidate manifest

**PARTIAL — NOT READY FOR STAGING.** [Exact source manifest](candidate-manifest.json).

- Base / recorded execution HEAD: `b1ceaa89f2d7cd0cdf2835aba04a24aca442ca18`.
- Isolated branch: `codex/reliability-phase2c-recovery-delivery`.
- Candidate source commit: `aa9122daf847a7e18717cf24c8241950a398d988`.
- Source paths: 78; exact byte hashes and migration122–124 fingerprints are retained.
- Toolchain: Node26.7/npm11.19/PostgreSQL17.11, isolated synthetic Unix-socket clusters. Swift model decoding is macOS/UTC, not physical.

Tests executed with the recorded base HEAD plus uncommitted exact source dependency manifests. After commit, the listed source bytes are independently compared with the commit object. The final evidence/report packaging commit is returned in the final response; a report cannot contain its own Git commit hash. No historical receipt is rewritten to claim execution at a later SHA.

Production reads/mutations/deployment/schema changes, real competitive changes, staging deployment by the agent and Build11 implementation: NO. External Git-provider Preview automation was not inspected. Future deployment remains HIGH risk and separately authorized; P0-B Google/export delivery must first be resolved.

The retained Phase1/Phase2 baselines remain historical. Current benchmarks are candidate observations, not owner-approved Production SLOs. [Certification](CERTIFICATION.md), [deployment boundary](DEPLOYMENT-PLAN.md), [next task](NEXT-PHASE.md).
