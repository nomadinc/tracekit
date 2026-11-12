import "server-only";

/** Server credentials never come from public/publishable variables. */
export function supabaseServerSecret(): string {
  // Keep compatibility with installations storing a modern secret under the
  // historical variable name. Never revive JWT service-role authentication.
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key?.startsWith("sb_secret_") || key.length <= "sb_secret_".length || /\s/.test(key)) {
    throw new Error("A modern Supabase secret is required for server storage.");
  }
  return key;
}
