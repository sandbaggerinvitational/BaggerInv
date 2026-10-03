# Function privilege portability strategy

Owner-approved scope: bootstrap packaging only, from application base
`b992bc6501423e038fb5db5e424ae91f880bd9b6`. Local implementation/certification;
existing Certification project `trmcwrljjxwhgtikfdgu` is not accessed or changed.

## Authority and implementation

The final canonical compiler catalog is the sole function privilege authority.
The generator embeds its exact 1117 function identities, owners and ACL entries
in a final anonymous transaction block. It resolves each exact installed
signature, excludes extension members, requires the certified owner and actual
installer to be `postgres`, removes every actual EXECUTE grantee with RESTRICT,
and reinstates only the catalog's exact grants and grant-option attributes.
The block checks each sorted ACL against the intended ACL and fails the entire
installation transaction on any mismatch. It adds no stored function or role.

Current certified patterns: 812 owner-only, 288 owner/service_role, and 17
owner/PUBLIC. All 444 public application functions deny anon/authenticated;
162 deny service_role. The 17 intentional PUBLIC grants are in existing private
schemas and are retained exactly; schema admission remains independently enforced.
No function name is used to infer execution rights. Roles absent from the
certified ACL are removed even if a provider default granted them execution.

The block executes after every dumped function/wrapper and the application-owned
Auth trigger installation. Static contracts and the receipt follow in the same
transaction and create no functions or grants. There is no intermediate commit
that exposes a partially normalized function catalog.

## Shared defaults and provider preservation

Do not ALTER DEFAULT PRIVILEGES. The managed postgres/public namespace is shared
with provider objects. Per-schema revocation cannot subtract global defaults;
changing shared defaults could affect unrelated objects. Existing creation-time
defaults are instead normalized on the exact enumerated Bagger objects before
commit. No provider function, Auth/storage/realtime/extension object, namespace,
owner or default-ACL row is changed by this block.

PostgreSQL [default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)
apply to new objects. Existing function [replacement](https://www.postgresql.org/docs/17/sql-createfunction.html)
preserves owner and ACL. Proof replaces all 1117 application functions with their
own unchanged definitions while defaults remain permissive, then compares the
entire catalog and replays the installer. A future new function requires its own
reviewed ACL; this correction does not make unrelated future DDL safe automatically.

The local managed fixture preserves provider functions in auth/storage/realtime/
extensions and public.rls_auto_enable, including original OIDs, bodies, owners,
ACLs and all default-privilege rows. It uses genuinely non-superuser postgres.
The prior PUBLIC-only behavior is exercised in a rolled-back local control;
no historical or hosted installation is fabricated.

## Receipt/version and retained evidence

Keep `bagger-canonical-bootstrap-v1`: the existing receipt and authority contract
is unchanged; artifact hashes identify the changed installation bytes. Do not
rewrite old receipts. New schema, generator/tool and manifest digests must be
recorded truthfully. Static contracts, normalized application catalog, 149 source
entries and the ordered forward profile remain unchanged.

No migration or application function body changes. R2 domain/scoring/client/
release authority evidence remains valid under source-impact comparison. The
864-hole chronology is not rerun. 048/057 remain NOT REPRODUCIBLE FROM RETAINED
EVIDENCE — NOT PROVEN; 069 remains unchanged. Local parity is not hosted proof.
