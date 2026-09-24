import assert from "node:assert/strict";
import test from "node:test";
import { verifyMcpBearerToken } from "../lib/mcp/bearer-auth";
const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString("base64url");
test("M3 bearer diagnostics classify safe pre-signature failures",async()=>{
 process.env.WORKOS_AUTHKIT_DOMAIN="issuer.example.test";
 const token=(payload:any,header:any={alg:"RS256",kid:"k"})=>`${enc(header)}.${enc(payload)}.x`;
 await assert.rejects(()=>verifyMcpBearerToken("bad"),/invalid_bearer_token:malformed/);
 await assert.rejects(()=>verifyMcpBearerToken(token({iss:"https://wrong",aud:"https://app.trace-kit.io/api/mcp",sub:"u",org_id:"o",exp:9999999999})),/issuer_mismatch/);
 await assert.rejects(()=>verifyMcpBearerToken(token({iss:"https://issuer.example.test",aud:"wrong",sub:"u",org_id:"o",exp:9999999999})),/audience_mismatch/);
 await assert.rejects(()=>verifyMcpBearerToken(token({iss:"https://issuer.example.test",aud:"https://app.trace-kit.io/api/mcp",sub:"u",exp:9999999999})),/missing_org/);
 await assert.rejects(()=>verifyMcpBearerToken(token({iss:"https://issuer.example.test",aud:"https://app.trace-kit.io/api/mcp",sub:"u",org_id:"o",exp:1})),/expired/);
});

test("M3 route diagnostics never log authorization value", async () => {
 const { readFileSync } = await import("node:fs");
 const route=readFileSync(new URL("../app/api/mcp/route.ts",import.meta.url),"utf8");
 assert.match(route,/authorization_header_present/);
 assert.match(route,/authorization_scheme/);
 assert.match(route,/bearer_token_parsed/);
 assert.doesNotMatch(route,/console\.(?:info|warn)\([^\n]*authorization\s*[,}]/);
});
