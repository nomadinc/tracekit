# Prepared request to the Staging/Supabase credential owner

Please verify the existing Preview identity-storage project/key pairing for Vercel project `tracekit-staging`, branch `ws022/acceptance-runtime-diagnosis`, deployment `dpl_A1VTcr4pBbYmMGn2xFEXYUjnX3wR`.

The URL variable is `NEXT_PUBLIC_SUPABASE_URL`; gateway logs confirm requests reach Supabase project `uoeosoiegatlqtzemsfv`. The server-only credential variable is `SUPABASE_SERVICE_ROLE_KEY`. Both currently inherit general Preview entries. Supabase returned `UNAUTHORIZED_INVALID_API_KEY` during sign-in identity persistence. This does not distinguish an incorrect, disabled or mismatched credential, and does not establish rotation as the cause.

Verify project association and validity through the secure Supabase/Vercel administration workflow. A bounded read-only REST check of `tracekit_users` with `select=id&limit=0` can establish acceptance without returning member data. Do not send a key, prefix, hash, JWT, authentication header or secret-bearing screenshot in chat, GitHub or the evidence package. Do not rotate keys, modify production, change memberships or alter database permissions.

Return only: confirmed project identity, whether the current Preview credential is valid for it, whether an existing valid credential is available, and the secure configuration path for an approved branch-only override. This request is prepared but has not been sent because a named custodian and channel have not been identified.
