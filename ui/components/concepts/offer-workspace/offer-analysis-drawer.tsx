"use client";

import * as React from "react";
import { Check, ChevronDown, CircleDot, Copy, ExternalLink, X } from "lucide-react";
import type { OfferContext } from "@/lib/concepts/offer-workspace-mock";

export type OfferInspection = { mode: "traffic" | "driver" | "timeline" | "metric" | "related" | "intelligence" | "comparison"; title: string; question: string; summary: string; facts: Array<[string, string]>; evidence: string[]; focusedValue?: string };

function Section({ title, children, openByDefault = true }: { title: string; children: React.ReactNode; openByDefault?: boolean }) { const [open, setOpen] = React.useState(openByDefault); return <section className="border-b border-slate-200"><button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="flex w-full items-center justify-between px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500 hover:bg-slate-50">{title}<ChevronDown className={`h-4 w-4 ${open ? "" : "-rotate-90"}`} /></button>{open ? <div className="px-5 pb-5">{children}</div> : null}</section>; }

export default function OfferAnalysisDrawer({ offer, inspection, onClose }: { offer: OfferContext; inspection: OfferInspection; onClose: () => void }) {
  const modeLabel = inspection.mode === "traffic" ? "Traffic Source" : inspection.mode === "driver" ? "Profit Driver" : inspection.mode === "timeline" ? "Significant Event" : inspection.mode === "comparison" ? "Compare Evidence" : inspection.mode === "intelligence" ? "TraceKit Intelligence" : "Analysis";
  return <aside className="fixed inset-0 z-50 flex flex-col bg-white shadow-2xl xl:static xl:z-auto xl:h-full xl:w-[420px] xl:shrink-0 xl:border-l xl:border-slate-200 xl:shadow-none" aria-label={`${modeLabel} Drawer`}>
    <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5"><div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded bg-slate-950 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">{modeLabel}</span><span className="truncate text-sm font-semibold">{inspection.title}</span></div><div className="mt-1 truncate text-[11px] text-slate-500">{offer.name} remains selected</div></div><button type="button" onClick={onClose} className="ml-3 inline-flex h-8 w-8 items-center justify-center rounded-md border text-slate-500" aria-label="Close Drawer"><X className="h-4 w-4" /></button></div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Section title="Business Question"><div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="text-sm font-semibold">{inspection.question}</div><p className="mt-2 text-xs leading-5 text-slate-700">{inspection.summary}</p></div></Section>
      <Section title="What TraceKit Observed"><dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2.5 text-xs">{inspection.facts.map(([label, value]) => <React.Fragment key={label}><dt className="text-slate-500">{label}</dt><dd className={`break-words font-medium ${value === inspection.focusedValue ? "rounded bg-cyan-50 px-1 ring-1 ring-cyan-300" : "text-slate-800"}`}>{value}</dd></React.Fragment>)}</dl></Section>
      <Section title="Explain"><div className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-4"><div className="text-sm font-semibold">{inspection.summary}</div><p className="mt-2 text-xs leading-5 text-slate-700">This conclusion uses the selected Offer’s observed performance, Relationships, and qualified Evidence. Inspect the supporting records below before acting.</p></div></Section>
      <Section title="Related Objects"><div className="grid gap-2">{["Offer", "Campaign", "Customer", "Order", "Financial Event"].map(x => <button key={x} type="button" className="flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs"><span>{x}</span><span className="text-slate-400">Related · mock</span></button>)}</div></Section>
      <Section title="Supporting Evidence"><ul className="space-y-2">{inspection.evidence.map(x => <li key={x} className="flex items-start gap-2 rounded-lg border p-3 text-xs"><CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="flex-1">{x}</span><ExternalLink className="h-3.5 w-3.5 text-slate-400" /></li>)}</ul></Section>
      <Section title="Raw Evidence" openByDefault={false}><p className="mb-3 text-xs text-slate-600">Mock source values remain available after the business explanation.</p>{inspection.facts.map(([label, value]) => <div key={label} className="flex items-start gap-2 border-b py-2 text-xs"><code className="min-w-0 flex-1 break-all">{label}: {value}</code><button type="button" aria-label={`Copy ${label}`}><Copy className="h-3.5 w-3.5 text-slate-400" /></button></div>)}</Section>
    </div>
  </aside>;
}
