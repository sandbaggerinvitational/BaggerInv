# Phase 1 telemetry privacy review

## Signed review record

- Review scope: Phase 1 operational telemetry event construction, RPC outcome semantics, request correlation, and the local tests that enforce the event allowlist.
- Reviewer: Native reliability forensic workstream (`/root/native_forensics`).
- Review date: 2026-09-28 (America/Chicago).
- Result: **PASS for the reviewed source and local test layer, with the limits below.**
- Production access: none. This review made no Production, staging, or application network call.

This is an engineering review record, not a cryptographic signature or approval to release.

## Reviewed controls

`lib/operational-telemetry.js` constructs events from a fixed set of fields. It does not copy request URLs, headers, request or response bodies, arbitrary attributes, SQL text, exception messages, or stack traces into an event. `operationMetadata` accepts only named identifiers, numeric counts or revisions, and a 64-character authority fingerprint. Secret-prefixed and JWT-like identifier values are rejected. Request correlation accepts only a UUID and generates a new UUID for any invalid incoming value.

The local observability tests cover these boundaries directly:

- unsafe and oversized request IDs, authorization headers, cookies, URLs containing an email address, secret API headers, exception messages, and arbitrary payload/SQL/header fields do not appear in emitted events;
- telemetry sink failure or rejection does not change an acknowledged operation result;
- concurrent request contexts do not exchange identifiers or authority revisions;
- output remains bounded to 64 events while retaining the final request summary;
- shared-cache responses do not receive a request-specific response header;
- mutation transport loss is `UNKNOWN`, a canonical rejection is `NOT_COMMITTED`, and an acknowledgement does not claim independent canonical readback;
- the explicit RPC-effect catalog classifies each instrumented RPC family as mutation, read, or unresolved dispatcher behavior;
- all exercised event branches validate against `docs/reliability/observability/OPERATIONAL-EVENT-SCHEMA.json`.

The protected-path equivalence test separately compares the actual Release 139 and Phase 1 implementations for authority and mutation order, RPC inputs and outputs, post-commit scheduling, and route response semantics. Its only permitted route response delta is the request-correlation header.

## Limits and required caller contract

The identifier grammar proves that a value has a bounded stable shape. It does **not** prove that every arbitrary matching string is free of personal data. Callers must supply only the documented nonsecret operational identifiers: operation, mutation, job, and match IDs. They must never map a person's name, email address, phone number, authentication subject, bearer token, cookie, or other personal or secret value into those fields.

The local source and test review does not prove deployed sink configuration, log retention, access control, export destinations, deletion, or incident-response handling. Those controls require an infrastructure-owned review of the actual configured telemetry sink before tournament activation.

Release and activation values remain absent unless deployment configuration or an already-performed trusted authority read supplies them. The telemetry layer does not fetch authority to fill missing metadata. An RPC acknowledgement records `canonical_readback=NOT_OBSERVED`; a separate canonical readback is required before any stronger certification claim.

## Current changed-file secret scan

The current workspace scan covered 136 changed or newly added text files; no binary file was skipped. It found no private-key block, JWT-shaped token, or credential-bearing URL. Credential-shaped matches from the secret-prefix, bearer, and high-confidence assigned-secret categories were confined to test sentinels in these files:

- `test/reliability-correlation-postgres.integration.test.mjs`
- `test/reliability-observability-review.test.mjs`
- `test/reliability-observability.test.mjs`
- `tools/reliability/native-never-again/shell/NativeShellPreservationExpectedRedTests.swift`

The Swift file is an immutable expected-red test fixture even though it resides below `tools/`. A broad bearer-language pattern also matched descriptive prose in `docs/reliability/architecture/SCORE-CRITICAL-PATH-BASELINE.md`; review found no assignment syntax, authorization label, or quoted credential literal on that line. No application source, runtime configuration, or migration matched these categories. This was a pattern scan, not proof that the changed files contain no personal data or secret. In particular, a string satisfying the telemetry identifier grammar is not thereby proven nonpersonal; the caller contract above remains required.

The package-wide secret scan remains a separate release artifact. Repeat it after the complete changed-file set is stable because Phase 1 files and final benchmark evidence are still changing; this current result does not replace the final scan.
