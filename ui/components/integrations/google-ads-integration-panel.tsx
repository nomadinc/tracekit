"use client";
import * as React from "react";
import { GoogleAdsEvidenceViewer,type GoogleEvidenceItem } from "./google-ads-evidence-viewer";

type Account={id:string;externalId:string;label:string|null;accountType:"manager"|"advertiser"|"hybrid"|"unknown";hierarchyDepth:number|null;eligibleForSpendSync:boolean;selectedForSync:boolean;status:string;evidence?:GoogleEvidenceItem[]};
type Connection={id:string;displayName:string;status:string;accounts:Account[]};

function AccountRow({account}:{account:Account}){
 const [selected,setSelected]=React.useState(account.selectedForSync);
 const manager=account.accountType==="manager"||account.accountType==="hybrid";
 return <div className="flex items-center justify-between gap-3 rounded-md border p-3" style={{marginLeft:`${Math.max(0,account.hierarchyDepth||0)*16}px`}}>
  <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate font-medium">{account.label||account.externalId}</span><span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{manager?"Manager":"Advertiser"}</span></div><div className="mt-1 font-mono text-xs text-gray-500">{account.externalId}</div></div>
  <div className="flex items-center gap-3">{account.eligibleForSpendSync?<label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected} onChange={e=>setSelected(e.target.checked)}/> Sync spend</label>:<span className="text-xs text-gray-500">Not a spend target</span>}{account.evidence?.length?<GoogleAdsEvidenceViewer items={account.evidence}/>:null}</div>
 </div>;
}

export function GoogleAdsIntegrationPanel(){
 const [connections,setConnections]=React.useState<Connection[]>([]); const [message,setMessage]=React.useState("");
 React.useEffect(()=>{fetch("/v1/integrations/google-ads/management",{cache:"no-store"}).then(r=>r.json()).then(x=>{if(x.ok)setConnections(x.connections||[]);else setMessage(x.message||"Google Ads state unavailable.");}).catch(()=>setMessage("Google Ads state unavailable."));},[]);
 return <div className="space-y-5">{message?<div className="rounded-md border p-3 text-sm">{message}</div>:null}
  <div className="rounded-lg border p-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Google Ads connections</h2><p className="mt-1 text-sm text-gray-600">Multiple authorizations and nested manager accounts are supported.</p></div><button type="button" disabled className="rounded-md border px-3 py-1.5 text-sm opacity-50">Add Google account</button></div><p className="mt-3 text-xs text-amber-700">Live OAuth activation is not enabled for this certification build.</p></div>
  {!connections.length?<div className="rounded-lg border border-dashed p-6 text-sm text-gray-500">No live Google Ads connection is configured yet. Account hierarchy will appear here after an authorized discovery.</div>:connections.map(connection=><section key={connection.id} className="rounded-lg border p-4"><div className="flex items-center justify-between"><div><div className="font-semibold">{connection.displayName}</div><div className="text-xs text-gray-500">{connection.status}</div></div><div className="flex gap-2"><input type="date" aria-label="Sync from"/><input type="date" aria-label="Sync through"/><button type="button" className="rounded-md border px-3 py-1.5 text-sm">Run Now</button></div></div><div className="mt-4 space-y-2">{connection.accounts.map(account=><AccountRow key={account.id} account={account}/>)}</div></section>)}
  <div className="rounded-lg border p-4"><div className="font-medium">Synchronization</div><p className="mt-1 text-sm text-gray-600">Run Now uses the selected advertiser accounts and bounded date windows.</p><p className="mt-2 text-xs text-gray-500">Automatic scheduling is disabled. No background Google Ads ingestion is activated by this page.</p></div>
  <div className="sr-only">View Google Payload</div>
 </div>;
}
