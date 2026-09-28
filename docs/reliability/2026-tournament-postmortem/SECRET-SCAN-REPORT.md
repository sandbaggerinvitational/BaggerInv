# Preservation secret and PII scan

**Scanned at:** `2026-09-28T04:16:39.602599+00:00`  
**Scope:** 119 substantive root Markdown/JSON files from the local postmortem package. The excluded `working/` scratch tree and external evidence payloads were not scanned by this report.

## Result

No actual sensitive value was found. The scan found zero private-key blocks, secret-shaped JWTs, common cloud/API token formats, credential-bearing database URLs, HTTP authorization values, Supabase project endpoints, sensitive URL query parameters, email addresses, phone numbers, or direct PII fields in root JSON.

All HTTP(S) links use public documentation/schema hosts: `supabase.com`, `docs.aws.amazon.com`, `vercel.com`, `developers.openai.com`, and `json-schema.org`.

## Literal references, not secrets

| File / field | Classification |
|---|---|
| `02-INCIDENT-REGISTER.md:462` — `SCORING_SESSION_SECRET` | LITERAL REFERENCE. Literal configuration identifier; no assigned value. |
| `08-BACKEND-HARDENING.md:41` — `SCORING_SESSION_SECRET` | LITERAL REFERENCE. Literal configuration identifier; no assigned value. |
| `31-NEVER-AGAIN-SUITE.md:165` — `SCORING_SESSION_SECRET` | LITERAL REFERENCE. Literal configuration identifier; no assigned value. |
| `AUDIT-COMPLETENESS.md:296` — `AUTHORIZATION` | LITERAL REFERENCE. Requested-section title/domain term; no credential value. |
| `SYSTEM-RETROSPECTIVES.md:12` — `SCORING_SESSION_SECRET` | LITERAL REFERENCE. Literal configuration identifier; no assigned value. |
| `incident-register.json:2283` — `SCORING_SESSION_SECRET` | LITERAL REFERENCE. Literal configuration identifier in retained narrative; no assigned value. |
| `incident-register.json:2344` — `SCORING_SESSION_SECRET` | LITERAL REFERENCE. Literal configuration identifier in retained narrative; no assigned value. |
| `test-catalog.json:401` — `SCORING_SESSION_SECRET` | LITERAL REFERENCE. Literal configuration identifier in a proposed test; no assigned value. |

## High-entropy structured values reviewed

`evidence-ledger.json` contains 41 values at entries `55` through `94` and `98`, field `aggregate_incident_conclusion_ref`. They are internal incident-reference locators, not credentials or authentication material. Commit SHAs and SHA-256 package hashes are also expected evidence identifiers.

## PII result

No email, phone, postal-address, personal-name field, username field, golfer-name field, participant-name field, or person-linkable ID field was found by the structured/root-text scan. Operational incident IDs, release numbers, build numbers, SHAs, request IDs and tournament object identifiers remain because they are technical evidence, not contact data.

## Limits

- Pattern scanning cannot prove that arbitrary prose has no sensitive meaning; human review remains required before public disclosure.
- External evidence files referenced under `/private/tmp` were intentionally not copied or content-scanned here. They require a bounded sanitization review before private archival or repository inclusion.
- Secret values must never be added when resolving configuration gaps described by these reports.
