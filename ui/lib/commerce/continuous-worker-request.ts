export function buildContinuousWorkerRequestInit(key:string,init:RequestInit={}):RequestInit {
  const { cache: _unsupportedCache, ...workerSafeInit } = init as RequestInit & { cache?: RequestCache };
  return { ...workerSafeInit, headers: { apikey:key, Authorization:`Bearer ${key}`, "Content-Type":"application/json", Prefer:"return=representation", ...init.headers } };
}
