"use client";

import { CheckCircle2, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useIdentity } from "@/components/identity/identity-provider";
import { useShellDrawer } from "@/components/layout/shell-drawer";
import { withDevelopmentIdentity } from "@/lib/identity/development-state";
import type { OfferDrawerRecord } from "@/lib/offers/types";

export function OfferDrawerContent({ record }: { record: OfferDrawerRecord }) {
  const router = useRouter(); const drawer = useShellDrawer(); const { session } = useIdentity();
  function openRelated(type: OfferDrawerRecord["relatedObjects"][number]["type"], id: string) {
    const route = type === "Customer" ? `/customers?customer_id=${encodeURIComponent(id)}` : type === "Order" ? `/orders?order_id=${encodeURIComponent(id)}` : null;
    if (!route) return;
    drawer.closeDrawer(); router.push(withDevelopmentIdentity(route, session.identity.id));
  }
  return <div className="space-y-5"><section><div className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">Primary question</div><div className="mt-2 rounded-xl border bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"><div className="text-sm font-semibold">{record.question}</div><p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{record.summary}</p></div></section><section><div className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">Explain</div><dl className="mt-2 space-y-2">{record.facts.map(fact => <div key={fact.label} className="grid grid-cols-[130px_1fr] gap-3 border-b py-2 text-xs last:border-0 dark:border-white/10"><dt className="text-slate-500">{fact.label}</dt><dd className="font-medium">{fact.value}</dd></div>)}</dl></section><section><div className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">Evidence</div><ul className="mt-2 space-y-2">{record.evidence.map(item => <li key={item} className="flex items-start gap-2 rounded-lg border p-3 text-xs dark:border-white/10"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{item}<ExternalLink className="ml-auto h-3.5 w-3.5 text-slate-400" /></li>)}</ul></section><section><div className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">Related Objects</div><div className="mt-2 space-y-2">{record.relatedObjects.map(item => <button key={`${item.type}:${item.id}`} type="button" onClick={() => openRelated(item.type, item.id)} disabled={item.type !== "Customer" && item.type !== "Order"} className="flex w-full items-center justify-between rounded-lg border p-3 text-left text-xs disabled:cursor-default dark:border-white/10"><span><strong>{item.type}</strong><span className="ml-2 text-slate-500">{item.label}</span></span>{item.type === "Customer" || item.type === "Order" ? <ExternalLink className="h-3.5 w-3.5" /> : null}</button>)}</div></section></div>;
}
