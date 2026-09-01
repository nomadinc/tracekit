import assert from "node:assert/strict";
import test from "node:test";
import { Next29Client } from "./connectors/next29/client.ts";

function json(value: unknown) { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }); }

test("29Next client reads disputes list and detail with disputes API paths", async () => {
  const urls:string[]=[];
  const client=new Next29Client({store:"demo",accessToken:"secret"},{fetch:async(input:any)=>{const url=String(input);urls.push(url);if(url.includes("/disputes/77/"))return json({id:77,type:"chargeback",status:"open"});return json({results:[{id:77}],next:null,previous:null});}});
  const page=await client.listDisputes({query:{type:"chargeback",status:"open"}});
  const detail=await client.getDispute(77);
  assert.equal(page.results[0].id,77);
  assert.equal(detail.item.id,77);
  assert.match(urls[0],/\/api\/admin\/disputes\//);
  assert.match(urls[0],/type=chargeback/);
  assert.match(urls[0],/status=open/);
  assert.match(urls[1],/\/api\/admin\/disputes\/77\//);
});
