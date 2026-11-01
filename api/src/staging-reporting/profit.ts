import {sumProfitTotals} from '../profit.ts';
import {qualifyProfitCurrency} from '../profit-currency-qualification.ts';
import {SOURCE_COLUMNS} from './manifest.ts';
import {ReportingDenied,type Claims} from './client.ts';
function reject(code:string):never{throw Object.assign(new ReportingDenied(422),{publicCode:code});}
// Core-computed only. No financial-to-offer join is inferred from these rollups.
export async function computeBaseProfit(db:any,url:URL,c:Readonly<Claims>,revalidate:()=>Promise<void>,snapshotVerified=false){
 if(url.searchParams.has('offer_id'))reject('profit_offer_identity_unresolved');
 if(url.searchParams.get('include_executive_performance')==='1'||url.searchParams.get('includeExecutivePerformance')==='true')reject('profit_executive_unverified');
 // Activation requires independent deployed PostgREST mainRead/snapshot verification.
 // A flag is configuration, not evidence: native acceptance remains a release gate.
 if(!snapshotVerified)throw new ReportingDenied(503);
 const columns=SOURCE_COLUMNS.profit_daily_rollups.columns;
 for(const key of ['from','to']){const value=url.searchParams.get(key);if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw new ReportingDenied(422);}
 // One SQL statement / one snapshot only. Never fetch another page or retry.
 let q=db.from('profit_daily_rollups').select(columns.join(','),{count:'exact'}).eq('workspace_id',c.workspace_id).order('id',{ascending:true}).range(0,4999);
 for(const [key,op,column] of [['from','gte','day'],['to','lte','day'],['connector_id','eq','connector_id'],['platform','eq','platform'],['event_source','eq','event_source'],['currency','eq','currency']]){const v=url.searchParams.get(key);if(v)q=q[op](column,key==='currency'?v.toUpperCase():v);}
 const {data:rows,error,count}=await q;
 if(error||!Array.isArray(rows)||!Number.isSafeInteger(count)||count<0||count!==rows.length||rows.length>5000)throw new ReportingDenied(503);
 const seen=new Set<string>();let previous='';
 for(const row of rows){if(typeof row.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.id)||seen.has(row.id)||row.id<=previous)throw new ReportingDenied(503);seen.add(row.id);previous=row.id;}
 const qualification=qualifyProfitCurrency(rows);if(!qualification.valid)reject('profit_currency_qualification_required');
 // Legacy aggregator coerces unavailable values to zero. Reject incomplete source
 // evidence rather than accidentally certifying that coercion as a genuine zero.
 for(const row of rows)for(const field of columns.filter(x=>!['workspace_id','day','platform','event_source','connector_id','currency','profit_margin_pct','id'].includes(x))){const v=row[field];if(v===null||v===undefined||typeof v==='boolean'||(typeof v!=='number'&&typeof v!=='string')||String(v).trim()===''||!Number.isFinite(Number(v)))throw new ReportingDenied(503);}
 const totals=sumProfitTotals(rows);await revalidate();
 return {ok:true,...totals,fees:Number(totals.chargeback_fees||0)+Number(totals.processor_fees||0)+Number(totals.bank_fees||0),shipping:totals.shipping_cost,currency:qualification.currency,currencies:qualification.currencies,data_available:qualification.data_available,financial_status:'operational_unreconciled'};
}
