// Pure policy, imported by server-only proxy. Production can never enable diagnostics.
export function customerReadDiagnosticsEnabled(env: { VERCEL_ENV?: string; TRACEKIT_CUSTOMER_READ_DIAGNOSTICS?: string }): boolean {
  return env.VERCEL_ENV === "preview" && env.TRACEKIT_CUSTOMER_READ_DIAGNOSTICS === "enabled";
}
