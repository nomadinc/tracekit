import { createHash } from "node:crypto";
import { normalizeCommasTransaction } from "./commas-shadow-normalizer";

export const COMMAS_ORD_BACKFILL_MAX_EVIDENCE_PAGES = 50;
export const COMMAS_ORD_BACKFILL_MAPPING_PAGE_SIZE = 1000;
export const COMMAS_ORD_FROZEN_BASELINE_VERSION = "commas-ord-frozen-baseline-v2";
export const COMMAS_ORD_NORMALIZER_VERSION = "commas-transaction-v1";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORD=/^ORD-[A-Za-z0-9_-]{1,120}$/;

export type OrdBackfillCursor = { observedAt: string; evidenceId: string };
export type OrdEvidenceRow = { id:string; observed_at:string; storage_reference?:string; payload_hash?:string };
export type OrdMappingRecord = { transaction_id:string|null; public_transaction_id:string|null; transaction_at:string|null; payload_hash:string };
export type ExistingSourceMapping = { source_object_id:string; canonical_object_id:string; state:string };
export type OrdBackfillWindow = { after:OrdBackfillCursor|null; through:OrdBackfillCursor|null };

export function normalizeOrdBackfillBatchSize(value: unknown) {
  const parsed=Number(value??25);
  if(!Number.isSafeInteger(parsed)||parsed<1||parsed>COMMAS_ORD_BACKFILL_MAX_EVIDENCE_PAGES)throw new Error(`Evidence page batch size must be 1-${COMMAS_ORD_BACKFILL_MAX_EVIDENCE_PAGES}.`);
  return parsed;
}

export function normalizeOrdBackfillCursor(observedAt:unknown,evidenceId:unknown,label:string):OrdBackfillCursor|null {
  if(observedAt==null&&evidenceId==null)return null;
  if(!observedAt||!evidenceId)throw new Error(`${label} cursor requires both observed_at and evidence_id.`);
  const timestamp=String(observedAt),id=String(evidenceId);
  if(!Number.isFinite(Date.parse(timestamp)))throw new Error(`${label} observed_at must be a valid timestamp.`);
  if(!UUID.test(id))throw new Error(`${label} evidence_id must be a UUID.`);
  return {observedAt:new Date(timestamp).toISOString(),evidenceId:id.toLowerCase()};
}

export function compareOrdBackfillCursors(left:OrdBackfillCursor,right:OrdBackfillCursor){
  const time=Date.parse(left.observedAt)-Date.parse(right.observedAt);
  return time===0?left.evidenceId.localeCompare(right.evidenceId):time;
}

export function validateOrdBackfillWindow(args:{afterObservedAt?:unknown;afterEvidenceId?:unknown;throughObservedAt?:unknown;throughEvidenceId?:unknown;write?:boolean}):OrdBackfillWindow {
  const after=normalizeOrdBackfillCursor(args.afterObservedAt,args.afterEvidenceId,"Lower");
  const through=normalizeOrdBackfillCursor(args.throughObservedAt,args.throughEvidenceId,"Upper");
  if(args.write&&!through)throw new Error("Write mode requires --through-observed-at and --through-evidence-id.");
  if(after&&through&&compareOrdBackfillCursors(after,through)>0)throw new Error("Lower cursor must not sort after upper horizon.");
  return {after,through};
}

export function evidenceRowCursor(row:Pick<OrdEvidenceRow,"observed_at"|"id">):OrdBackfillCursor {
  return {observedAt:new Date(row.observed_at).toISOString(),evidenceId:String(row.id).toLowerCase()};
}

export function evidenceRowInWindow(row:Pick<OrdEvidenceRow,"observed_at"|"id">,window:OrdBackfillWindow){
  const cursor=evidenceRowCursor(row);
  return (!window.after||compareOrdBackfillCursors(cursor,window.after)>0)&&(!window.through||compareOrdBackfillCursors(cursor,window.through)<=0);
}

export function evidenceRowsWithinWindow(rows:OrdEvidenceRow[],window:OrdBackfillWindow){
  return rows.filter(row=>evidenceRowInWindow(row,window)).sort((a,b)=>compareOrdBackfillCursors(evidenceRowCursor(a),evidenceRowCursor(b)));
}

export function evidenceRangeQuery(window:OrdBackfillWindow){
  const lower=window.after?`observed_at.gt.${window.after.observedAt},and(observed_at.eq.${window.after.observedAt},id.gt.${window.after.evidenceId})`:null;
  const upper=window.through?`observed_at.lt.${window.through.observedAt},and(observed_at.eq.${window.through.observedAt},id.lte.${window.through.evidenceId})`:null;
  if(lower&&upper)return `&and=${encodeURIComponent(`(or(${lower}),or(${upper}))`)}`;
  const only=lower||upper;return only?`&or=${encodeURIComponent(`(${only})`)}`:"";
}

export function publicTransactionMappingRecordsFromPage(payload: unknown, scope:{connectionId:string;providerAccountId:string}) {
  const root=payload&&typeof payload==="object"&&!Array.isArray(payload)?payload as Record<string,any>:{};
  const transactions=Array.isArray(root?.data?.transactions)?root.data.transactions:Array.isArray(root.transactions)?root.transactions:null;
  if(!transactions)throw new Error("Retained transaction Evidence has no transaction array.");
  return transactions.map((item:any):OrdMappingRecord=>{
    const normalized=normalizeCommasTransaction(item,{connectionId:scope.connectionId,providerAccountId:scope.providerAccountId});
    return {transaction_id:normalized.transaction_id,public_transaction_id:normalized.public_transaction_id,transaction_at:normalized.transaction_at,payload_hash:normalized.payload_hash};
  });
}

export function nextOrdBackfillCursor(rows:Array<{observed_at:string;id:string}>,through:OrdBackfillCursor|null=null):OrdBackfillCursor|null {
  const row=rows.at(-1);if(!row)return null;const cursor=evidenceRowCursor(row);
  return through&&compareOrdBackfillCursors(cursor,through)>=0?null:cursor;
}

export function mergeOrdBackfillSummary(left:Record<string,number>,right:Record<string,unknown>) {
  const keys=["transactions_inspected","valid_ord_identities","unique_ord_identities","exact_order_matches","unmatched_transactions","ambiguous_ord_identities","duplicate_ord_identities","malformed_ord_identities","mappings_written"];
  return Object.fromEntries(keys.map((key)=>[key,Number(left[key]||0)+Number(right[key]||0)]));
}

function add(map:Map<string,Set<string>>,key:string,value:string){const values=map.get(key)||new Set<string>();values.add(value);map.set(key,values)}
export function analyzeOrdFrozenCohort(args:{records:OrdMappingRecord[];numericMappings:ExistingSourceMapping[];ordMappings:ExistingSourceMapping[];evidenceHashChecked:number;evidenceHashFailures:number}){
  const ordToTransactions=new Map<string,Set<string>>(),transactionToOrds=new Map<string,Set<string>>();
  let populated=0,validObservations=0,malformed=0;
  for(const record of args.records){const ord=String(record.public_transaction_id||""),tx=String(record.transaction_id||"");if(!ord)continue;populated+=1;if(!ORD.test(ord)){malformed+=1;continue}validObservations+=1;if(!ordToTransactions.has(ord))ordToTransactions.set(ord,new Set<string>());if(tx){add(ordToTransactions,ord,tx);add(transactionToOrds,tx,ord)}}
  const numericToOrders=new Map<string,Set<string>>();for(const row of args.numericMappings)if(row.state==="active")add(numericToOrders,String(row.source_object_id),String(row.canonical_object_id));
  const existingOrdRows=new Map<string,ExistingSourceMapping[]>();for(const row of args.ordMappings){const key=String(row.source_object_id),rows=existingOrdRows.get(key)||[];rows.push(row);existingOrdRows.set(key,rows)}
  const ordToOrders=new Map<string,Set<string>>(),ambiguous=new Set<string>();let exact=0,unmatched=0,wouldWrite=0,idempotent=0,existingConflicts=0;
  for(const [ord,transactions] of Array.from(ordToTransactions.entries()))for(const tx of Array.from(transactions))for(const order of Array.from(numericToOrders.get(tx)||[]))add(ordToOrders,ord,order);
  for(const [ord,transactions] of Array.from(ordToTransactions.entries())){if(transactions.size===0){unmatched+=1;continue}if(transactions.size>1){ambiguous.add(ord);continue}const tx=Array.from(transactions)[0],orders=numericToOrders.get(tx)||new Set<string>();if(orders.size===0){unmatched+=1;continue}if(orders.size!==1){ambiguous.add(ord);continue}const order=Array.from(orders)[0],existing=existingOrdRows.get(ord)||[];if(existing.length&&(existing.length!==1||existing[0].state!=="active"||String(existing[0].canonical_object_id)!==order)){existingConflicts+=1;ambiguous.add(ord);continue}exact+=1;if(existing.length===1)idempotent+=1;else wouldWrite+=1}
  const ordMultipleTransactions=Array.from(ordToTransactions.values()).filter(v=>v.size>1).length;
  const transactionMultipleOrds=Array.from(transactionToOrds.values()).filter(v=>v.size>1).length;
  const ordMultipleOrders=Array.from(ordToOrders.values()).filter(v=>v.size>1).length;
  const transactionMultipleOrders=Array.from(transactionToOrds.keys()).filter(tx=>(numericToOrders.get(tx)?.size||0)>1).length;
  const metrics={transaction_observations:args.records.length,ord_observations:populated,valid_ord_observations:validObservations,unique_ord_identities:ordToTransactions.size,numeric_transaction_ids:transactionToOrds.size,exact_matched_ord_identities:exact,unmatched_ord_identities:unmatched,ambiguous_identities:ambiguous.size,malformed_ord_identities:malformed,ord_to_multiple_numeric_transaction_ids:ordMultipleTransactions,numeric_transaction_id_to_multiple_ord_identities:transactionMultipleOrds,ord_to_multiple_canonical_orders:ordMultipleOrders,numeric_transaction_to_multiple_canonical_orders:transactionMultipleOrders,existing_conflicting_commas_public_transaction_mappings:existingConflicts,would_write_mappings:wouldWrite,already_existing_idempotent_mappings:idempotent,evidence_hash_checked:args.evidenceHashChecked,evidence_hash_failures:args.evidenceHashFailures};
  return {...metrics,acceptance_safe:args.evidenceHashFailures===0&&malformed===0&&ambiguous.size===0&&ordMultipleTransactions===0&&transactionMultipleOrds===0&&ordMultipleOrders===0&&transactionMultipleOrders===0&&existingConflicts===0};
}

export function ordFrozenBaselineFingerprint(value:unknown){return createHash("sha256").update(JSON.stringify(value)).digest("hex")}

export function ordFrozenBaselineMaterial(args:{scope:{organizationId:string;connectionId:string;providerAccountId:string};window:OrdBackfillWindow;evidence:OrdEvidenceRow[];records:OrdMappingRecord[];numericMappings:ExistingSourceMapping[];ordMappings:ExistingSourceMapping[];metrics:Record<string,unknown>}){
  const valid=args.records.filter(record=>ORD.test(String(record.public_transaction_id||""))&&Boolean(record.transaction_id));
  const referencedTransactions=new Set(valid.map(record=>String(record.transaction_id)));
  const referencedOrds=new Set(valid.map(record=>String(record.public_transaction_id)));
  const numericAuthority=args.numericMappings.filter(row=>referencedTransactions.has(String(row.source_object_id))).map(row=>[String(row.source_object_id),String(row.canonical_object_id),String(row.state)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const transactionOrders=new Map<string,Set<string>>();for(const row of args.numericMappings)if(referencedTransactions.has(String(row.source_object_id))&&row.state==="active")add(transactionOrders,String(row.source_object_id),String(row.canonical_object_id));
  const ordTransactions=new Map<string,Set<string>>();for(const record of valid)add(ordTransactions,String(record.public_transaction_id),String(record.transaction_id));
  const expectedOrders=new Map<string,string>();for(const [ord,transactions] of Array.from(ordTransactions.entries()))if(transactions.size===1){const orders=transactionOrders.get(Array.from(transactions)[0]);if(orders?.size===1)expectedOrders.set(ord,Array.from(orders)[0])}
  const actualOrdStates=new Map<string,Set<string>>();for(const row of args.ordMappings)if(referencedOrds.has(String(row.source_object_id)))add(actualOrdStates,String(row.source_object_id),`${row.canonical_object_id}:${row.state}`);
  const normalizedOrdAuthority=Array.from(referencedOrds).sort().map(ord=>{const expected=expectedOrders.get(ord)||null,actual=Array.from(actualOrdStates.get(ord)||[]).sort(),expectedState=expected?`${expected}:active`:null;const acceptable=!actual.length||(expectedState!==null&&actual.length===1&&actual[0]===expectedState);return [ord,expected,acceptable?"absent_or_idempotent":actual]});
  const diagnosticKeys=["transaction_observations","ord_observations","valid_ord_observations","unique_ord_identities","numeric_transaction_ids","exact_matched_ord_identities","unmatched_ord_identities","ambiguous_identities","malformed_ord_identities","ord_to_multiple_numeric_transaction_ids","numeric_transaction_id_to_multiple_ord_identities","ord_to_multiple_canonical_orders","numeric_transaction_to_multiple_canonical_orders","existing_conflicting_commas_public_transaction_mappings","evidence_hash_checked","evidence_hash_failures","acceptance_safe"];
  return {baseline_version:COMMAS_ORD_FROZEN_BASELINE_VERSION,normalizer_version:COMMAS_ORD_NORMALIZER_VERSION,scope:args.scope,window:args.window,evidence:args.evidence.map(row=>[new Date(row.observed_at).toISOString(),String(row.id).toLowerCase(),String(row.payload_hash||"")]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),valid_ord_observations:valid.map(row=>[String(row.public_transaction_id),String(row.transaction_id),row.transaction_at,String(row.payload_hash)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),numeric_authority:numericAuthority,normalized_ord_authority:normalizedOrdAuthority,diagnostics:Object.fromEntries(diagnosticKeys.map(key=>[key,args.metrics[key]]))};
}
