type Row=Record<string,unknown>;
const text=(v:unknown)=>typeof v==="string"||typeof v==="number"?String(v):null;
export function inspectRefundIdentityBridge(item:Row,transactionId:string,ord:string,refundHashid:string){
 if(text(item.id)!==transactionId||text(item.public_transaction_id)!==ord)return{state:"parent_identity_mismatch",refundHashid};
 if(!Array.isArray(item.refunds))return{state:"refund_array_unavailable",refundHashid};
 const matches=item.refunds.filter(r=>r&&typeof r==="object"&&!Array.isArray(r)).map(r=>r as Row).filter(r=>[r.hashid,r.hash_id,r.refund_hashid,r.refund_id].some(v=>text(v)===refundHashid));
 const numeric=matches.map(r=>text(r.id)).filter((v):v is string=>!!v&&/^\d+$/.test(v));
 return{state:matches.length===1&&numeric.length===1?"explicit_bridge_observed":matches.length>1?"ambiguous_bridge":"explicit_bridge_not_exposed",refundHashid,numericRefundId:matches.length===1&&numeric.length===1?numeric[0]:null,refundCount:item.refunds.length,refundFieldNames:Array.from(new Set(item.refunds.flatMap(r=>r&&typeof r==="object"&&!Array.isArray(r)?Object.keys(r):[]))).filter(k=>/^(id|refund_id|hashid|hash_id|refund_hashid|payment_id|created_at)$/.test(k)).sort()};
}
