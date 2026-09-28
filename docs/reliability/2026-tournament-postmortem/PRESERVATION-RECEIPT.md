# 2026 tournament reliability report preservation receipt

**Preserved at:** `2026-09-28T04:16:39.602599+00:00`  
**Source:** local postmortem output under `/private/tmp/bagger-2026-postmortem`  
**Destination:** `docs/reliability/2026-tournament-postmortem/`  
**Destination repository base SHA:** `b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6`

## What was preserved

- 107 of 107 required deliverables are present.
- 118 source-manifest artifacts were copied byte-for-byte and verified against their recorded byte counts and SHA-256 digests.
- `package-manifest.json` was also copied; it is intentionally absent from its own artifact list because a file cannot stably contain its own digest.
- 119 substantive root Markdown/JSON files were preserved in total.
- Root-level supplemental reports and durable schemas/catalogs were included. The source `working/` directory, generators, request transcript and scratch QA files were excluded.
- `SECRET-SCAN-REPORT.md`, `external-evidence-manifest.json` and `preservation-manifest.json` were generated as preservation metadata and were not part of the source package.

## Integrity

- Copy verification mismatches: **0**.
- Relative links within the flat report package remain unchanged. One source-package-relative link points to external evidence; it is intentionally unresolved in the repository and explicitly mapped in `external-evidence-manifest.json`.
- The source package validation reported zero broken local links and zero JSON parse errors.
- The copied source files remain byte-identical to the source package. No report conclusions or evidence claims were rewritten during preservation.

## External evidence handling

- The preserved reports contain 508 references to 81 unique machine-local paths across 23 files.
- All 81 normalized paths existed at preservation time.
- Raw external artifacts were **not copied**. Each machine path maps to a stable `evidence://bagger-2026/EXT-NNN` reference in `external-evidence-manifest.json`.
- Source paths that map to retained Git objects record the exact commit and repository-relative path. The Build 10 native commit is identified but is not in this repository object database.
- Non-source evidence remains explicitly unresolved pending bounded review, sanitization and storage in a private durable evidence archive.

## Exclusions and disclosure boundary

- Excluded: `working/**`, dependency trees, build products, binaries and every raw artifact outside the postmortem package root.
- This preservation does not turn proposed designs into implemented or tested controls.
- This preservation is suitable for a repository commit based on the package scan; it is not a public-disclosure approval for linked external evidence.
