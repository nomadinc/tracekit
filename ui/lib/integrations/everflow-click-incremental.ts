import "server-only";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

const RESOURCE = "everflow_clicks";
export const EVERFLOW_CLICK_INCREMENTAL_OVERLAP_DAYS = 1;
export const EVERFLOW_CLICK_INCREMENTAL_BOOTSTRAP_DAYS = 2;
type Row = Record<string, unknown>;
const text = (value: unknown) => value === null || value === undefined ? null : String(value);
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const dayStart = (date: Date) => `${date.toISOString().slice(0, 10)} 00:00:00`;
const dayEnd = (date: Date) => `${date.toISOString().slice(0, 10)} 23:59:59`;
const subtractDays = (date: Date, days: number) => new Date(date.getTime() - days * 86_400_000);
const nextDay = (value: string) => dayStart(new Date(Date.parse(value.replace(" ", "T") + "Z") + 86_400_000));

export async function loadEverflowClickIncrementalState(input:{organizationId:string;connectionId:string;providerAccountId:string}) {
  const rows=await commercePersistenceRequest(`commerce_continuous_sync_state?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&resource=eq.${RESOURCE}&select=id,last_successful_at,status,last_stability_boundary&limit=1`);
  const row=rows[0]||{};
  return {id:text(row.id),lastSuccessfulAt:text(row.last_successful_at),status:text(row.status)||"unknown",boundary:object(row.last_stability_boundary)};
}

export function everflowClickIncrementalWindow(input:{now:Date;lastSuccessfulAt?:string|null;boundary?:Row;overlapDays?:number;bootstrapDays?:number}) {
  const overlapDays=Math.min(7,Math.max(1,Math.trunc(input.overlapDays??EVERFLOW_CLICK_INCREMENTAL_OVERLAP_DAYS)));
  const bootstrapDays=Math.min(7,Math.max(1,Math.trunc(input.bootstrapDays??EVERFLOW_CLICK_INCREMENTAL_BOOTSTRAP_DAYS)));
  const activeFrom=text(input.boundary?.incrementalCursorFrom),activeTo=text(input.boundary?.incrementalTargetTo);
  if(activeFrom&&activeTo) return {from:activeFrom,to:dayEnd(new Date(`${activeFrom.slice(0,10)}T00:00:00Z`)),targetTo:activeTo,overlapDays,bootstrap:Boolean(input.boundary?.bootstrap),resumed:true};
  const parsed=input.lastSuccessfulAt?Date.parse(input.lastSuccessfulAt):NaN;
  const anchor=Number.isFinite(parsed)?new Date(parsed):subtractDays(input.now,bootstrapDays-1);
  const fromDate=subtractDays(anchor,overlapDays),maxFrom=subtractDays(input.now,14),boundedFrom=fromDate<maxFrom?maxFrom:fromDate;
  return {from:dayStart(boundedFrom),to:dayEnd(boundedFrom),targetTo:dayEnd(input.now),overlapDays,bootstrap:!Number.isFinite(parsed),resumed:false};
}

export async function markEverflowClickIncrementalAttempt(input:{accountId:string;organizationId:string;connectionId:string;providerAccountId:string;attemptedAt:string;window:{from:string;targetTo:string;overlapDays:number;bootstrap:boolean}}) {
  const row={account_id:input.accountId,organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:input.providerAccountId,resource:RESOURCE,last_attempted_at:input.attemptedAt,normalizer_version:"everflow-click-v1",evidence_contract_version:"everflow-click-raw-v1",status:"unknown",attribution_source_state:"available",recent_source_ids:[],page_fingerprints:{},last_stability_boundary:{incrementalCursorFrom:input.window.from,incrementalTargetTo:input.window.targetTo,overlapDays:input.window.overlapDays,bootstrap:input.window.bootstrap},warnings:[],updated_at:input.attemptedAt};
  await commercePersistenceRequest("commerce_continuous_sync_state?on_conflict=connection_id,provider_account_id,resource",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(row)});
}

export async function markEverflowClickIncrementalChunkSuccess(input:{organizationId:string;connectionId:string;providerAccountId:string;completedAt:string;from:string;to:string;targetTo:string;overlapDays:number;bootstrap:boolean;seen:number}) {
  const finalDay=input.to.slice(0,10)>=input.targetTo.slice(0,10);
  const patch:Row={last_provider_observation_at:input.completedAt,last_normalized_record_at:input.completedAt,provider_total_observed:input.seen,warnings:[],updated_at:input.completedAt};
  if(finalDay) Object.assign(patch,{last_successful_at:input.completedAt,last_stability_boundary:{providerFrom:input.from,providerTo:input.targetTo,overlapDays:input.overlapDays},last_stopping_reason:"window_complete",status:"current"});
  else Object.assign(patch,{last_stability_boundary:{incrementalCursorFrom:nextDay(input.from),incrementalTargetTo:input.targetTo,overlapDays:input.overlapDays,bootstrap:input.bootstrap},last_stopping_reason:"chunk_complete",status:"stale"});
  await commercePersistenceRequest(`commerce_continuous_sync_state?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&resource=eq.${RESOURCE}`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(patch)});
  return {windowComplete:finalDay,nextFrom:finalDay?null:nextDay(input.from)};
}

export async function markEverflowClickIncrementalFailure(input:{organizationId:string;connectionId:string;providerAccountId:string;failedAt:string;warningCode:string}) {
  await commercePersistenceRequest(`commerce_continuous_sync_state?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&resource=eq.${RESOURCE}`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({status:"failed",last_stopping_reason:"sync_failed",warnings:[{code:input.warningCode}],updated_at:input.failedAt})});
}
