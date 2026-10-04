import {createHash} from "node:crypto";

const PREFIX="tenant_tkorg_";
export function edgeTenantRefForOrganization(organizationId:string){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId))throw new Error("invalid_organization_id");
  return PREFIX+createHash("sha256").update("tracekit-edge-tenant-v1:"+organizationId.toLowerCase()).digest("hex").slice(0,32);
}
export function isSystemManagedEdgeTenantRef(value:string){return new RegExp("^"+PREFIX+"[a-f0-9]{32}$").test(value);}
