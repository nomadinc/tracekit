import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { resolve } from "node:path";

// Exercise the actual detail route and actual workspace markup with synthetic
// persistence/session boundaries. No external requests or financial writes.
async function bundle(entry: string, mocks: Record<string, string>) {
  const result = await build({
    entryPoints: [resolve(entry)], bundle: true, write: false,
    platform: "node", format: "esm", jsx: "automatic",
    packages: "external",
    plugins: [{ name: "boundaries", setup(b) {
      b.onResolve({ filter: /.*/ }, args => args.namespace !== "synthetic" && args.path in mocks
        ? { path: args.path, namespace: "synthetic" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({
        contents: mocks[args.path], loader: "js",
      }));
    } }],
  });
  // External React imports resolve from this test's node_modules.
  const { writeFile, unlink } = await import("node:fs/promises");
  const path = resolve(`node_modules/.ws022-render-${crypto.randomUUID()}.mjs`);
  await writeFile(path, result.outputFiles[0].text);
  try { return await import(path); } finally { await unlink(path); }
}

test("actual detail response renders independent currencies, null authority and selection races", async () => {
  const fixture = { id: "one", amount: 200, fee: 5, currency: "EUR",
    currency_source: "provider_payload.currency", fee_currency: "GBP",
    fee_currency_source: "provider_payload.fee_currency" };
  const route = await bundle("app/api/chargebacks/[id]/route.ts", {
    "next/server": "export const NextResponse={json:(b,i)=>Response.json(b,i)}",
    "@/lib/identity/application-session": 'export const resolveApplicationSession=async()=>({kind:"authenticated",session:{}})',
    "@/lib/identity/financial-read-scope": 'export const authorizedDetailedFinancialOrganization=()=>"synthetic-org"',
    "@/lib/commerce/supabase-control-repository": `export const commercePersistenceRequest=async(path)=>path.startsWith("commerce_provider_disputes?")?[${JSON.stringify(fixture)}]:[]`,
  });
  const response = await route.GET(new Request("https://synthetic.invalid/api/chargebacks/live:one"),
    { params: Promise.resolve({ id: "live:one" }) });
  assert.equal(response.status, 200);
  const detail = await response.json();
  const selected = { id: "live:one", source: "live", sourceLabel: "Live",
    amount: 200, fee: 5, currency: "USD", currencySource: "provider_payload.currency",
    feeCurrency: "USD", feeCurrencySource: "provider_payload.fee_currency", matchAuthority: "unmatched" };
  const render = async (value: unknown, loadedId = selected.id) => {
    const states = [1, null, selected, { id: loadedId, value }, null];
    const ui = await bundle("components/chargebacks/chargeback-review-workspace.tsx", {
      react: `let index=0; const states=${JSON.stringify(states)}; export const useState=()=>[states[index++],()=>{}]; export const useEffect=()=>{}; export const useMemo=f=>f();`,
      "next/link": 'export default function Link(){return null}',
      "@/lib/api": 'export const sameOriginGetJson=()=>{throw Error("No network allowed")}',
    });
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    return renderToStaticMarkup(createElement(ui.ChargebackReviewWorkspace));
  };
  assert.match(await render(detail), /€200\.00/);
  assert.match(await render(detail), /£5\.00/);
  const unknown = { ...detail, dispute: { ...detail.dispute,
    currency: null, currencySource: null, feeCurrency: null, feeCurrencySource: null } };
  const unknownHtml = await render(unknown);
  assert.match(unknownHtml, /200\.00 \(currency unknown\)/);
  assert.match(unknownHtml, /5\.00 \(currency unknown\)/);
  assert.doesNotMatch(unknownHtml, /\$200/);
  const staleHtml = await render(detail, "live:other");
  assert.doesNotMatch(staleHtml, /€200|£5/);
  assert.match(staleHtml, /\$200\.00/);
});
