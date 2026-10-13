"use client";
import {useRef,useState} from "react";
type Result={observationId?:string;state?:string;refundHashid?:string;numericRefundId?:string|null;refundCount?:number;refundFieldNames?:string[];identityFields?:{path:string;value:string;numeric:boolean}[]};
const labels:Record<string,string>={retained_fields_inspected:"Retained identity fields inspected",explicit_bridge_observed:"Explicit refund ID pair found",explicit_bridge_not_exposed:"Provider did not expose an explicit refund ID pair",ambiguous_bridge:"Multiple refund matches — review required",parent_identity_mismatch:"Provider parent identity did not match",refund_array_unavailable:"Provider refund list unavailable",provider_detail_unavailable:"Provider detail request failed"};
export function CommasRefundDetailControls(){
 const [running,setRunning]=useState(false),[results,setResults]=useState<Result[]|null>(null),[error,setError]=useState<string|null>(null);
 const busy=useRef(false);
 async function inspect(retained=false){
  if(busy.current)return;busy.current=true;setRunning(true);setError(null);setResults(null);
  try{
   const response=await fetch("/api/commerce/commas/raw-evidence-audit"+(retained?"?mode=retained":""),{method:"GET",cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(180000)});
   const body=await response.json();
   if(!response.ok||body.ok!==true||body.mode!=="read_only"||body.writes!==0||!Array.isArray(body.results))throw new Error("Inspection could not complete. No recovery was performed.");
   setResults(body.results);
  }catch{setError("Inspection could not complete. No recovery was performed.");}
  finally{busy.current=false;setRunning(false);}
 }
 return <section className="mx-auto my-6 max-w-[1360px] rounded-lg border p-5" aria-label="Refund identity inspection">
  <h2 className="text-lg font-semibold">Refund identity inspection</h2>
  <p className="mt-2 text-sm">Check provider details for the nine retained Accufy refunds. This inspection does not post refunds or change import progress.</p>
  <button type="button" disabled={running} onClick={()=>inspect()} className="mt-4 rounded-md border px-4 py-2 font-medium disabled:opacity-50">{running?"Inspecting nine refunds…":"Inspect refund identities"}</button>
  <button type="button" disabled={running} onClick={()=>inspect(true)} className="ml-3 mt-4 rounded-md border px-4 py-2 font-medium disabled:opacity-50">Inspect retained webhook fields</button>
  <div aria-live="polite" role="status" className="mt-3">{running?"Reading provider transaction details…":error||results&&`Inspection finished: ${results.length} results. No recovery writes.`}</div>
  {results?<div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Provider refund identity results</caption><thead><tr><th scope="col" className="p-2">Retained refund</th><th scope="col" className="p-2">Result</th><th scope="col" className="p-2">Numeric refund ID</th></tr></thead><tbody>{results.map((row,index)=><tr key={row.observationId||index} className="border-t"><td className="p-2">{row.refundHashid||row.observationId||"Unavailable"}</td><td className="p-2">{labels[row.state||""]||"Unverified response"}</td><td className="p-2">{row.identityFields?row.identityFields.map(f=>f.path+" = "+f.value+(f.numeric?" (numeric)":"")).join("; "):row.numericRefundId||"Not established"}</td></tr>)}</tbody></table></div>:null}
 </section>;
}
