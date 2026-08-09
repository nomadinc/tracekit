"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { ArrowRight, X } from "lucide-react";
import type { InvestigationInspectionType, SafeInvestigationInspection } from "@/lib/investigations/presentation";
import { inspectionHref, withoutInspectionHref } from "@/lib/investigations/inspection-state";

type InspectionTarget={type:InvestigationInspectionType;key:string};
const InspectionContext=createContext<{open:(target:InspectionTarget,trigger:HTMLElement)=>void}|null>(null);

export function InvestigationInspectionProvider({inspections,children}:{inspections:SafeInvestigationInspection[];children:React.ReactNode}){
  const router=useRouter(),pathname=usePathname(),params=useSearchParams(),triggerRef=useRef<HTMLElement|null>(null),openedHere=useRef(false),wasOpen=useRef(false);
  const type=params.get("inspect") as InvestigationInspectionType|null,key=params.get("key");
  const inspection=useMemo(()=>inspections.find(item=>item.type===type&&item.key===key)||null,[inspections,key,type]);
  const open=useCallback((target:InspectionTarget,trigger:HTMLElement)=>{triggerRef.current=trigger;openedHere.current=true;router.push(inspectionHref(pathname,params.toString(),target),{scroll:false});},[params,pathname,router]);
  const close=useCallback(()=>{if(openedHere.current){openedHere.current=false;router.back();}else router.replace(withoutInspectionHref(pathname,params.toString()),{scroll:false});},[params,pathname,router]);
  useEffect(()=>{if(inspection)wasOpen.current=true;else if(wasOpen.current){wasOpen.current=false;triggerRef.current?.focus();}},[inspection]);
  return <InspectionContext.Provider value={{open}}><div inert={Boolean(inspection)||undefined}>{children}</div>{inspection?<InspectionDrawer inspection={inspection} onClose={close}/>:null}</InspectionContext.Provider>;
}

export function InspectionTrigger({type,inspectionKey:targetKey,children,className="",ariaLabel}:{type:InvestigationInspectionType;inspectionKey:string;children:React.ReactNode;className?:string;ariaLabel?:string}){
  const context=useContext(InspectionContext);
  if(!context)return <>{children}</>;
  return <button type="button" className={`tk-inspection-trigger group text-left ${className}`} aria-label={ariaLabel} onClick={event=>context.open({type,key:targetKey},event.currentTarget)}>{children}<span aria-hidden="true" className="tk-inspection-affordance">Inspect <ArrowRight className="h-3 w-3"/></span></button>;
}

function InspectionDrawer({inspection,onClose}:{inspection:SafeInvestigationInspection;onClose:()=>void}){
  const panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{const previous=document.body.style.overflow;document.body.style.overflow="hidden";panel.current?.focus();return()=>{document.body.style.overflow=previous;};},[]);
  const keyDown=(event:React.KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();onClose();return;}if(event.key!=="Tab"||!panel.current)return;const nodes=Array.from(panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'));if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};
  return <div className="tk-inspection-layer" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><aside ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="inspection-title" onKeyDown={keyDown} className="tk-investigation-workspace tk-inspection-drawer">
    <header className="sticky top-0 z-10 border-b border-white/10 bg-[var(--tk-dark-surface-raised)] px-5 py-5 sm:px-6"><div className="flex items-start justify-between gap-4"><div><p className="tk-brand-eyebrow text-[10px] font-semibold uppercase tracking-[.18em]">{inspection.label}</p><h2 id="inspection-title" className="mt-2 text-xl font-semibold tracking-tight">{inspection.title}</h2><p className="mt-2 text-xs leading-5 text-slate-400">{inspection.context}</p></div><button type="button" onClick={onClose} aria-label="Close evidence inspection" className="rounded-lg border border-white/10 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4"/></button></div></header>
    <div className="space-y-6 px-5 py-6 sm:px-6">
      {inspection.cohortDefinitions?<section aria-label="Cohort definitions" className="grid gap-3 sm:grid-cols-2">{inspection.cohortDefinitions.map(cohort=><article key={cohort.label} className="rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-blue-300">{cohort.label}</p><p className="mt-2 text-lg font-semibold tabular-nums">{cohort.sample}</p><p className="mt-2 text-xs leading-5 text-slate-400">{cohort.definition}</p></article>)}</section>:null}
      {inspection.comparisonSummary?<section className="rounded-xl border border-emerald-400/20 bg-emerald-400/[.05] p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">{inspection.comparisonSummary.label}</p><p className="mt-2 text-sm leading-6 text-slate-200">{inspection.comparisonSummary.statement}</p></section>:null}
      {inspection.comparisons?<section aria-label="Cohort comparisons" className="space-y-3">{inspection.comparisons.map(comparison=><article key={comparison.metric} className="rounded-xl border border-white/10 bg-white/[.025] p-4"><div><h3 className="text-sm font-semibold">{comparison.metric}</h3>{comparison.definition?<p className="mt-1 text-[10px] text-slate-500">{comparison.definition}</p>:null}</div><dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"><ComparisonValue label="Affected" value={comparison.affected}/><ComparisonValue label="Control" value={comparison.control}/><ComparisonValue label="Difference" value={comparison.difference||"Not reliably measurable"} explanation={comparison.differenceExplanation}/></dl><p className="mt-4 border-t border-white/10 pt-3 text-xs leading-5 text-slate-300">{comparison.interpretation}</p>{comparison.limitation?<p className="mt-2 text-xs leading-5 text-amber-200">{comparison.limitation}</p>:null}</article>)}</section>:null}
      {inspection.rows.length?<section aria-label="Inspection metrics" className="grid gap-2">{inspection.rows.map((row,index)=><div key={`${row.label}-${index}`} className="rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">{row.label}</p><p className={`mt-2 text-sm leading-6 ${tone(row.tone)}`}>{row.value}</p></div>)}</section>:null}
      {inspection.notes.length?<section><h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Context and limitations</h3><ul className="mt-3 space-y-2 text-xs leading-5 text-slate-400">{inspection.notes.map((note,index)=><li key={`${index}-${note}`} className="rounded-lg border border-white/10 p-3">{note}</li>)}</ul></section>:null}
      <section><h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Safe provenance</h3><dl className="mt-3 space-y-3 text-xs"><div className="flex justify-between gap-4"><dt className="text-slate-500">Sources</dt><dd className="max-w-[70%] text-right text-slate-300">{inspection.sources.join(" · ")}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Algorithm</dt><dd className="text-right text-slate-300">{inspection.algorithmVersion}</dd></div></dl><p className="mt-3 text-[10px] leading-4 text-slate-500">Aggregate presentation only. Raw Evidence, customer identifiers, provider payloads, and storage references are excluded.</p></section>
      {inspection.relatedInvestigation?<section className="rounded-xl border border-blue-400/25 bg-blue-400/[.06] p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-blue-300">Deeper Investigation</p><h3 className="mt-2 text-sm font-semibold">{inspection.relatedInvestigation.title}</h3><p className="mt-2 text-xs text-slate-400">{inspection.relatedInvestigation.context} · {inspection.relatedInvestigation.status.replaceAll("_"," ")}</p><Link href={`/investigations/${inspection.relatedInvestigation.id}`} className="tk-brand-link mt-4 inline-flex items-center gap-2 text-xs font-semibold">Open Investigation <ArrowRight className="h-3.5 w-3.5"/></Link></section>:null}
    </div>
  </aside></div>;
}

function tone(value:SafeInvestigationInspection["rows"][number]["tone"]){return value==="success"?"text-emerald-200":value==="warning"?"text-amber-200":value==="danger"?"text-rose-200":value==="correlation"?"text-violet-200":value==="brand"?"text-blue-200":"text-slate-200";}
function ComparisonValue({label,value,explanation}:{label:string;value:string;explanation?:string}){return <div className="min-w-0 rounded-lg bg-black/20 px-3 py-3"><dt className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-slate-100">{value}</dd>{explanation?<p className="mt-1 text-[9px] leading-4 text-slate-500">{explanation}</p>:null}</div>;}
