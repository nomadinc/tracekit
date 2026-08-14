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
ciphertext. Runtime key selection is deterministic:

- version 1 uses `INTEGRATIONS_ENC_KEY_V1`, with `INTEGRATIONS_ENC_KEY` accepted
  only as a temporary compatibility source;
- version 2 uses `INTEGRATIONS_ENC_KEY_V2`;
- `INTEGRATIONS_ENC_WRITE_VERSION` selects the key for new writes and defaults
  to version 1 during rollout;
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
4. provision the explicit v1 Worker secret and deploy the dual-key runtime in
   v1-write mode;
5. verify all legacy credentials decrypt without provider calls;
6. generate a random 32-byte v2 key, store it as a Worker secret, and independently
   verify a recovery copy before activating v2 writes;
7. switch writes to v2 and rotate legacy rows in short compare-and-swap transactions;
8. require zero v1/unknown/partial rows and zero decrypt failures;
9. retain v1 through an observation and recovery-point retention window, then
   retire it only when all active and rollback Worker versions are dual-key capable.

The future normal application of Migration 057 must converge without changing the
ledger history or rewriting ciphertext. Once all deployed writers explicitly send
the version, a later migration should remove the database default to prevent stale
writers from being silently classified as v1.

## Rotation operator contract

Rotation stays outside PostgreSQL so keys never enter database functions. A
server-side operator process reads only the version, IV, ciphertext, and internal
row key; decrypts and re-encrypts in memory; and atomically updates version, IV,
and ciphertext only when the row is still version 1 and its prior encrypted fields
match. Each update is reread and verified with v2. Reports contain aggregate counts
only. Rotation does not call providers.

Dry-run validates configuration and decryptability without updates. Live mode
requires the expected project, schema state, maintenance state, bounded candidate
count, stop-on-first-error behavior, and post-update verification. Mixed v1/v2
state remains readable throughout. Once any v2 row exists, a v1-only Worker is no
longer a safe rollback target.

Use a short approved maintenance window for the 18-row production rewrite so
credential replacement cannot race rotation. Connector consumers may continue
decrypting mixed v1/v2 rows with the dual-key runtime, but rotation itself must
make no provider calls. Record the first deployed dual-key-capable Worker version
as the minimum safe rollback version before any row becomes v2; confirm no active
traffic or rollback target points to an older v1-only version before retiring v1.

The legacy recovery copy remains sealed through successful v2 migration, the
observation period, database recovery retention, and coordinated Git-history
remediation. Backup ciphertext and encryption-key recovery copies remain in
separate failure domains.

Coordinated Git-history remediation begins only after v1 is inactive, no database
row depends on it, v2 is stable, protected refs and CI implications are reviewed,
and collaborators are prepared for rewritten history. It is repository hygiene,
not a substitute for cryptographic rotation.
