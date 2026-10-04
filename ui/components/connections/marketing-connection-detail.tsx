import Link from "next/link";
import { KeyRound, Plug, ShieldCheck } from "lucide-react";
import type { ConnectionExperience } from "@/lib/commerce/integration-experience";

const pill: Record<string,string> = {
  connected:"border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  active:"border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  passed:"border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  pending:"border-slate-400/20 bg-slate-400/10 text-slate-300",
  degraded:"border-amber-400/25 bg-amber-400/10 text-amber-200",
  missing:"border-rose-400/25 bg-rose-400/10 text-rose-200",
};
function Status({value}:{value:string}){return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] ${pill[value]||pill.pending}`}>{value.replaceAll("_"," ")}</span>}
function Rows({rows}:{rows:Array<[string,string]>}){return <div className="space-y-3">{rows.map(([label,value])=><div key={label} className="flex items-start justify-between gap-4 text-xs"><span className="text-slate-500">{label}</span><span className="text-right font-medium text-slate-200">{value}</span></div>)}</div>}
function Panel({title,icon,children}:{title:string;icon:React.ReactNode;children:React.ReactNode}){return <section className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><div className="mb-5 flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>{children}</section>}
function fmt(value:string|null){return value?new Intl.DateTimeFormat("en",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)):"Not available"}

export function MarketingConnectionDetail({connection}:{connection:ConnectionExperience}){
 const providerName=connection.provider==="google_ads"?"Google Ads":connection.provider==="meta_ads"?"Meta Ads":connection.provider==="tiktok_ads"?"TikTok Ads":connection.displayName;
 const selected=connection.readiness.find(g=>g.id==="account_selection");
 return <div className="min-h-full bg-[#080a0f] text-slate-100"><div className="mx-auto max-w-[1360px] px-5 py-8 sm:px-8 lg:px-10">
  <header className="flex flex-col gap-5 border-b border-white/10 pb-8 lg:flex-row lg:items-end lg:justify-between"><div><div className="tk-brand-eyebrow text-[10px] font-semibold uppercase tracking-[.2em]">Paid media · {connection.environment}</div><h1 className="mt-3 text-3xl font-semibold tracking-[-.035em] sm:text-4xl">{providerName}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{connection.organizationName} · OAuth identity, advertising-account selection, and provider access readiness.</p></div><Link href="/connections" className="tk-brand-link text-xs font-semibold">Back to Connections</Link></header>
  <div className="mt-6 grid gap-4 lg:grid-cols-3">
   <Panel title="Identity" icon={<Plug className="h-4 w-4"/>}><Rows rows={[["Provider",providerName],["Environment",connection.environment],["Organization",connection.organizationName],["Selected ad account",connection.providerAccountLabel||"None selected"],["Status",connection.status]]}/></Panel>
   <Panel title="OAuth credential" icon={<KeyRound className="h-4 w-4"/>}><div className="flex items-center justify-between"><Status value={connection.credential.status}/><span className="text-xs text-slate-500">Version {connection.credential.version||"—"}</span></div><p className="mt-4 text-xs leading-5 text-slate-500">Credential material is encrypted server-side and is never returned to this page.</p><p className="mt-4 text-[11px] text-slate-500">Created · {fmt(connection.credential.createdAt)}</p></Panel>
   <Panel title="Provider verification" icon={<ShieldCheck className="h-4 w-4"/>}><Rows rows={[["Connection",connection.status],["Last verified",fmt(connection.lastVerifiedAt)],["Account selection",selected?.status||"pending"]]}/></Panel>
  </div>
  <section className="mt-4 rounded-2xl border border-white/10 bg-white/[.035]"><div className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold">Connection readiness</h2><p className="mt-1 text-xs text-slate-500">Paid-media provider state only. Commerce synchronization gates do not apply to this connection.</p></div><div className="divide-y divide-white/10">{connection.readiness.map(g=><div key={g.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[220px_130px_1fr] sm:items-center"><strong className="text-sm">{g.label}</strong><Status value={g.status}/><p className="text-xs leading-5 text-slate-400">{g.explanation}</p></div>)}</div></section>
  <section className="mt-4 rounded-2xl border border-blue-400/15 bg-blue-400/[.035] p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="tk-label text-blue-200">Paid-media ingestion</p><h2 className="mt-2 text-sm font-semibold">Not enabled</h2><p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">This connection currently proves OAuth access and explicit advertising-account selection. Campaign, spend, reporting, scheduling, and production ingestion remain separate milestones.</p></div><Status value="pending"/></div></section>
 </div></div>
}
