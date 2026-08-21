/** Build Supabase headers for both legacy JWT service keys and sb_secret_* keys. */
export function supabaseAuthHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  return headers;
}
