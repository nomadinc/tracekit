const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const ui = path.resolve(__dirname, ".."), tooling = process.env.WS020_TEST_TOOLING;
if (!tooling) throw new Error("WS020_TEST_TOOLING must identify isolated React 18 tooling");
const React = require(path.join(tooling, "node_modules/react"));
const Renderer = require(path.join(tooling, "node_modules/react-test-renderer"));
const ts = require(path.join(ui, "node_modules/typescript"));
async function setup() {
  const initial = { authenticated: true, developmentOnly: false, identity: { id: "customer", role: "client-read-only" }, activeOrganizationId: "stem", activeBusinessContextId: "stem-context", effectivePermissions: ["orders.view"] };
  let context, root, reloads = 0, normalizations = 0;
  const requests = [], pending = [];
  const mod = { exports: {} };
  const req = id => {
    if (id === "react") return React;
    if (id === "react/jsx-runtime") return require(path.join(tooling, "node_modules/react/jsx-runtime"));
    if (id.endsWith("/authorization")) return { normalizeSession: () => { normalizations++; throw Error("mock normalization forbidden"); }, shellVariant: () => "client" };
    if (id.endsWith("/development-state")) return { resolveDevelopmentIdentity: () => ({}), developmentSessionFor: () => ({}) };
    if (id.endsWith("/session")) return {};
    if (id.endsWith("/identity-mode")) return { identityProviderInitialization: () => ({ persistent: true, ready: true, initializeDevelopment: false }) };
    throw Error("Unexpected import " + id);
  };
  const js = ts.transpileModule(fs.readFileSync(path.join(ui, "components/identity/identity-provider.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext("(function(require,module,exports){" + js + "\n})", {
    window: { location: { reload: () => reloads++ } },
    fetch: (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); },
  })(req, mod, mod.exports);
  function Probe() { context = mod.exports.useIdentity(); return React.createElement("p", null, "OLD_PRIVATE_WORKSPACE"); }
  await Renderer.act(async () => { root = Renderer.create(React.createElement(mod.exports.IdentityProvider, { initialSession: initial, persistentOrganizations: [{id:"stem"},{id:"nh"}], persistentBusinessContexts: [{id:"stem-context",organizationId:"stem"},{id:"client-nh",organizationId:"nh"}] }, React.createElement(Probe))); });
  return { initial, requests, pending, get context() { return context; }, get reloads() { return reloads; }, get normalizations() { return normalizations; }, text: () => JSON.stringify(root.toJSON()), act: fn => Renderer.act(async () => { fn(); await Promise.resolve(); }), hydrate: next => Renderer.act(async () => { root.unmount(); root = Renderer.create(React.createElement(mod.exports.IdentityProvider, { initialSession: next, persistentOrganizations: [{id:"nh"}], persistentBusinessContexts: [{id:"client-nh",organizationId:"nh"}] }, React.createElement(Probe))); }), dispose: () => Renderer.act(() => root.unmount()) };
}
for (const kind of ["organization", "business-context"]) {
  test("authorized " + kind + " switch fences old UI and reloads authoritative session without optimistic state", async () => {
    const h = await setup(), stale = h.context;
    await h.act(() => kind === "organization" ? h.context.setActiveOrganization("nh") : h.context.setActiveBusinessContext("client-nh"));
    assert.equal(h.requests[0].url, "/api/session/" + kind);
    assert.equal(JSON.stringify(h.requests[0].body), JSON.stringify(kind === "organization" ? {organizationId:"nh"} : {businessContextId:"client-nh"}));
    assert.ok(!h.text().includes("OLD_PRIVATE_WORKSPACE"));
    await h.act(() => stale.setActiveOrganization("third"));
    assert.equal(h.requests.length, 1, "concurrent switch must not race cookies");
    await h.act(() => h.pending[0].resolve({ok:true}));
    assert.equal(h.reloads, 1); assert.equal(h.context.session, h.initial); assert.equal(h.normalizations, 0);
    assert.ok(!h.text().includes("OLD_PRIVATE_WORKSPACE")); h.dispose();
  });
  test("denied " + kind + " switch never commits optimistic scope and supports safe retry", async () => {
    const h = await setup();
    await h.act(() => kind === "organization" ? h.context.setActiveOrganization("foreign") : h.context.setActiveBusinessContext("foreign"));
    await h.act(() => h.pending[0].resolve({ok:false,status:403,json:()=>{throw Error("SECRET BODY");}}));
    assert.equal(h.reloads,0); assert.equal(h.context.session,h.initial); assert.equal(h.normalizations,0);
    assert.ok(h.text().includes("Unable to confirm workspace switch")); assert.ok(!h.text().includes("SECRET"));
    await h.act(() => h.context.setActiveOrganization("nh")); assert.equal(h.requests.length,2);
    assert.ok(!h.text().includes("Unable to confirm workspace switch")); h.dispose();
  });
}
test("network failure remains sanitized and preserves server-derived authority", async () => {
  const h=await setup(); await h.act(()=>h.context.setActiveOrganization("nh"));
  await h.act(()=>h.pending[0].reject(Error("PRIVATE TRANSPORT DETAIL")));
  assert.equal(h.reloads,0); assert.equal(h.context.session,h.initial); assert.ok(!h.text().includes("PRIVATE TRANSPORT DETAIL")); assert.ok(h.text().includes("Refresh to reload your authorized session")); h.dispose();
});

test("fresh server session replaces membership, permissions, organization and context catalog together", async () => {
  const h = await setup();
  await h.act(() => h.context.setActiveOrganization("nh"));
  await h.act(() => h.pending[0].resolve({ok:true,json:()=>{throw Error("redirect/body must not be trusted");}}));
  assert.equal(h.reloads,1);
  const next = {...h.initial, activeOrganizationId:"nh",activeBusinessContextId:"client-nh",effectivePermissions:["orders.view","customers.view"],identity:{id:"customer",role:"client-read-only"}};
  await h.hydrate(next);
  assert.equal(h.context.session,next);
  assert.deepEqual(h.context.businessContexts,[{id:"client-nh",organizationId:"nh"}]);
  assert.deepEqual(h.context.session.effectivePermissions,["orders.view","customers.view"]);
  assert.ok(!h.context.session.effectivePermissions.includes("financials.view"));
  assert.equal(h.normalizations,0);h.dispose();
});
