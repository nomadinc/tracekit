import{readFileSync}from"node:fs";import{randomUUID}from"node:crypto";
const CONFIRM="--confirm-edge-intelligence-staging-proof";
if(!process.argv.includes(CONFIRM))throw new Error("Refusing to run without "+CONFIRM);
const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error("Supabase environment unavailable");
const project=new URL(url).hostname.split(".")[0];if(project!=="joahiwgidfbzwzyslrbq")throw new Error("This proof is Staging-only");
const fixture=JSON.parse(readFileSync(new URL("../tests/fixtures/edge-intelligence-v1.examples.json",import.meta.url),"utf8")).scenarios.normalResidential;
const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"};
async function rest(path:string,init:RequestInit={}){const r=await fetch(url+"/rest/v1/"+path,{...init,headers:{...headers,...init.headers}});const t=await r.text();if(!r.ok)throw new Error(path+" "+r.status+" "+t.slice(0,300));return t?JSON.parse(t):null}
async function expectReject(label:string,fn:()=>Promise<any>){try{await fn();throw new Error(label+" unexpectedly accepted")}catch(e:any){if(String(e.message).includes("unexpectedly accepted"))throw e;return{label,rejected:true}}}
const orgs=await rest("tracekit_organizations?select=id&order=created_at.asc&limit=2");if(!Array.isArray(orgs)||orgs.length<2)throw new Error("Two Staging organizations required for tenant-isolation proof");
const orgA=orgs[0].id,orgB=orgs[1].id,suffix=randomUUID().replaceAll("-","").slice(0,12),base={...fixture,tenantRef:"tenant_staging_"+suffix,observationId:"obs_staging_"+suffix,sessionRef:"session_staging_"+suffix,eventRef:"event_staging_"+suffix};
const rpc=(org:string,payload:any)=>rest("rpc/ingest_edge_intelligence_v1",{method:"POST",body:JSON.stringify({p_organization_id:org,p_payload:payload})});
const first=await rpc(orgA,base),duplicate=await rpc(orgA,base);
const rev2={...base,revision:2,previousRevision:1,updatedAt:new Date(Date.parse(base.updatedAt)+1000).toISOString(),status:"PARTIAL"};
const second=await rpc(orgA,rev2),stale=await rpc(orgA,base);
const conflict=await expectReject("same-revision conflict",()=>rpc(orgA,{...rev2,status:"COMPLETE"}));
const wrongVersion=await expectReject("breaking schema",()=>rpc(orgA,{...base,observationId:"obs_version_"+suffix,schemaVersion:"2.0"}));
const forbidden=await expectReject("routing firewall",()=>rpc(orgA,{...base,observationId:"obs_route_"+suffix,intelligence:{...base.intelligence,routingDecision:"money"}}));
const tenantB=await rpc(orgB,base);
const current=await rest("edge_intelligence_current?select=organization_id,revision&tenant_ref=eq."+encodeURIComponent(base.tenantRef)+"&observation_id=eq."+encodeURIComponent(base.observationId));
const rows=await rest("edge_intelligence_observations?select=organization_id,revision&tenant_ref=eq."+encodeURIComponent(base.tenantRef)+"&observation_id=eq."+encodeURIComponent(base.observationId)+"&order=revision.asc");
const pass=first.outcome==="accepted"&&duplicate.outcome==="duplicate"&&second.outcome==="accepted"&&stale.outcome==="duplicate"&&tenantB.outcome==="accepted"&&current.length===2&&rows.length===3&&current.find((x:any)=>x.organization_id===orgA)?.revision===2&&current.find((x:any)=>x.organization_id===orgB)?.revision===1;
if(!pass)throw new Error("Acceptance assertions failed: "+JSON.stringify({first,duplicate,second,stale,tenantB,current,rows}));
console.log(JSON.stringify({ok:true,project,first:first.outcome,duplicate:duplicate.outcome,newer:second.outcome,lateExistingRevision:stale.outcome,conflict,wrongVersion,forbidden,tenantIsolation:true,current,immutableRows:rows.length},null,2));
