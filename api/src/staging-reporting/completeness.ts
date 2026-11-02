import {ReportingDenied} from './client.ts';
type Proof={table:string;rowCount:number;total:number};
const verified=new WeakMap<object,{proof:Proof;body:string}>();
// These receipts are process-private and originate only from checked transport
// responses. Caller-supplied JSON/PASS labels cannot create them.
export async function completeRead(response:Response,table:string,role:string,max:number){
 if(!response.ok||response.headers.get('x-tracekit-db-login')!=='authenticator'||response.headers.get('x-tracekit-db-session-authorization')!=='authenticator'||response.headers.get('x-tracekit-db-role')!==role||response.headers.get('preference-applied')!=='count=exact')throw new ReportingDenied(503);
 const rows=await response.json();if(!Array.isArray(rows)||rows.length>max||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw new ReportingDenied(503);
 const expected=rows.length?`0-${rows.length-1}/${rows.length}`:'*/0';if(response.headers.get('content-range')!==expected)throw new ReportingDenied(503);
 verified.set(rows,{proof:Object.freeze({table,rowCount:rows.length,total:rows.length}),body:JSON.stringify(rows)});return rows as Record<string,unknown>[];
}
export function readProof(value:object,table:string):Proof{const r=verified.get(value);if(!r||r.proof.table!==table||r.body!==JSON.stringify(value))throw new ReportingDenied(503);return r.proof;}
export function singleComplete(rows:Record<string,unknown>[],table:string){const proof=readProof(rows,table);if(proof.total!==1||proof.rowCount!==1||rows.length!==1)throw new ReportingDenied();const row=rows[0];verified.set(row,{proof,body:JSON.stringify(row)});return row;}
