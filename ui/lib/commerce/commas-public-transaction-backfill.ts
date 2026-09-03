import { normalizeCommasTransaction } from "./commas-shadow-normalizer";

export const COMMAS_ORD_BACKFILL_MAX_EVIDENCE_PAGES = 50;
export type OrdBackfillCursor = { observedAt: string; evidenceId: string };

export function normalizeOrdBackfillBatchSize(value: unknown) {
  const parsed=Number(value??25);
  if(!Number.isSafeInteger(parsed)||parsed<1||parsed>COMMAS_ORD_BACKFILL_MAX_EVIDENCE_PAGES)throw new Error(`Evidence page batch size must be 1-${COMMAS_ORD_BACKFILL_MAX_EVIDENCE_PAGES}.`);
  return parsed;
}

export function publicTransactionMappingRecordsFromPage(payload: unknown, scope:{connectionId:string;providerAccountId:string}) {
  const root=payload&&typeof payload==="object"&&!Array.isArray(payload)?payload as Record<string,any>:{};
  const transactions=Array.isArray(root?.data?.transactions)?root.data.transactions:Array.isArray(root.transactions)?root.transactions:null;
  if(!transactions)throw new Error("Retained transaction Evidence has no transaction array.");
  return transactions.map((item:any)=>{
    const normalized=normalizeCommasTransaction(item,{connectionId:scope.connectionId,providerAccountId:scope.providerAccountId});
    return {transaction_id:normalized.transaction_id,public_transaction_id:normalized.public_transaction_id,transaction_at:normalized.transaction_at,payload_hash:normalized.payload_hash};
  });
}

export function nextOrdBackfillCursor(rows:Array<{observed_at:string;id:string}>):OrdBackfillCursor|null {
  const row=rows.at(-1);return row?{observedAt:String(row.observed_at),evidenceId:String(row.id)}:null;
}

export function mergeOrdBackfillSummary(left:Record<string,number>,right:Record<string,unknown>) {
  const keys=["transactions_inspected","valid_ord_identities","unique_ord_identities","exact_order_matches","unmatched_transactions","ambiguous_ord_identities","duplicate_ord_identities","malformed_ord_identities","mappings_written"];
  return Object.fromEntries(keys.map((key)=>[key,Number(left[key]||0)+Number(right[key]||0)]));
}
