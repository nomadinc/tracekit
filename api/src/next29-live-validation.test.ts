import assert from "node:assert/strict";
import test from "node:test";
import { runNext29LiveValidation } from "./connectors/next29/live-validation.ts";

function page(){return{results:[],next:null,previous:null,providerRequestId:null,correlationId:"c",rateLimit:{limit:4,remaining:3,retryAfterMs:null}};}
function persistence(){return{async beginRun(){return{syncRunId:"run"}},async persistOrder(){},async persistSubscription(){},async persistDispute(){},async appendCheckpoint(){},async completeRun(){},async failRun(){}};}
function args(calls:string[]=[]){const p:any=persistence();return{environment:"staging",organizationId:"org",connectionId:"conn",providerAccountId:"acct",client:{apiVersion:"2024-04-01",async listOrders(){calls.push("orders");return page()},async getOrder(){throw new Error("unused")},async listSubscriptions(){calls.push("subscriptions");return page()},async getSubscription(){throw new Error("unused")},async listDisputes(){calls.push("disputes");return page()},async getDispute(){throw new Error("unused")}},evidenceSink:{async putImmutable(input:any){return{storageReference:"mem://x",payloadHash:"h",byteSize:input.payload.byteLength}}},persistence:{orders:p,subscriptions:p,disputes:p}} as any;}

test("29Next live validation is hard-bounded and exercises every read resource without activation",async()=>{const calls:string[]=[];const result=await runNext29LiveValidation(args(calls));assert.deepEqual(calls,["orders","subscriptions","disputes"]);assert.equal(result.bounded,true);assert.deepEqual(result.recordsObserved,{orders:0,subscriptions:0,disputes:0});});

test("29Next live validation refuses production environment",async()=>{await assert.rejects(()=>runNext29LiveValidation({...args(),environment:"production"} as any),/restricted to preview or staging/);});
