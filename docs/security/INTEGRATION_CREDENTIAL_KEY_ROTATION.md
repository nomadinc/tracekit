# Integration credential key rotation

## Credential-table authorization prerequisite

`public.integrations_credentials` is server-only. Migration 058 enables RLS,
keeps the table policy-free, removes all privileges from PUBLIC, `anon`, and
`authenticated`, and limits `service_role` to SELECT, INSERT, and UPDATE. The
Worker does not use a browser credential-table path and has no credential
deletion path.

Because production is at migration 037, urgent containment may install the
exact committed Migration 058 DDL outside the ledger after separate production
approval. That installation must not insert or repair migration history. The
normal 038 through 058 sequence must later apply unchanged; Migration 058 is
convergent when its authorization state is already present.

Authorization containment does not rotate the exposed legacy encryption key or
the underlying provider credentials. Those remain separate incident gates.

TraceKit integration credentials use server-only AES-256-GCM keys. The database
stores a non-secret `password_key_version` beside the Base64 IV and authenticated
ciphertext. Recovery investigation proved two distinct legacy populations:
Legacy B covers 16 rows and all three active integrations; Legacy C covers two
inactive rows created before Legacy B. The earlier generic "V1" recovery record
authenticates none of the 18 rows and remains only as disproven incident evidence.

Runtime key selection is deterministic:

- version 1 is Legacy B and prefers `INTEGRATIONS_ENC_KEY_LEGACY_B`;
  `INTEGRATIONS_ENC_KEY_V1` and `INTEGRATIONS_ENC_KEY` are temporary
  compatibility sources only when every supplied value matches;
- version 3 is decrypt-only Legacy C and uses
  `INTEGRATIONS_ENC_KEY_LEGACY_C` without fallback;
- version 2 is the current production key and uses `INTEGRATIONS_ENC_KEY_V2`;
- `INTEGRATIONS_ENC_WRITE_VERSION` selects the key for new writes and defaults
  to version 1 only when absent for compatibility; production explicitly uses
  version 2 and version 3 is never writable;
- missing, malformed, mismatched, or unsupported keys and versions fail closed.

No key value, key fingerprint, credential plaintext, IV, or ciphertext belongs
in source, documentation, ordinary logs, or audit events.

## Production ordering

Production is at migration 037 while migrations 038–056 remain pending. Migration
057 owns the additive version column and converges if its exact DDL is installed
earlier through a separately approved operational security procedure. This avoids
coupling key rotation to Migration 038 or repairing migration history.

The safe rollout is:

1. restore the production backup credential and verified recovery workflow;
2. take a fresh encrypted local and off-device recovery point;
3. install the exact additive Migration 057 DDL outside the ledger, leaving the
   default at version 1;
4. create and independently verify distinct Legacy B and Legacy C recovery records;
5. deploy a runtime that understands versions 1, 2, and 3 while writes remain 1;
6. classify exactly the two proven Legacy C rows as version 3 through a separately
   approved, fail-closed operator transaction;
7. verify all 16 Legacy B and two Legacy C rows without provider calls;
8. generate a random 32-byte v2 key, store it as a Worker secret, and independently
   verify a recovery copy before activating v2 writes;
9. switch writes to v2 and rotate both legacy populations in short compare-and-swap transactions;
10. require zero version-1/version-3/unknown/partial rows and zero decrypt failures;
11. retire C and B independently after their dependency counts reach zero.

The future normal application of Migration 057 must converge without changing the
ledger history or rewriting ciphertext. Migration 059 adds the closed lineage set
`1=legacy-b`, `2=future`, `3=legacy-c`; it embeds no row identifiers or encrypted
values. Production classification uses an ephemeral reviewed list of the two
internal row keys, asserts both targets are inactive version-1 rows, updates only
their non-secret version to 3, and proves IV/ciphertext fingerprints unchanged.
Once all writers explicitly send the version, a later migration should remove the
default so stale writers cannot be silently classified as Legacy B.

## Rotation operator contract

Rotation stays outside PostgreSQL so keys never enter database functions. A
server-side operator process reads only the version, IV, ciphertext, and internal
row key; decrypts and re-encrypts in memory; and atomically updates version, IV,
and ciphertext only when the row is still version 1 and its prior encrypted fields
match. Each update is reread and verified with v2. Reports contain aggregate counts
only. Rotation does not call providers.

Dry-run validates configuration and decryptability without updates. Live mode
requires the expected project, schema state, maintenance state, bounded candidate
count, stop-on-first-error behavior, and post-update verification. Once any row is
classified as version 3, only a Worker that understands both legacy lineages is a
safe rollback target. Once any version-2 row exists, only a runtime understanding
every still-active lineage may receive traffic.

Use a short approved maintenance window for the 18-row production rewrite so
credential replacement cannot race rotation. Connector consumers may continue
decrypting mixed Legacy B, Legacy C, and future-key rows with the multi-key runtime, but rotation itself must
make no provider calls. Record the first deployed dual-key-capable Worker version
as the minimum safe rollback version before any row becomes version 2; confirm no active
traffic or rollback target points to a runtime lacking any active lineage before
retiring Legacy B or Legacy C.

Both verified legacy recovery copies remain sealed through successful future-key migration, the
observation period, database recovery retention, and coordinated Git-history
remediation. Backup ciphertext and encryption-key recovery copies remain in
separate failure domains.

## Post-migration retirement readiness

Production has completed the ciphertext migration: all 18 credential rows use
version 2, the version-1 and version-3 populations are zero, all three active
integrations use version 2, and aggregate deterministic decryption is 18/18.
Legacy B and Legacy C bindings and their compatibility aliases remain installed
pending a separately authorized retirement transaction. Their secure recovery
copies and the canary plus eight batch rollback artifacts remain retained.

The runtime resolves keys lazily by the persisted row version. A V2-only Worker
with `INTEGRATIONS_ENC_KEY_V2` and explicit write version 2 starts, reads, and
writes without Legacy B, Legacy C, `INTEGRATIONS_ENC_KEY_V1`, or
`INTEGRATIONS_ENC_KEY`. If a version-1 or version-3 row reappears while its key is
absent, decryption fails closed; unsupported versions also fail closed. There is
no cross-key guessing.

After binding retirement, the minimum safe rollback target must be the reviewed
V2-only Worker version created by that retirement transaction. Version
`88dacc8f-ecb4-4e67-8825-804784984913` is the source/runtime baseline and writes
version 2, but it still snapshots retirement-pending bindings. Earlier versions
must not receive traffic: `627d0444-e8f2-498a-a54f-2024b6a86fa9` lacks V2 support,
`8c812329-ff93-4984-a854-1bc06b622acc` lacks the V2 binding and writes version 1,
and `cdc758ec-542d-4bd5-a2de-f26b22be5255` has V2 but defaults writes to version 1.
Cloudflare retains deployable historical versions, so the deployment runbook must
prohibit selecting any pre-retirement version after legacy bindings are removed.

Provider credential rotation remains required because it addresses prior browser
exposure, but it is independent of encryption-key retirement. Git-history
remediation for historically exposed key material is also separate and remains
pending. Neither obligation requires current ciphertext to remain dependent on
legacy decryption bindings.

Coordinated Git-history remediation begins only after v1 is inactive, no database
row depends on it, v2 is stable, protected refs and CI implications are reviewed,
and collaborators are prepared for rewritten history. It is repository hygiene,
not a substitute for cryptographic rotation.
