# WS-022 Preview preflight

This tool detects a wrong deployment, missing branch-only identity credential, wrong database target and rejected identity read before application acceptance. It never prints environment values, headers or upstream response bodies. It performs only a zero-row GET and rejects redirects.

Environment mapping:

| Setting | Required mapping |
|---|---|
| Vercel project | tracekit-staging / prj_KPHnqsNayx17VXmMIp7Rasrsp7gc |
| Deployment environment | Preview |
| Branch | ws022/acceptance-runtime-diagnosis |
| NEXT_PUBLIC_SUPABASE_URL | Supabase project uoeosoiegatlqtzemsfv; current scope general Preview |
| SUPABASE_SERVICE_ROLE_KEY | Secret override for this exact Preview branch |
| TRACEKIT_USE_STAGING_CORE_CREDENTIAL | enabled for this exact Preview branch; separate Core path |

First obtain deployment and project environment **metadata** through the existing authorized Vercel CLI, capturing it outside Git. Do not decrypt Secret values or commit raw inventories.

```sh
node tools/ws022/preview-preflight.mjs \
  --deployment-json /private/tmp/deployment-metadata.json \
  --env-json /private/tmp/environment-metadata.json \
  --sha 775cbec41b1d937ea59a56d47276ae1a0ecc1c36 \
  --metadata-only
```

Metadata-only explicitly reports application acceptance as unchecked. Deployment env arrays can be redacted; metadata is not proof of actual secret values.

The complete credential preflight must run in a trusted Preview/CI process receiving that deployment's managed environment snapshot. It requires VERCEL_ENV, VERCEL_PROJECT_ID, VERCEL_GIT_COMMIT_SHA, VERCEL_GIT_COMMIT_REF and VERCEL_URL to match the checked deployment, plus the identity URL/key and Core selector already supplied through managed configuration. Do not put a credential in command arguments, files committed to Git, output or chat.

Use the same command with `--check-identity` in place of `--metadata-only`. Omitting a mode or supplying both modes fails. Wrong runtime project/commit/branch/host, wrong database, missing secret, non-200, non-empty result, transport or redirect errors fail with a fixed safe category. Even a complete credential preflight does not prove identity writes, membership authorization, Customers/Orders or governed-action behavior; authenticated acceptance remains required.

The helper is on the evidence/tooling branch to preserve the reviewed application SHA. It has not been represented as an automatically installed deployment gate or as having run inside the current deployment. Platform/CI ownership is required to invoke it with the same managed snapshot before future acceptance runs. Current execution is metadata-only; a separately reported managed credential read is not mislabeled as deployment-runtime verification.

```sh
node --test tools/ws022/preview-preflight.test.mjs
```

Rollback: remove this standalone helper and its operator instruction if necessary; it changes no application, database, credentials, provider or production configuration. Do not remove the branch Secret unless separately requested, because that is the identity recovery correction.
