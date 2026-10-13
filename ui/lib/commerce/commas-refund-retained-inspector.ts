type Row=Record<string,unknown>;
const object=(v:unknown):Row=>v&&typeof v==="object"&&!Array.isArray(v)?v as Row:{};
const allowed=new Set(["id","refund_id","refund_hashid","hashid","hash_id","numeric_refund_id","original_payment_id","payment_id","refund_transaction_id","transaction_id"]);
export function inspectRetainedRefundIdentity(payload:unknown,expectedRefund:string,expectedPayment:string){
 const root=object(payload),data=object(root.data);
 if((root.type??root.event_type)!=="refund.created"||String(data.refund_id??root.refund_id??"")!==expectedRefund||String(data.original_payment_id??root.original_payment_id??"")!==expectedPayment)throw new Error("Retained identity mismatch");
 const fields:{path:string;value:string;numeric:boolean}[]=[];
 for(const [prefix,row] of [["root",root],["data",data]] as const)for(const key of Object.keys(row)){
  if(!allowed.has(key))continue;
  const v=row[key];if(typeof v!=="string"&&typeof v!=="number")continue;
  const value=String(v);if(!/^[A-Za-z0-9_-]{1,160}$/.test(value))continue;
  fields.push({path:prefix+"."+key,value,numeric:/^\d+$/.test(value)});
 }
 return{state:"retained_fields_inspected",refundHashid:expectedRefund,identityFields:fields,numericRefundId:null,numericRefundFieldPresent:fields.some(f=>f.numeric&&["data.refund_id","root.refund_id","data.numeric_refund_id","root.numeric_refund_id"].includes(f.path))};
}
