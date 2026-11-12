// This is a separately authenticated Core endpoint, not a customer route.
// Its handler still requires Core secret auth and a GET-only database transport.
export function ws023CorePreviewPath(pathname: string, env: Record<string,string|undefined> = process.env) {
  return env.VERCEL_ENV === 'preview'
    && env.TRACEKIT_WS023_READONLY_CORE_PREVIEW === 'enabled'
    && pathname.startsWith('/api/ws023-core/');
}
