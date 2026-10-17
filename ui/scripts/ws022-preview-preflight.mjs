import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const EXPECTED = Object.freeze({
  projectId: 'prj_KPHnqsNayx17VXmMIp7Rasrsp7gc',
  branch: 'ws022/acceptance-runtime-diagnosis',
  databaseProject: 'uoeosoiegatlqtzemsfv',
});
const failure = code => { throw new Error(code); };
const allowedCodes = new Set([
  'wrong_deployment', 'deployment_not_ready', 'identity_secret_scope_missing',
  'identity_url_scope_missing', 'core_selector_scope_missing', 'wrong_database_project',
  'identity_secret_missing', 'identity_read_rejected', 'identity_read_unavailable',
  'identity_read_invalid', 'runtime_check_required', 'runtime_binding_mismatch', 'arguments_invalid',
]);
export function checkMetadata(deployment, inventory, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha) || deployment.projectId !== EXPECTED.projectId
    || deployment.target === 'production' || deployment.meta?.githubCommitRef !== EXPECTED.branch
    || deployment.meta?.githubCommitSha !== sha) failure('wrong_deployment');
  if (deployment.readyState !== 'READY') failure('deployment_not_ready');
  const variables = inventory.envs || [];
  const preview = variables.filter(e => e.target?.includes('preview'));
  const branchOnly = key => preview.find(e => e.key === key && e.gitBranch === EXPECTED.branch
    && e.target.length === 1);
  const secret = branchOnly('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !['sensitive', 'secret'].includes(secret.type)) failure('identity_secret_scope_missing');
  const url = preview.find(e => e.key === 'NEXT_PUBLIC_SUPABASE_URL' && e.gitBranch === EXPECTED.branch)
    || preview.find(e => e.key === 'NEXT_PUBLIC_SUPABASE_URL' && !e.gitBranch);
  if (!url) failure('identity_url_scope_missing');
  if (!branchOnly('TRACEKIT_USE_STAGING_CORE_CREDENTIAL')) failure('core_selector_scope_missing');
  // Inventory and deployment API values can be redacted. Actual values are
  // checked separately inside the runtime that receives managed environment vars.
  return { ok: true, phase: 'metadata', sha, project: 'tracekit-staging', branch: EXPECTED.branch,
    identitySecretScope: 'branch Preview', identityUrlScope: url.gitBranch ? 'branch Preview' : 'general Preview' };
}
/** @param {Record<string, string | undefined>} env */
export async function checkIdentity(env = process.env, request = fetch, binding) {
  if (!binding || env.VERCEL_PROJECT_ID !== EXPECTED.projectId
    || env.VERCEL_GIT_COMMIT_SHA !== binding.sha || env.VERCEL_GIT_COMMIT_REF !== EXPECTED.branch
    || env.VERCEL_URL !== binding.host) failure('runtime_binding_mismatch');
  const endpoint = `https://${EXPECTED.databaseProject}.supabase.co`;
  if (env.VERCEL_ENV !== 'preview'
    || String(env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '') !== endpoint)
    failure('wrong_database_project');
  if (env.TRACEKIT_USE_STAGING_CORE_CREDENTIAL !== 'enabled') failure('core_selector_scope_missing');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof key !== 'string' || !key.trim()) failure('identity_secret_missing');
  const headers = { apikey: key, accept: 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.authorization = `Bearer ${key}`;
  let response;
  try { response = await request(`${endpoint}/rest/v1/tracekit_users?select=id&limit=0`,
    { method: 'GET', headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) }); }
  catch { failure('identity_read_unavailable'); }
  if (response.status !== 200) failure('identity_read_rejected');
  let rows;
  try { rows = await response.json(); } catch { failure('identity_read_invalid'); }
  if (!Array.isArray(rows) || rows.length !== 0) failure('identity_read_invalid');
  return { ok: true, phase: 'identity-read', databaseProject: EXPECTED.databaseProject,
    status: 200, returnedRows: 0 };
}
export async function main(args) {
  try {
    const value = name => args[args.indexOf(name) + 1];
    if (args.includes('--metadata-only') && args.includes('--check-identity')) failure('arguments_invalid');
    if (!args.includes('--deployment-json') || !args.includes('--env-json') || !args.includes('--sha'))
      failure('arguments_invalid');
    const deployment = JSON.parse(await readFile(value('--deployment-json'), 'utf8'));
    const inventory = JSON.parse(await readFile(value('--env-json'), 'utf8'));
    const metadata = checkMetadata(deployment, inventory, value('--sha'));
    if (args.includes('--metadata-only')) {
      console.log(JSON.stringify({ ...metadata, applicationAcceptance: 'not checked' }));
      return 0;
    }
    if (!args.includes('--check-identity')) failure('runtime_check_required');
    const identity = await checkIdentity(process.env, fetch, { sha: metadata.sha, host: deployment.url });
    console.log(JSON.stringify({ ok: true, metadata, identity, applicationAcceptance: 'still required' }));
    return 0;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, code: allowedCodes.has(error?.message) ? error.message : 'preflight_unavailable' }));
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main(process.argv.slice(2));
