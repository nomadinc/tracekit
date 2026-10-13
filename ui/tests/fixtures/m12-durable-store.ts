import assert from "node:assert/strict";

// Intercepts every request; never delegates to the network or reads a real key.
// Models transport responses only, not database atomicity or RLS.
export async function withDurableStore<T>(run: (store: { calls: Array<{url: URL; method: string; body: any}>; authorizations: any[]; results: any[] }) => Promise<T>): Promise<T> {
  const previousFetch = globalThis.fetch;
  const keys = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const previous = keys.map(key => process.env[key]);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://durable.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-ws019-key";
  const store = { calls: [] as Array<{url: URL; method: string; body: any}>, authorizations: [] as any[], results: [] as any[] };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)), method = init?.method || "GET", body = init?.body ? JSON.parse(String(init.body)) : null;
    assert.equal(url.origin, "https://durable.example.test");
    store.calls.push({url, method, body});
    const rows = url.pathname.endsWith("mcp_action_authorizations") ? store.authorizations : url.pathname.endsWith("mcp_action_execution_results") ? store.results : null;
    if (rows) {
      if (method === "POST") { rows.push(structuredClone(body)); return Response.json([body]); }
      return Response.json(rows.filter(row => { let matches = true; url.searchParams.forEach((value, key) => { if (value.startsWith("eq.") && String(row[key]) !== value.slice(3)) matches = false; }); return matches; }));
    }
    if (url.pathname === "/rest/v1/rpc/consume_mcp_action_authorization") {
      const row = store.authorizations.find(row => row.authorization_id === body.p_authorization_id && row.organization_id === body.p_organization_id && row.envelope_identity === body.p_envelope_identity && row.idempotency_key === body.p_idempotency_key && row.audit_correlation_id === body.p_audit_correlation_id);
      if (!row) return Response.json([{decision:"reject",state:"invalidated",consumption_id:null,consumed_at:null}]);
      const decision = row.state === "consumed" ? "replay_same_result" : "consume";
      if (decision === "consume") Object.assign(row, {state:"consumed",consumption_id:body.p_consumption_id,consumed_at:body.p_requested_at});
      return Response.json([{...row,decision}]);
    }
    throw new Error(`Unexpected mocked persistence path: ${url.pathname}`);
  };
  try { return await run(store); }
  finally { globalThis.fetch = previousFetch; keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); }
}
