import { strict as assert } from "node:assert";
import { queryCheckoutChampTransactions } from "../src/connectors/checkoutchamp/client.ts";
const fakeFetch=async (url:string)=>{assert.match(url,/\/transactions\/query\//);assert.match(url,/startDate=09%2F01%2F26/);return new Response(JSON.stringify({message:[{transactionId:"T2",parentTxnId:"T1",txnType:"CAPTURE",orderId:"O1",custom1:"raw"}],totalResults:1}),{status:200});};
const result=await queryCheckoutChampTransactions({baseUrl:"https://api.checkoutchamp.com",loginId:"u",password:"p"},{from:"2026-09-01",to:"2026-09-02"},fakeFetch as any);
assert.equal(result.normalized[0]?.providerTransactionId,"T2");
assert.equal(result.normalized[0]?.parentProviderTransactionId,"T1");
assert.equal(result.normalized[0]?.attribution.custom1,"raw");
console.log("checkoutchamp client tests passed");
