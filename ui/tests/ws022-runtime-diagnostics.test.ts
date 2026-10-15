import assert from "node:assert/strict";
import test from "node:test";
import { authErrorDiagnostic } from "../lib/identity/auth-error-diagnostic";
import { loadOrderList } from "../lib/orders/load-list";
import { ProductionOrderRepository } from "../lib/orders/production-repository";

test("actual order transport failure stays unavailable rather than becoming an empty portfolio", async () => {
  const original = globalThis.fetch;
  const repository = new ProductionOrderRepository();
  const scope = { authenticated:true, workspaceId:"synthetic-org", organizationId:"synthetic-org", businessContextId:null, session:{} };
  try {
    globalThis.fetch = async () => Response.json({ error:"private upstream rejection" }, {status:401});
    assert.deepEqual(await loadOrderList(() => repository.listOrders(scope)), {kind:"unavailable"});
    globalThis.fetch = async () => Response.json({orders:[],next_offset:null});
    assert.deepEqual(await loadOrderList(() => repository.listOrders(scope)), {kind:"loaded",orders:[]});
  } finally { globalThis.fetch = original; }
});

test("SDK onError wrapper preserves known failure category while dropping arbitrary sensitive content", () => {
  const diagnostic=authErrorDiagnostic({error:Object.assign(new Error("secret code=private"),{code:"missing_pkce_cookie"}),request:{headers:{authorization:"private"}}});
  assert.equal(diagnostic.code,"missing_pkce_cookie");
  assert.equal(diagnostic.category,"verification_cookie_missing");
  assert.equal(JSON.stringify(diagnostic).includes("private"),false);
  assert.equal(authErrorDiagnostic({error:{code:"private-value",message:"secret"}}).code,"unclassified");
});
