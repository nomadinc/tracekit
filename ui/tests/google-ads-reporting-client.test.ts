import assert from "node:assert/strict";
import test from "node:test";
import { fetchGoogleAdDailyReport } from "../lib/integrations/google-ads-reporting-client";

test("bounded report client captures request IDs and login context across all pages", async () => {
  let calls=0;
  const fetcher:typeof fetch=async (_url,init)=>{
    calls++;
    const headers=new Headers(init?.headers);
    assert.equal(headers.get("login-customer-id"),"1000000001");
    const body=JSON.parse(String(init?.body));
    if(calls===1){
      assert.equal(body.pageToken,undefined);
      return new Response(JSON.stringify({results:[{customer:{id:"1210000001",currencyCode:"USD",timeZone:"UTC"},campaign:{id:"10",status:"ENABLED"},adGroup:{id:"20",status:"ENABLED"},adGroupAd:{status:"ENABLED",ad:{id:"30"}},segments:{date:"2026-09-03"},metrics:{impressions:"1",clicks:"1",costMicros:"1000000"}}],nextPageToken:"p2"}),{status:200,headers:{"request-id":"req-1"}});
    }
    assert.equal(body.pageToken,"p2");
    return new Response(JSON.stringify({results:[{customer:{id:"1210000001",currencyCode:"USD",timeZone:"UTC"},campaign:{id:"11",status:"ENABLED"},adGroup:{id:"21",status:"ENABLED"},adGroupAd:{status:"ENABLED",ad:{id:"31"}},segments:{date:"2026-09-03"},metrics:{impressions:"2",clicks:"1",costMicros:"2000000"}}]}),{status:200,headers:{"request-id":"req-2"}});
  };
  const report=await fetchGoogleAdDailyReport({accessToken:"access",customerId:"1210000001",loginCustomerId:"1000000001",since:"2026-09-03",until:"2026-09-03",fetcher});
  assert.equal(report.rows.length,2);
  assert.deepEqual(report.requestIds,["req-1","req-2"]);
  assert.equal(report.loginCustomerId,"1000000001");
  assert.equal(report.customerId,"1210000001");
});

test("page bound failure returns no partial report", async()=>{
 let calls=0;
 const fetcher:typeof fetch=async()=>{calls++;return new Response(JSON.stringify({results:[],nextPageToken:`p${calls}`}),{status:200});};
 await assert.rejects(()=>fetchGoogleAdDailyReport({accessToken:"a",customerId:"1210000001",loginCustomerId:"1000000001",since:"2026-09-01",until:"2026-09-03",fetcher,maxPages:2}),/page bound exceeded/i);
});

test("report rows carry per-page request ID into persistence provenance", async()=>{
 const fetcher:typeof fetch=async()=>new Response(JSON.stringify({results:[{customer:{id:"1210000001",currencyCode:"USD",timeZone:"UTC"},campaign:{id:"10",status:"ENABLED"},adGroup:{id:"20",status:"ENABLED"},adGroupAd:{status:"ENABLED",ad:{id:"30"}},segments:{date:"2026-09-03"},metrics:{impressions:"1",clicks:"1",costMicros:"1000000"}}]}),{status:200,headers:{"request-id":"req-page"}});
 const report=await fetchGoogleAdDailyReport({accessToken:"a",customerId:"1210000001",loginCustomerId:"1000000001",since:"2026-09-03",until:"2026-09-03",fetcher});
 assert.equal(report.rows[0].tracekitGoogleContext.requestId,"req-page");
 assert.equal(report.rows[0].tracekitGoogleContext.loginCustomerId,"1000000001");
});
