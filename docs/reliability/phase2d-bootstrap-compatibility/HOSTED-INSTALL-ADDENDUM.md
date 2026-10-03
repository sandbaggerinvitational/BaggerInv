# Hosted install portability addendum

**READY for a separately authorized Part1A. Not executed.** This replaces the
`extensions` conflict in the earlier preflight runbook. It does not relax target
identity, role, catalog/security validation or the real-deployment trust chain.

Supabase already establishes its extension namespace and pgcrypto in its
[provider initialization](https://github.com/supabase/postgres/blob/develop/migrations/db/init-scripts/00000000000000-initial-schema.sql).
The managed `postgres` role has administrative privileges without ordinary
[superuser access](https://supabase.com/docs/guides/database/postgres/roles-superuser).
PostgreSQL's [trusted-extension contract](https://www.postgresql.org/docs/17/sql-createextension.html)
permits non-superuser installation with database CREATE authority; `IF NOT EXISTS`
alone does not validate an existing extension. Our package now validates pgcrypto1.3,
its `extensions` location and supported platform owner inside the installation transaction.

1. After owner authorization, identify the NEW dedicated Supabase physical project
   independently. Never use Production or old Preview. Verify PostgreSQL17,
   managed `postgres` identity, app-schema absence, managed Auth prerequisites,
   existing namespace owner/ACL, extension version/schema/owner, role memberships,
   default privileges and permission for app-owned Auth triggers. Preserve all
   managed Auth/internal schemas, roles, extensions and platform functions. Record
   baseline metadata and recovery/cleanup procedure. Unsupported state: STOP.
2. Verify the candidate's generated manifest, all149 source entries, generator
   inputs and artifact hashes offline. Use the new schema/manifest hashes below.
   No historical migration replay, SQL patch, object deletion or arbitrary skip.
3. Connect directly/session-mode as managed `postgres`. Execute the approved
   `schema.sql`, `static-contracts.sql` and receipt INSERT in one stop-on-error
   transaction. With psql, use `-X -v ON_ERROR_STOP=1 --single-transaction` and
   the three ordered file arguments. Do not use transaction-mode pooling or
   dashboard statement-by-statement execution. The receipt INSERT is:

```sql
INSERT INTO production_control.canonical_bootstrap_installation_v1
 (contract_version,manifest_sha256,schema_sha256,static_data_sha256)
VALUES
 ('bagger-canonical-bootstrap-v1',
  'a96889846994f10a2d0e38e77d3cc6fa2b28a48cca86ce2c8cada90b3d8a3eec',
  '4e67e3084e341c543a192cc0e665a0a776bd7badc22d9bf9b821ebf21aa0ef04',
  '7b93c4235a5c18cdd68be56b13df26ffcab1d9af8f3b3d9b27895cd6b8afb27d');
```

4. After commit, read back the installation receipt and normalized catalog using
   `catalog.sql` and the same offline `canonicalCatalog` definition hashing/
   `assertCatalogConvergence` rules. Keep raw target extension ownership in the
   evidence. All app owners/ACLs/security modes/search paths/RLS/triggers/dependencies
   must match. Verify unchanged platform OIDs/owners/ACLs/definitions and no copied
   resource/tournament/participant/activation/jobs/Google/cron authority. A managed
   default-privilege/event-trigger difference is a STOP, not permission to patch.
   Catalog validation follows commit as in the certified installer; registration
   and admission remain withheld on ANY mismatch.
5. Same-artifact replay first verifies the existing receipt and full catalog; it
   does not rerun CREATE statements. A different receipt/manifest fails closed.
   A transaction failure rolls back app installation/receipt; retain evidence.
   A post-commit validation failure leaves an UNADMITTED database; no application
   initialization, registration or deployment follows until separately resolved.
6. Only after full validation, register the exact physical resource through the
   existing owner-only `register_certification_resource_v1(jsonb)` contract using
   truthful external resource identity. Leave initialization and runtime admission
   incomplete/disabled. This procedure does not invent a deployment ID or origin.

Required Bagger extension: **pgcrypto1.3 in `extensions` only**. PostgreSQL's base
plpgsql and unrelated provider-installed extensions are retained; no other extension
is installed by Bagger. Existing provider-owned namespace/extension objects are
not altered, relocated or recreated; an absent local namespace is owned by the
installer that creates it.

Manual patches required: **0**. Source change beyond this certified package: **NO**.
Hosted provider compatibility remains to be observed at Part1A, not inferred from
the local fixture. Stop if the managed role cannot execute unchanged app DDL or
if its platform defaults cause catalog divergence.

Trust chain remains: physical Supabase project → installation receipt →
Certification physical-resource registration → REAL Vercel deployment identity →
Certification initialization → release/deployment binding → admission → application
authority. The first three may exist without initialization. Part1B must use the
actual deployment of the NEW candidate commit, not the old base SHA or a synthetic
local identity. No Vercel/application deployment happens in Part1A.
