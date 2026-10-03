# Canonical fresh bootstrap

This directory is the final-schema bootstrap for a new, empty application database. Historical numbered migrations remain unchanged except for the owner-approved069 provider-origin installation correction.048/057 are unchanged, and their missing historical positive evidence remains NOT PROVEN. The forward-upgrade path and this bootstrap must converge for the same selected optional profile.

For databases already installed through130,131 carries the exact-version069 definition bridge. It preserves existing function identities and permissions, rejects mixed or unknown definitions, and creates no authority or certification records. A database compiled with the corrected069 takes the bridge's verified no-op path.

The source compiler runs only in a newly owned local PostgreSQL17 cluster. It replays the retained historical schema profile, including explicitly labeled synthetic Production reference rows needed by historical migrations. It never calls the score benchmark seeder that substitutes assertion functions. It exports **definitions**, not those rows. The generated fresh installer contains no resource registration, current pointer, admission, activation, tournament, participant, financial, worker, legacy Google, or cron authority.

The frozen Release139 schema scaffold pins069 to the byte-identical retained Release139 fixture (`test/fixtures/reliability/release139-069-original.sql`, SHA256 `697abe93c2f82002e95b01a2c4ef062507a6f56ac4785111f510e3d1b2fe6152`). It then installs the exact-version131 bridge to obtain the approved current definitions. Both sources enter the manifest. This preserves the scaffold's original facts and source version; it does not fabricate a lawful adoption chronology. Genuine provider-origin installation and scoped maintenance runtime evidence are separate proof layers.

`schema.sql`, `static-contracts.sql`, `catalog-manifest.json`, and `manifest.json` are generated together. The manifest records every source hash, generator hash, selected optional profile, artifact hash, and static-table row digest. Only five enumerated contract tables may carry static data; this allowlist is implemented in `test/support/reliability/phase2d-resource-bootstrap.mjs`. Resource registration is a separate operation after verified installation.

The selected profile includes portrait policy/read support because shipping participant and spectator reads require it. Optional phone and account-deletion extensions are closed in the certification profile. This does not authorize installing or disabling optional policy in Production. A later Production upgrade must inventory and preserve its supported installed optional profile; unsupported source hashes fail closed.

## Reproduce locally

Run `node tools/reliability/generate-canonical-bootstrap.mjs --check` to rebuild the recorded profile in a disposable reference database and compare artifacts. For deliberate regeneration, use `--write` and explicit ordered `--forward <repository-path.sql>` arguments for the reviewed complete resource-model migration profile. No remote connection parameter exists.

The local installer `installCanonicalBaseline` accepts only an owned disposable cluster object. It validates source/artifact hashes, requires the managed platform prerequisites and no existing application schemas, installs schema/static data/receipt in one transaction, compares normalized catalog definitions, and rejects any copied authority rows. An exact replay validates the existing installation receipt and schema; a different manifest fails closed.

The baseline preserves application function owners, effective ACLs, security modes, search paths, RLS, policies, constraints, triggers, and normalized stored dependencies. Physical OID numbers and generated TOAST/internal RI names cannot match across databases; logical object identities and dependency edges are compared. Within the upgrade database, existing OIDs must separately be checked by forward-migration tests.

The `public` and `auth` schemas are platform-owned prerequisites. The baseline preserves the target's `public` schema and platform `rls_auto_enable` implementation. It creates application public functions and app-owned Auth triggers, and includes the existing pgcrypto dependency. The test platform shim is not exported and is not hosted Supabase Auth certification.

The owner-approved hosted portability correction establishes `extensions` with
`CREATE SCHEMA IF NOT EXISTS` and preserves any existing namespace owner/ACL.
It reuses installed pgcrypto without replacing or relocating it. A transactional
check requires pgcrypto1.3 in `extensions`, owned by `postgres` or the provider's
`supabase_admin`. Catalog convergence permits only that platform extension-owner
difference; application owners, effective privileges, security modes, search paths,
RLS and dependencies remain exact. Raw target ownership must remain in readback
evidence. See the [local portability certification](../../docs/reliability/phase2d-bootstrap-compatibility/README.md).

The function privilege portability correction appends a transaction-bound
normalization block generated from the exact compiler catalog. It removes actual
creation-time function grants and restores only the certified per-function ACL,
including intentional PUBLIC execution. All 1117 application signatures are
enumerated; provider functions and shared default privileges are not changed.
Normalization follows all function/trigger installation and precedes static data
and the installation receipt in the same transaction. Exact replay validates the
receipt and complete catalog rather than rerunning CREATE or privilege repair.
See the [local privilege certification](../../docs/reliability/phase2d-bootstrap-privilege-portability/README.md).

## Limits

Generated artifacts are not authority registration, hosted installation approval, staging certification, or Production deployment permission. Local migration replay and catalog convergence do not prove managed Auth configuration, hosted role membership, Storage, cron, provider messaging, or database recovery. No tool in this directory accepts a hosted URL or credential.
