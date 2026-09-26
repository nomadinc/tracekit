import "server-only";
import { listMarketingConnections,listMarketingProviderAccounts,marketingPersistenceRequest,type MarketingProviderAccount } from "./marketing-provider-repository";
export type GoogleManagementTransport=(path:string,init?:RequestInit)=>Promise<Record<string,any>[]>;

function node(a:MarketingProviderAccount){return{...a,children:[] as any[]};}
export async function buildGoogleAdsManagementState(input:{organizationId:string;transport?:GoogleManagementTransport}){
 const t=input.transport;
 let connections:any[];
 if(t){const rows=await t(`marketing_provider_connections?organization_id=eq.${encodeURIComponent(input.organizationId)}&provider=eq.google_ads&status=neq.revoked&order=created_at.asc`);connections=rows.map(r=>({id:String(r.id),organizationId:String(r.organization_id),accountId:String(r.account_id),provider:String(r.provider),displayName:String(r.display_name),status:String(r.status),reauthorizationRequired:Boolean(r.reauthorization_required),capabilities:r.capabilities||{}}));}
 else connections=await listMarketingConnections(input.organizationId,"google_ads");
 const out=[];
 for(const connection of connections){
  let accounts:MarketingProviderAccount[];
  if(t){const rows=await t(`marketing_provider_accounts?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(connection.id)}&provider=eq.google_ads&order=hierarchy_depth.asc,provider_account_label.asc`);accounts=rows.map((r:any)=>({id:String(r.id),connectionId:String(r.connection_id),provider:String(r.provider),externalId:String(r.provider_account_external_id),label:r.provider_account_label?String(r.provider_account_label):null,parentProviderAccountId:r.parent_provider_account_id?String(r.parent_provider_account_id):null,accountType:String(r.account_type||"unknown") as any,hierarchyDepth:r.hierarchy_depth==null?null:Number(r.hierarchy_depth),isManager:Boolean(r.is_manager),eligibleForSpendSync:Boolean(r.eligible_for_spend_sync),currency:r.currency?String(r.currency):null,timezoneName:r.timezone_name?String(r.timezone_name):null,status:String(r.status||"active"),selectedForSync:Boolean(r.selected_for_sync),metadata:r.metadata||{}}));}
  else accounts=await listMarketingProviderAccounts(input.organizationId,connection.id);
  const map=new Map(accounts.map(a=>[a.id,node(a)]));const roots:any[]=[];
  for(const a of accounts){const n=map.get(a.id)!;const p=a.parentProviderAccountId?map.get(a.parentProviderAccountId):null;if(p)p.children.push(n);else roots.push(n);}
  out.push({...connection,accounts:roots});
 }
 return{connections:out};
}
export async function setGoogleAdsAccountSelection(input:{organizationId:string;connectionId:string;selectedAccountIds:string[];transport?:GoogleManagementTransport}){
 const t=input.transport||marketingPersistenceRequest;const rows=await t(`marketing_provider_accounts?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider=eq.google_ads`);
 const byId=new Map(rows.map(r=>[String(r.id),r]));const selected=new Set(input.selectedAccountIds);
 for(const id of selected){const r=byId.get(id);if(!r||!r.eligible_for_spend_sync||r.is_manager||(r.status!=="active"&&r.status!=="degraded"))throw new Error("Only spend-eligible Google Ads client accounts can be selected.");}
 for(const r of rows){const desired=selected.has(String(r.id));if(Boolean(r.selected_for_sync)===desired)continue;await t(`marketing_provider_accounts?id=eq.${encodeURIComponent(String(r.id))}&organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}`,{method:"PATCH",body:JSON.stringify({selected_for_sync:desired,updated_at:new Date().toISOString()})});}
 return{selectedAccountIds:Array.from(selected)};
}
