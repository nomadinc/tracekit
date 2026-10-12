import test from "node:test";
import assert from "node:assert/strict";
import { compareRawPayloads, createEverflowRawVersionAudit } from "../lib/integrations/everflow-raw-version-audit";
import { normalizeEverflowConversion } from "../lib/integrations/everflow-conversions";

test("raw comparison ignores object key order, detects omitted fields and array changes, and exposes no values", () => {
  assert.equal(compareRawPayloads({a:1,b:{c:2}},{b:{c:2},a:1}).semanticEqual,true);
  const changed=compareRawPayloads({email:"private-old@example.invalid",metadata:{"private@example.invalid":1},rows:[1,2],nullable:null},{email:"private-new@example.invalid",metadata:{"private@example.invalid":2},rows:[2,1]});
  assert.equal(changed.semanticEqual,false);
  assert.deepEqual(changed.changedFieldPaths,["email","metadata.<dynamic_key>","nullable","rows[0]","rows[1]"]);
  assert.doesNotMatch(JSON.stringify(changed),/private|example\.invalid/);
});

test("retained audit reads only scoped evidence and distinguishes format-only from substantive versions", async () => {
  const scope={organizationId:"tenant",connectionId:"connection",providerAccountId:"account"};
  const id="11111111-1111-1111-1111-111111111111";
  const original={conversion_id:"source",conversion_unix_timestamp:1790827200,currency_id:"USD",network_id:"3453",status:"approved",is_event:false,notes:"old"};
  const source=await normalizeEverflowConversion({...original,notes:"new"});
  const paths:string[]=[];
  const db=async(path:string)=>{paths.push(path);return path.startsWith("everflow_conversion_events?")?[{source_identity:"source",payload_hash:source.payloadHash,evidence_id:id,evidence:{id,...{organization_id:"tenant",connection_id:"connection",provider_account_id:"account"},source_object_id:"source",source_object_type:"everflow_conversion",payload_hash:"a".repeat(64),deleted_at:null,metadata:{normalizedPayloadHash:source.payloadHash}}}]:[{evidence_id:id,organization_id:"tenant",payload:original}];};
  const audit=await createEverflowRawVersionAudit(scope,db);
  await audit.onPage([source]);
  const result=audit.result();
  assert.equal(result.normalizedDifferences,0);
  assert.equal(result.substantivelyDifferentRawVersions,1);
  assert.deepEqual(result.differences[0].changedFieldPaths,["notes"]);
  assert.equal(result.sourceIdentitiesMatched,1);
  assert.ok(paths.every(path=>path.includes("organization_id=eq.tenant")));
  assert.doesNotMatch(JSON.stringify(result),/"old"|"new"/);
  const denied=await createEverflowRawVersionAudit(scope,async path=>path.startsWith("everflow_conversion_events?")?[{source_identity:"source",payload_hash:source.payloadHash,evidence_id:id,evidence:{organization_id:"other"}}]:[]);
  await assert.rejects(denied.onPage([source]),/everflow_retained_evidence_unverified/);
});
