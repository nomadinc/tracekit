# Non-deployable migration history

SQL in this directory is retained only as historical and audit evidence.
Supabase migration tooling discovers deployable migrations exclusively from
`supabase/migrations/`; files here must never be applied automatically.

The archived operational migrations contain fixed Production run identifiers
and one-shot recovery RPC definitions. Their completed operator actions are not
part of generic installation state and must not be replayed.

Repository migration-identity convergence also retains superseded combined or
consolidated SQL here when the authoritative Production ledger records the same
effects under canonical split identities. These files are evidence only; their
deployable replacements and SHA-256 mappings are recorded in
`docs/migrations/production-convergence-742966a.json`.
