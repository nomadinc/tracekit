import {computeBaseProfit} from './profit.ts';
import {createClient} from '@supabase/supabase-js';
import {getCustomerDetail,getCustomerJourneyDetail,listCustomers,listCustomerOrders,normalizeCustomerListParams,normalizeCustomerJourneyDetailParams} from '../customer-explorer.ts';
import {guardedReportingFetch,financial} from './repository.ts';
import {ReportingDenied,type Claims} from './client.ts';
import {OPERATIONS} from './manifest.ts';
export type Operation=keyof typeof OPERATIONS;
export async function compute(operation:Operation,url:URL,c:Claims,token:string,publishableKey:string,revalidate:()=>Promise<void>,transport:typeof fetch=fetch,snapshotVerified=false){
 const db=createClient('https://joahiwgidfbzwzyslrbq.supabase.co',publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:guardedReportingFetch(c,publishableKey,token,transport,revalidate)}});
 const workspace_id=c.workspace_id,person_id=url.searchParams.get('person_id')||'',journey_id=url.searchParams.get('journey_id')||'';
 if(operation==='profit_summary'){if(!financial(c))throw new ReportingDenied();return computeBaseProfit(db,url,c,revalidate,snapshotVerified);}
 let data:any;
 if(operation==='customer_list')data=await listCustomers(db,normalizeCustomerListParams({...Object.fromEntries(url.searchParams),workspace_id}));
 else if(operation==='customer_orders')data=await listCustomerOrders(db,{workspace_id,person_id,order_id:url.searchParams.get('order_id')||undefined,offset:Number(url.searchParams.get('offset')||0),limit:Number(url.searchParams.get('limit')||50)});
 else if((operation==='journey_detail'||operation==='journey_activity'))data=await getCustomerJourneyDetail(db,normalizeCustomerJourneyDetailParams({...Object.fromEntries(url.searchParams),workspace_id,person_id,journey_id}));
 else {
  if(!person_id)throw new ReportingDenied();
  data=await getCustomerDetail(db,{workspace_id,person_id,include_work_items:false});
  if(operation==='attribution_evidence')data={attribution:data.attribution};
  if(operation==='commission_evidence'){if(!financial(c))throw new ReportingDenied();data={commissions:data.commissions};}
 }
 if(operation==='journey_activity')data={activity:data.activity,events:data.events,identity_context:data.identity_context};
 // Source evidence values remain intact; these legacy aggregates do not prove
 // complete, single-currency financial reconciliation in the restricted scope.
 const summaries=[data.summary,...(Array.isArray(data.customers)?data.customers:[])].filter(Boolean);
 for(const summary of summaries)for(const key of ['lifetime_revenue','attributed_revenue','net_profit','profit','total_revenue'])if(Object.hasOwn(summary,key))summary[key]=null;
 if(data.explanations)data.explanations=[];
 if(data.customer_360){data.customer_360.metrics=null;data.customer_360.value_by_month=null;data.customer_360.commercial_summary=null;data.customer_360.commission_summary=null;data.customer_360.restricted_reporting_limit='Aggregate financial completeness and costs are not certified by restricted reporting.';}
 await revalidate();return {...data,capabilities:{work_items:'unavailable',order_evidence:c.permissions.includes('orders.view')?'authorized':'restricted',financial_evidence:financial(c)?'authorized':'restricted'}};
}
