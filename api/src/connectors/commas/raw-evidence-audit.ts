type Json=Record<string,unknown>;
const obj=(v:unknown):Json|null=>v&&typeof v==="object"&&!Array.isArray(v)?v as Json:null;
const text=(v:unknown)=>String(v??"").trim();

const RELATIONSHIP=/parent|order|checkout|session|purchase|invoice|subscription|rebill|upsell|downsell|funnel|reference/i;
const ATTRIBUTION=/tkid|everflow|affiliate|affid|click|transaction.?id|sub[1-9]|utm|source|campaign|custom/i;
const SENSITIVE=/email|phone|name|address|ip|card|password|token|secret/i;

export function auditCommasRawTransaction(transaction:Json){
 const customFields=Array.isArray(transaction.customFields)?transaction.customFields:[];
 const customLabels=customFields.map(v=>obj(v)).filter(Boolean).map(v=>text(v!.label)).filter(Boolean);
 const paths:string[]=[];
 walk(transaction,"",paths);
 const safe=(re:RegExp)=>paths.filter(p=>re.test(p)&&!SENSITIVE.test(p)).sort();
 return {
   transactionIdPresent:Boolean(text(transaction.id)),
   publicTransactionIdPresent:Boolean(text(transaction.public_transaction_id)),
   servicePaymentIdPresent:Boolean(text(obj(transaction.servicePayment)?.id)),
   refundCount:Array.isArray(transaction.refunds)?transaction.refunds.length:0,
   customFieldCount:customFields.length,
   customFieldLabels:customLabels.filter(label=>!SENSITIVE.test(label)).sort(),
   relationshipCandidatePaths:safe(RELATIONSHIP),
   attributionCandidatePaths:safe(ATTRIBUTION),
   topLevelKeys:Object.keys(transaction).filter(k=>!SENSITIVE.test(k)).sort(),
   servicePaymentKeys:Object.keys(obj(transaction.servicePayment)||{}).filter(k=>!SENSITIVE.test(k)).sort(),
   productKeys:Object.keys(obj(transaction.product)||obj(transaction.service)||{}).filter(k=>!SENSITIVE.test(k)).sort(),
   apiMetadataShape: shapeOnly(transaction.api_metadata),
 };
}
function shapeOnly(value:unknown,depth=0):unknown {
 if(depth>3)return "depth_limit";
 if(value===null)return "null";
 if(Array.isArray(value))return {type:"array",length:value.length,itemShape:value.length?shapeOnly(value[0],depth+1):null};
 if(typeof value!=="object")return {type:typeof value};
 const o=value as Json;
 return {type:"object",keys:Object.keys(o).filter(k=>!SENSITIVE.test(k)).sort(),fields:Object.fromEntries(Object.entries(o).filter(([k])=>!SENSITIVE.test(k)).map(([k,v])=>[k,shapeOnly(v,depth+1)]))};
}
}
function walk(value:unknown,path:string,out:string[],depth=0){
 if(depth>4)return;
 if(Array.isArray(value)){if(value.length)walk(value[0],path+"[]",out,depth+1);return;}
 const o=obj(value);if(!o)return;
 for(const [k,v] of Object.entries(o)){const p=path?path+"."+k:k;out.push(p);walk(v,p,out,depth+1);}
}
