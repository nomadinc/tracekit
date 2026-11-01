// Preview reporting has no authority to synchronize identities or use the legacy
// privileged identity repository. A reviewed read-only bootstrap is still required.
export function restrictedIdentityBoundary(env:{VERCEL_ENV?:string;TRACEKIT_REPORTING_MODE?:string}){
 return env.VERCEL_ENV==='preview'||env.TRACEKIT_REPORTING_MODE==='restricted-staging';
}
export function assertIdentityWritesAllowed(env:{VERCEL_ENV?:string;TRACEKIT_REPORTING_MODE?:string}){
 if(restrictedIdentityBoundary(env))throw new Error('Restricted reporting identity synchronization is disabled.');
}
