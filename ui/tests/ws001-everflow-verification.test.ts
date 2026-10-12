import assert from "node:assert/strict";
import test from "node:test";
import { CommerceProviderConnectionVerifier } from "../lib/commerce/provider-verifier";
import { CommerceVerificationError } from "../lib/commerce/control-plane";

test("generic verification dispatches Everflow to its bounded network health client", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    return Response.json({network_id:4179,name:"Network",timezone_id:80,currency_id:"USD"});
  };
  try {
    const verifier = new CommerceProviderConnectionVerifier();
    const result = await verifier.verify({provider:"everflow",environment:"production",secret:"synthetic-secret",correlationId:"test",expectedProviderAccountId:"4179"});
    assert.deepEqual(calls,["https://api.eflow.team/v1/networks"]);
    assert.deepEqual(result,{capabilities:["network_identity"],providerStatus:200});
    await assert.rejects(verifier.verify({provider:"everflow",environment:"production",secret:"synthetic-secret",correlationId:"test",expectedProviderAccountId:"9999"}), error=>error instanceof CommerceVerificationError && error.code==="everflow_network_mismatch");
    await assert.rejects(verifier.verify({provider:"everflow",environment:"production",secret:"synthetic-secret",correlationId:"test"}), /everflow_account_scope_unavailable/);
    assert.equal(calls.length,2);
  } finally {globalThis.fetch=original;}
});

test("provider authentication and quota failures retain safe distinct diagnostics", async () => {
  const original = globalThis.fetch;
  try {
    for (const [status,code,retryable] of [[401,"everflow_authentication_failed",false],[429,"everflow_rate_limited",true],[500,"everflow_unavailable",true]] as const) {
      globalThis.fetch = async () => Response.json({message:"synthetic-secret private@example.invalid"},{status});
      await assert.rejects(new CommerceProviderConnectionVerifier().verify({provider:"everflow",environment:"production",secret:"synthetic-secret",correlationId:"test",expectedProviderAccountId:"4179"}), error=>{
        assert.ok(error instanceof CommerceVerificationError);
        assert.equal(error.code,code);
        assert.equal(error.retryable,retryable);
        assert.doesNotMatch(error.message,/synthetic-secret|private@/);
        return true;
      });
    }
  } finally {globalThis.fetch=original;}
});
