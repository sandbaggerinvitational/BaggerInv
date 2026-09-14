# Global native portrait policy — additive backend contract

Production base: release 108, `1116d817fc3af9893bd326bf419f91d033632ecd`.
This candidate adds no competitive-data writes and changes no existing read DTO.

## Contract

Authenticated `GET /api/mobile/v1/portrait-policy` returns the schema in
`contracts/mobile/v1/portrait-policy.schema.json`. It uses existing bearer,
certification, current-tournament, post-read identity and reviewer-entitlement
checks. Reviewer access is restricted to the same GET policy read. No public or
client mutation endpoint exists. Responses are private/no-store, without ETags.

The response contains all canonical current/historical Player IDs (bounded to
4096), policy ACTIVE or SUPPRESSED, per-player revision, and global revision.
It contains no Auth IDs, names, contacts, photo URLs, or deletion reasons.
ACTIVE means no suppression recorded, not that an image necessarily exists.
Unknown/omitted players must not be inferred to have been deleted.

SUPPRESSED is terminal in v1. Native clients must persist learned suppression
independently of cached presentation DTOs, apply it before every image lookup,
and never let older/missing/ACTIVE metadata resurrect a suppressed image.
Bundled assets remain in the app; suppression controls rendering, not remote
erasure of binaries. No remote-image feature is introduced by this contract.

## Installation and deletion

Install only `supabase/production_incremental/player-portrait-policy-v1.sql`.
It is one atomic transaction, creates a private clock at zero, no policy rows,
and no deletion requests. Existing account deletions are locked out briefly
during installation; any completed pre-policy request blocks installation for
explicit backfill review rather than silently losing a subject mapping.

A private BEFORE DELETE trigger reads the original requested account's linked
Player IDs before existing cleanup removes them. It reuses deletion governance
locks/protection checks and inserts tombstones. Existing completion and all
immutable/competitive guards remain untouched; any later failure rolls the entire
transaction back. A clock row lock serializes revisions through commit. Retries
and already-suppressed players do not create another version. Policy rows cannot
be updated/deleted, and direct table access is revoked from all API roles.

## Local certification

98 focused application/PostgreSQL tests pass, zero failures/skips. Coverage includes
default ACTIVE, exact Player IDs, transactional suppression/versioning, failed and
protected deletion rollback, original-request continuation, idempotent completion,
Auth/contact/GHIN cleanup, immutable history/revision 8, private grants, rejection
of ambiguous responses, read authorization and current-tournament races.
Complete deployed-source installation and forced-error rollback tests pass.
Production build and git diff --check pass.

No Production SQL or deployment was performed while preparing this certificate.
Release acceptance must freshly verify release lineage, empty deletion queue,
no prior completed requests, identical protected competitive fingerprints, policy
revision zero and zero tombstones, and authenticated/unauthenticated API behavior.
Do not create a real deletion to test this installation.
