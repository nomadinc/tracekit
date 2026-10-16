import assert from 'node:assert/strict';
import test from 'node:test';
import { checkMetadata, checkIdentity, main, EXPECTED } from './preview-preflight.mjs';
const sha = '775cbec41b1d937ea59a56d47276ae1a0ecc1c36';
const deployment = { projectId: EXPECTED.projectId, meta: { githubCommitRef: EXPECTED.branch, githubCommitSha: sha }, readyState: 'READY', target: null };
const entry = (key, extra = {}) => ({ key, target: ['preview'], gitBranch: EXPECTED.branch, ...extra });
const inventory = { envs: [entry('SUPABASE_SERVICE_ROLE_KEY', { type: 'sensitive' }), entry('TRACEKIT_USE_STAGING_CORE_CREDENTIAL'), entry('NEXT_PUBLIC_SUPABASE_URL', { gitBranch: null })] };
const binding = { sha, host: 'synthetic-preview.vercel.app' };
const env = { VERCEL_PROJECT_ID: EXPECTED.projectId, VERCEL_GIT_COMMIT_SHA: sha, VERCEL_GIT_COMMIT_REF: EXPECTED.branch, VERCEL_URL: binding.host, VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: `https://${EXPECTED.databaseProject}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_synthetic', TRACEKIT_USE_STAGING_CORE_CREDENTIAL: 'enabled' };
test('metadata rejects wrong SHA, production, other branch and missing branch secret', () => {
  for (const changed of [{ ...deployment, target: 'production' }, { ...deployment, meta: { ...deployment.meta, githubCommitSha: '0'.repeat(40) } }, { ...deployment, meta: { ...deployment.meta, githubCommitRef: 'other' } }])
    assert.throws(() => checkMetadata(changed, inventory, sha), /wrong_deployment/);
  assert.throws(() => checkMetadata(deployment, { envs: inventory.envs.map(e => e.key === 'SUPABASE_SERVICE_ROLE_KEY' ? { ...e, gitBranch: null } : e) }, sha), /identity_secret_scope_missing/);
  assert.equal(checkMetadata(deployment, inventory, sha).identityUrlScope, 'general Preview');
});
test('wrong database and missing secret fail before network access', async () => {
  let calls = 0; const request = async () => { calls++; };
  await assert.rejects(checkIdentity({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' }, request, binding), /wrong_database_project/);
  await assert.rejects(checkIdentity({ ...env, SUPABASE_SERVICE_ROLE_KEY: '' }, request, binding), /identity_secret_missing/);
  assert.equal(calls, 0);
});
test('server secret uses apikey only and zero-row GET; output contains no credential', async () => {
  const result = await checkIdentity(env, async (url, init) => {
    assert.equal(new URL(url).searchParams.get('limit'), '0');
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(init.headers.authorization, undefined); return Response.json([]);
  }, binding);
  assert.equal(result.status, 200); assert.equal(JSON.stringify(result).includes(env.SUPABASE_SERVICE_ROLE_KEY), false);
});
test('401, malformed response and transport errors fail without echoing upstream messages', async () => {
  await assert.rejects(checkIdentity(env, async () => Response.json({ secret: env.SUPABASE_SERVICE_ROLE_KEY }, { status: 401 }), binding), /^Error: identity_read_rejected$/);
  await assert.rejects(checkIdentity(env, async () => Response.json([{ secret: env.SUPABASE_SERVICE_ROLE_KEY }]), binding), /^Error: identity_read_invalid$/);
  await assert.rejects(checkIdentity(env, async () => { throw new Error(env.SUPABASE_SERVICE_ROLE_KEY); }, binding), /^Error: identity_read_unavailable$/);
});

test('runtime project, commit, branch and host must match checked deployment before any request', async () => {
  let calls = 0; const request = async () => { calls++; return Response.json([]); };
  for (const change of [{ VERCEL_PROJECT_ID: 'other' }, { VERCEL_GIT_COMMIT_SHA: '0'.repeat(40) }, { VERCEL_GIT_COMMIT_REF: 'other' }, { VERCEL_URL: 'other.vercel.app' }])
    await assert.rejects(checkIdentity({ ...env, ...change }, request, binding), /runtime_binding_mismatch/);
  assert.equal(calls, 0);
});
test('conflicting metadata-only and runtime flags fail instead of silently skipping runtime', async () => {
  const original = console.log; const output = [];
  console.log = line => output.push(line);
  try { assert.equal(await main(['--metadata-only', '--check-identity']), 1); }
  finally { console.log = original; }
  assert.deepEqual(JSON.parse(output[0]), { ok: false, code: 'arguments_invalid' });
});
