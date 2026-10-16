import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
const nativeRequire=createRequire(import.meta.url);
test("missing optional marketing catalog preserves client invitations, while other storage errors propagate",async()=>{
 class PersistenceError extends Error { constructor(readonly status:number,readonly databaseCode:string,readonly resource:string){super("storage unavailable");} }
 let code="PGRST205";
 const output=await build({entryPoints:[new URL("../lib/platform/admin-repository.ts",import.meta.url).pathname],bundle:true,write:false,platform:"node",format:"cjs",plugins:[{name:"repository-mocks",setup(b){b.onResolve({filter:/server-only|supabase-control-repository|platform-access|admin-policy|invitation-target-access|supabase-identity-repository/},args=>({path:args.path.split("/").pop()!,external:true}));}}]});
 const mocks:Record<string,unknown>={
  "server-only":{},"platform-access":{assertCanonicalPlatformMembership:async()=>{}},"admin-policy":{requirePlatformAdmin:()=>{}},
  "supabase-identity-repository":{SupabaseIdentityTenancyRepository:class {}},
  "invitation-target-access":{resolveInvitationTargetAccess:async()=>({accessibleBusinessContexts:[{id:"workspace",name:"Allowed"}]})},
  "supabase-control-repository":{CommercePersistenceError:PersistenceError,commercePersistenceRequest:async(path:string)=>{
   if(path.startsWith("tracekit_accounts?"))return [{id:"account",name:"Client",account_type:"client",status:"active"}];
   if(path.startsWith("tracekit_organizations?"))return [{id:"organization",name:"Client",status:"active"}];
   if(path.startsWith("marketing_provider_connections?"))throw new PersistenceError(404,code,"marketing_provider_connections");
   return [];
  }},
 };
 const bundledModule={exports:{} as any};
 runInNewContext(output.outputFiles[0].text,{module:bundledModule,exports:bundledModule.exports,require:(name:string)=>name in mocks?mocks[name]:nativeRequire(name),process:{env:{}},console});
 const session={effectivePermissions:["users.invite","users.view","offers.view","connectors.view"]};
 for(code of ["PGRST205","42P01"]){
  const detail=await bundledModule.exports.loadClientDetail(session,"account");
  assert.equal(detail.groups[0].connectionsUnavailable,true);
  assert.equal(detail.groups[0].connections,null);
  assert.equal(detail.groups[0].invitationContexts[0].id,"workspace");
 }
 code="42501";
 await assert.rejects(bundledModule.exports.loadClientDetail(session,"account"),/storage unavailable/);
});
