export function createSupabaseServerFetch(key: string, baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    if (key.startsWith("sb_secret_")) headers.delete("authorization");
    return baseFetch(input, { ...init, headers });
  };
}
