"use client";

import * as React from "react";

export type GoogleEvidenceItem={
 id:string; observedAt:string; payloadHash:string; apiVersion:string; normalizerVersion:string; syncRunId:string|null;
 customerId:string|null; loginCustomerId:string|null; requestId:string|null; reportDate:string|null; payload:unknown; readOnly:true;
};

export function GoogleAdsEvidenceViewer({items}:{items:GoogleEvidenceItem[]}){
 const [open,setOpen]=React.useState(false); const [selected,setSelected]=React.useState(0);
 const item=items[selected]||null;
 async function copy(){if(item) await navigator.clipboard.writeText(JSON.stringify(item.payload,null,2));}
 return <div>
  <button type="button" onClick={()=>setOpen(true)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-white/5">View Google Payload</button>
  {open&&<div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true" aria-label="Google Ads evidence">
   <div className="h-full w-full max-w-3xl overflow-y-auto bg-white p-5 shadow-xl dark:bg-slate-950">
    <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Google Ads Evidence</h2><p className="text-xs text-slate-500">Read-only provider evidence</p></div><button type="button" onClick={()=>setOpen(false)} className="rounded-md border px-3 py-1.5 text-sm">Close</button></div>
    {!item?<p className="mt-6 text-sm text-slate-500">No Google payload evidence is available.</p>:<div className="mt-5 grid gap-5 md:grid-cols-[220px_1fr]">
     <aside><div className="mb-2 text-sm font-medium">Evidence history</div><div className="space-y-2">{items.map((x,i)=><button type="button" key={x.id} onClick={()=>setSelected(i)} className="block w-full rounded-md border p-2 text-left text-xs"><div className="font-medium">{i===0?"Latest":"Previous"}</div><div>{x.observedAt}</div><div className="truncate font-mono">{x.payloadHash}</div></button>)}</div></aside>
     <section className="min-w-0"><div className="grid grid-cols-2 gap-2 text-xs">
      <div>Customer ID: <span className="font-mono">{item.customerId||"—"}</span></div><div>Login customer: <span className="font-mono">{item.loginCustomerId||"—"}</span></div>
      <div>Report date: {item.reportDate||"—"}</div><div>API: {item.apiVersion}</div><div>Request ID: <span className="font-mono">{item.requestId||"—"}</span></div><div>Sync run: <span className="font-mono">{item.syncRunId||"—"}</span></div>
     </div><div className="mt-4 flex items-center justify-between"><div className="text-sm font-medium">Raw JSON payload</div><button type="button" onClick={copy} className="rounded-md border px-2 py-1 text-xs">Copy JSON</button></div>
     <pre className="mt-2 max-h-[60vh] overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(item.payload,null,2)}</pre></section>
    </div>}
   </div>
  </div>}
 </div>;
}
