# ADR: retire Google runtime

Status: OWNER ARCHITECTURAL DECISION; CANDIDATE IMPLEMENTATION UNDER NON-PRODUCTION REVIEW.

Context: canonical PostgreSQL authority coexists with historical Google default readers, mirrors, archive jobs and annual/release prerequisites. Financial sync callbacks are more than a pure report export. Phase2C cannot close required-delivery proof by pretending an obsolete consumer is reliable.

Decision: remove Google runtime authority/consumers/gates, preserve canonical snapshots/receipts and historical evidence, and reuse canonical current/revision contracts. No new service/provider/outbox is introduced. Missing replacements remain blockers, never waived.

Alternatives: harden Google delivery (retains unnecessary coupled state); silently disable workers only (strands jobs/admission); delete all Google references (destroys provenance); provider replacement (adds cost without required authority). None satisfies the owner's simplification decision as well as bounded canonical authority.

Consequences: fewer credentials, outbound destinations and failure classes in the candidate; local/Preview legacy operations need actual canonical replacements; human spreadsheet convenience may be lost and is not silently certified. Current deployment unchanged.

Preservation/rollback: retain historical jobs/data and old Git source; external artifacts/credentials untouched. Atomic migrations preserve evidence, revoke obsolete service execution and change implementation manifests. Later deployment requires coordinated app/database compatibility, staged upgrade and rollback rehearsal; no unreviewed credential revocation.

Evidence and exact limitations: [Phase2C.1](../reliability/phase2c1/README.md), especially dependency register, zero-Google proof, client compatibility and certification.
