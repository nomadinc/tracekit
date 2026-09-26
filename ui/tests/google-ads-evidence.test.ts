import assert from "node:assert/strict";
import test from "node:test";
import { googleEvidenceFromRow, listGoogleEvidenceHistory } from "../lib/integrations/google-ads-evidence";

test("Google evidence view model exposes immutable raw payload and diagnostics", () => {
  const item = googleEvidenceFromRow({
    id:"ev1", organization_id:"org", connection_id:"conn", provider_account_id:"pa", sync_run_id:"run",
    provider:"google_ads", source_object_type:"ad_daily", source_object_id:"1234567890:30:2026-09-03",
    source_report_date:"2026-09-03", payload_hash:"abc", inline_payload:{metrics:{costMicros:"1234567"}},
    api_version:"v25", normalizer_version:"google-ads-daily-v1", observed_at:"2026-09-27T20:00:00Z",
    metadata:{google:{customerId:"1234567890",loginCustomerId:"1000000001",requestId:"req-1",costMicros:"1234567"}},
  });
  assert.equal(item.customerId,"1234567890");
  assert.equal(item.loginCustomerId,"1000000001");
  assert.equal(item.requestId,"req-1");
  assert.deepEqual(item.payload,{metrics:{costMicros:"1234567"}});
  assert.equal(item.readOnly,true);
});

test("evidence history is tenant, connection, and provider-account scoped newest first", async () => {
  let requested="";
  const items=await listGoogleEvidenceHistory({
    organizationId:"org",connectionId:"conn",providerAccountId:"pa",sourceObjectId:"1234567890:30:2026-09-03",
    transport:async path=>{requested=path;return [
      {id:"new",provider:"google_ads",source_object_type:"ad_daily",source_object_id:"x",payload_hash:"b",inline_payload:{v:2},api_version:"v25",normalizer_version:"n",observed_at:"2026-09-27T20:00:00Z",metadata:{}},
      {id:"old",provider:"google_ads",source_object_type:"ad_daily",source_object_id:"x",payload_hash:"a",inline_payload:{v:1},api_version:"v25",normalizer_version:"n",observed_at:"2026-09-26T20:00:00Z",metadata:{}},
    ];},
  });
  assert.match(requested,/organization_id=eq\.org/);
  assert.match(requested,/connection_id=eq\.conn/);
  assert.match(requested,/provider_account_id=eq\.pa/);
  assert.match(requested,/provider=eq\.google_ads/);
  assert.match(requested,/order=observed_at\.desc/);
  assert.deepEqual(items.map(x=>x.id),["new","old"]);
});
