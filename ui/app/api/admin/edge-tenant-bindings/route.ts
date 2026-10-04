import {NextResponse} from "next/server";
import {resolveApplicationSession} from "@/lib/identity/application-session";
import {getEdgeTenantBinding,upsertEdgeTenantBinding} from "@/lib/edge/tenant-binding-repository";
import {edgeTenantRefForOrganization} from "@/lib/edge/tenant-identity";
import {requirePermission} from "@/lib/identity/authorization-gateway";

const tenantPattern=/^tenant_[A-Za-z0-9_-]{8,128}$/;
function unavailable(){return NextResponse.json({error:"The requested resource is unavailable."},{status:404});}
async function authorized(){const r=await resolveApplicationSession();if(r.kind!=="authenticated"){console.warn("edge_tenant_binding_gate",{gate:"session_resolution",kind:r.kind});return null;}try{requirePermission(r.session,"admin.manage_tenants");return r.session;}catch{console.warn("edge_tenant_binding_gate",{gate:"permission_gate",role:r.session.membership.role});return null;}}

export async function GET(request:Request){
 const session=await authorized();if(!session)return unavailable();
 const tenantRef=new URL(request.url).searchParams.get("tenantRef")||"";if(!tenantPattern.test(tenantRef))return unavailable();
 const binding=await getEdgeTenantBinding(tenantRef);if(!binding)return unavailable();
 return NextResponse.json({binding});
}

export async function POST(request:Request){
 const session=await authorized();if(!session)return unavailable();
 const body=await request.json().catch(()=>null) as {organizationId?:unknown;status?:unknown}|null;
 if(typeof body?.organizationId!=="string"||!["active","disabled"].includes(String(body.status))){console.warn("edge_tenant_binding_gate",{gate:"payload_validation"});return unavailable();}
 const allowed=await new (await import("@/lib/identity/supabase-identity-repository")).SupabaseIdentityTenancyRepository().allActiveOrganizations();
 if(!allowed.some(org=>org.id===body.organizationId)){console.warn("edge_tenant_binding_gate",{gate:"organization_catalog",organizationId:body.organizationId,catalogSize:allowed.length});return unavailable();}
 const tenantRef=edgeTenantRefForOrganization(body.organizationId);
 const binding=await upsertEdgeTenantBinding({tenantRef,organizationId:body.organizationId,status:body.status as "active"|"disabled"});
 return NextResponse.json({binding});
}
