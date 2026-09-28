# Source and evidence binding

Implementation commit: `73abf170a6ea4457327031ea903b42bcd56120be`. Phase 1 base: `184b5c65a8e63784e1af8d38121fa2e16a015628`. Branch: `codex/reliability-phase2-score-path`.

20 source/test files were committed together. [Machine receipt](source-receipt.json) records every SHA256; [evidence ledger](evidence-ledger.json) binds tests and measurements. Tests executed before commit on the exact base plus the candidate files; their historical execution HEAD is preserved rather than rewritten. The evidence compiler HEAD identifies evidence generation, not a new test run.

Final migration SHA256: `cd9f6a784741d9e41c7f2e267bf4135549aeeb61333a22e4a31d9a174a3651a8`. The following documentation/evidence commit does not alter this implementation. The final package SHA is returned to the owner rather than fabricated inside a self-referential file.

No merge, Production query/deployment/mutation or Build 11 implementation. Certification remains PARTIAL; all future promotion requires separate owner authorization.
