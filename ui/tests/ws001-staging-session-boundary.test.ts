import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {restrictedIdentityBoundary,assertIdentityWritesAllowed} from '../lib/identity/staging-session-boundary.ts';
test('preview and restricted mode forbid identity writes with no default enablement',()=>{for(const e of [{VERCEL_ENV:'preview'},{TRACEKIT_REPORTING_MODE:'restricted-staging'},{VERCEL_ENV:'preview',TRACEKIT_REPORTING_MODE:'legacy'}]){assert.equal(restrictedIdentityBoundary(e),true);assert.throws(()=>assertIdentityWritesAllowed(e));}assert.equal(restrictedIdentityBoundary({VERCEL_ENV:'production'}),false)});
test('all application session paths fence before privileged repository construction',()=>{const s=readFileSync(new URL('../lib/identity/application-session.ts',import.meta.url),'utf8');for(const name of ['synchronizeWorkOSUser','recordAuthenticationSuccess','resolveAuthenticatedPersistentIdentity','resolveApplicationSession']){const start=s.indexOf('export async function '+name+'(');assert.ok(start>=0);const constructor=s.indexOf('new SupabaseIdentityTenancyRepository()',start);const fence=Math.min(...[
  'assertIdentityWritesAllowed(restrictedBoundaryEnvironment())',
  'restrictedIdentityBoundary(restrictedBoundaryEnvironment())'
].map(k=>s.indexOf(k,start)).filter(x=>x>=0));assert.ok(fence>start&&fence<constructor,name)}});

test('application session boundary uses actual deployment environment', () => {
  const source = readFileSync(
    new URL('../lib/identity/application-session.ts', import.meta.url),
    'utf8'
  );

  assert.match(
    source,
    /VERCEL_ENV:\s*process\.env\.VERCEL_ENV/
  );

  assert.match(
    source,
    /TRACEKIT_REPORTING_MODE:\s*process\.env\.TRACEKIT_REPORTING_MODE/
  );

  assert.equal(
    restrictedIdentityBoundary({
      VERCEL_ENV: 'preview',
      TRACEKIT_REPORTING_MODE: undefined
    }),
    true
  );

  assert.equal(
    restrictedIdentityBoundary({
      VERCEL_ENV: 'production',
      TRACEKIT_REPORTING_MODE: 'restricted-staging'
    }),
    true
  );

  assert.equal(
    restrictedIdentityBoundary({
      VERCEL_ENV: 'production',
      TRACEKIT_REPORTING_MODE: undefined
    }),
    false
  );
});
