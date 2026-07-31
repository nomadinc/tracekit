"use client";

import * as React from "react";
import {
  AlertTriangle,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Copy,
  ExternalLink,
  Link2,
  X,
} from "lucide-react";
import type { EvidenceItem, MockOrder } from "@/lib/concepts/order-workspace-mock";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);
}

function currencyMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(value);
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="border-b border-slate-200">
      <button type="button" className="flex w-full items-center justify-between px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 hover:bg-slate-50" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {title}<ChevronDown className={`h-4 w-4 transition ${open ? "" : "-rotate-90"}`} />
      </button>
      {open ? <div className="px-5 pb-5">{children}</div> : null}
    </section>
  );
}

function DefinitionList({ values }: { values: Array<[string, React.ReactNode]> }) {
  return <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-xs">{values.map(([label, value]) => <React.Fragment key={label}><dt className="text-slate-500">{label}</dt><dd className="min-w-0 break-words font-medium text-slate-800">{value}</dd></React.Fragment>)}</dl>;
}

function CopyableValue({ label, value, focused }: { label: string; value: string; focused?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }
  return <div className={`grid grid-cols-[7.5rem_minmax(0,1fr)_1.5rem] items-start gap-3 rounded-md px-2 py-1.5 text-xs ${focused ? "bg-cyan-50 ring-1 ring-cyan-300" : "hover:bg-slate-50"}`}><div className="text-slate-500">{label}</div><code className="break-all font-mono text-[11px] font-medium text-slate-800">{value}</code><button type="button" onClick={copy} className="text-slate-400 hover:text-slate-700" aria-label={`Copy ${label}`}>{copied ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}</button></div>;
}

function ExplainBlock({ item }: { item: EvidenceItem }) {
  return <div className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-4"><div className="text-sm font-semibold text-slate-900">{item.explain.conclusion}</div><div className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Reason</div><p className="mt-1 text-xs leading-5 text-slate-700">{item.explain.reason}</p>{item.explain.limitations ? <><div className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Limitation</div><p className="mt-1 text-xs leading-5 text-slate-700">{item.explain.limitations}</p></> : null}</div>;
}

function Relationships({ item }: { item: EvidenceItem }) {
  return <><div className="divide-y divide-slate-100 rounded-lg border border-slate-200">{item.relationships.map((relationship) => <button type="button" key={`${relationship.type}:${relationship.label}`} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-xs hover:bg-slate-50"><span className="w-28 shrink-0 text-slate-500">{relationship.type}</span><span className="min-w-0 flex-1 truncate font-medium text-slate-800">{relationship.label}</span><ChevronRight className="h-3.5 w-3.5 text-slate-400" /></button>)}</div><p className="mt-2 text-[10px] text-slate-500">Concept relationships remain inside the selected Order context.</p></>;
}

function EvidenceList({ item }: { item: EvidenceItem }) {
  return <ul className="space-y-2">{item.evidence.map((evidence) => <li key={evidence} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-xs text-slate-700"><CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" /><span className="min-w-0 flex-1">{evidence}</span><ExternalLink className="h-3 w-3 shrink-0 text-slate-400" /></li>)}</ul>;
}

function financialTitle(item: EvidenceItem) {
  const titles: Record<string, string> = { shipping: "Shipping Analysis", media: "Media Cost Analysis", affiliate: "Affiliate Commission Analysis", processor: "Processor Fee Analysis", cogs: "COGS Analysis", taxes: "Tax Analysis", profit: "Profit Explanation", revenue: "Revenue Analysis" };
  return titles[item.id] || `${item.title} Analysis`;
}

function financialDetails(order: MockOrder, item: EvidenceItem): Array<[string, React.ReactNode]> {
  const impact = item.amount === undefined ? "Included in Profit" : `${item.amount >= 0 ? "+" : "−"}${money(Math.abs(item.amount))}`;
  if (item.id === "shipping") return [["Amount", money(order.shipping.margin)], ["Business meaning", "The Order's shipping contribution after carrier and Packaging costs"], ["Calculation", `${money(order.shipping.charged)} − ${money(order.shipping.actual)} − ${money(order.shipping.packaging)} = ${money(order.shipping.margin)}`], ["Source", "Matched shipment, carrier label, and fulfillment records"], ["Status", item.status], ["Profit impact", impact]];
  if (item.id === "media") return [["Amount", money(item.amount || 0)], ["Business meaning", "Advertising cost allocated to the click that produced this Order"], ["Calculation", "Attributed click share × observed Campaign spend"], ["Source", `${order.trafficSource} · ${order.campaign}`], ["Status", item.status], ["Profit impact", impact]];
  if (item.id === "affiliate") return [["Amount", money(item.amount || 0)], ["Business meaning", "Commission earned by the attributed Affiliate conversion"], ["Calculation", "Matched conversion × approved commission rule"], ["Source", `${order.affiliate} · Everflow conversion record`], ["Status", item.status], ["Profit impact", impact]];
  if (item.id === "processor") return [["Amount", money(-order.processorFee.observedFee)], ["Business meaning", "Imported payment-processing cost compared with the configured pricing rule"], ["Calculation", `${order.processorFee.captures.length} capture${order.processorFee.captures.length === 1 ? "" : "s"} × percentage and fixed transaction fee`], ["Source", `${order.processorFee.processorName} capture and fee records`], ["Status", order.processorFee.settlementStatus], ["Profit impact", `−${money(order.processorFee.observedFee)}`]];
  if (item.id === "cogs") return [["Amount", money(item.amount || 0)], ["Business meaning", "Cost of the Products included in this Order"], ["Calculation", `${order.commercial.quantity} purchased units × effective Product costs`], ["Source", "Configured Product cost records effective on Order date"], ["Status", item.status], ["Profit impact", impact]];
  if (item.id === "taxes") return [["Amount", money(item.amount || 0)], ["Business meaning", "Tax treatment applied to the Order's financial outcome"], ["Calculation", `${money(order.commercial.taxCollected)} collected · ${money(Math.abs(item.amount || 0))} included in Profit treatment`], ["Source", "Order tax record"], ["Status", "Remittance treatment observed"], ["Profit impact", impact]];
  if (item.id === "profit") return [["Amount", money(order.profit)], ["Business meaning", "What remains after all currently available Order revenue and costs"], ["Calculation", "Revenue + credits − costs − fees − commissions − tax treatment"], ["Source", "Matched commerce, payment, shipping, attribution, and cost Evidence"], ["Status", order.profitStatus], ["Profit impact", "Final Order outcome"]];
  return [["Amount", money(item.amount || 0)], ["Business meaning", item.summary], ["Calculation", "Observed Order amount supported by matched source Evidence"], ["Source", "Matched Order and payment records"], ["Status", item.status], ["Profit impact", impact]];
}

function ProcessorFeeDetail({ order }: { order: MockOrder }) {
  const fee = order.processorFee;
  const variance = fee.observedFee - fee.expectedFee;
  const varianceLabel = variance === 0
    ? `${currencyMoney(0, fee.currency)} · matches expected`
    : `${variance > 0 ? "+" : "−"}${currencyMoney(Math.abs(variance), fee.currency)} · observed ${variance > 0 ? "above" : "below"} expected`;
  return <Section title="Fee Calculation">
    <DefinitionList values={[
      ["Processor", fee.processorName],
      ["Pricing rule", `${fee.percentageRate.toFixed(2)}% + ${currencyMoney(fee.fixedFee, fee.currency)} per transaction`],
      ["Percentage", `${fee.percentageRate.toFixed(2)}%`],
      ["Fixed fee", `${currencyMoney(fee.fixedFee, fee.currency)} per capture`],
      ["Captured amount", currencyMoney(fee.captures.reduce((sum, capture) => sum + capture.amount, 0), fee.currency)],
      ["Captures", String(fee.captures.length)],
    ]} />
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
      {fee.captures.map((capture, index) => {
        const expected = (capture.amount * fee.percentageRate / 100) + fee.fixedFee;
        return <div key={capture.id} className="border-b border-slate-100 px-3 py-3 last:border-b-0">
          <div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-slate-900">Capture {index + 1}</span><span className="font-mono text-[10px] text-slate-500">{capture.id}</span></div>
          <div className="mt-1 text-xs text-slate-700">{currencyMoney(capture.amount, fee.currency)} × {fee.percentageRate.toFixed(2)}% + {currencyMoney(fee.fixedFee, fee.currency)}</div>
          <div className="mt-1 text-[11px] font-medium text-slate-500">Expected for capture: {currencyMoney(expected, fee.currency)}</div>
        </div>;
      })}
    </div>
    <div className="mt-4 rounded-lg border-2 border-slate-300 bg-slate-50 p-3">
      <DefinitionList values={[
        ["Expected fee", currencyMoney(fee.expectedFee, fee.currency)],
        ["Observed fee", currencyMoney(fee.observedFee, fee.currency)],
        ["Variance", <span key="variance" className="font-bold">{varianceLabel}</span>],
        ["Settlement", fee.settlementStatus],
        ["Profit impact", `−${currencyMoney(fee.observedFee, fee.currency)}`],
      ]} />
    </div>
  </Section>;
}

function FinancialAnalysis({ order, item, focusedIdentifier }: { order: MockOrder; item: EvidenceItem; focusedIdentifier?: string }) {
  return <>
    <Section title="Business Analysis"><DefinitionList values={financialDetails(order, item)} /><div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700"><div className="mb-1 flex items-center gap-2 font-semibold text-slate-900"><Calculator className="h-3.5 w-3.5" />Why is this amount what it is?</div>{item.summary}</div></Section>
    {item.id === "shipping" ? <Section title="Shipping Detail"><DefinitionList values={[["Charged", money(order.shipping.charged)], ["Carrier cost", money(order.shipping.actual)], ["Packaging", money(order.shipping.packaging)], ["Fulfillment center", "Austin FC · 02"], ["Carrier", "UPS"], ["Service", "Ground"], ["Zone", "4"], ["Net margin", money(order.shipping.margin)], ["Import status", item.status]]} /></Section> : null}
    {item.id === "media" ? <Section title="Allocation Detail"><DefinitionList values={[["Platform", order.trafficSource], ["Campaign", order.campaign], ["Ad set", "Prospecting · 40+"], ["Creative", order.creative], ["Method", "Attributed click allocation"], ["Click → Purchase", order.clickPurchaseDelta]]} /></Section> : null}
    {item.id === "affiliate" ? <Section title="Commission Detail"><DefinitionList values={[["Affiliate", order.affiliate], ["Rule", "Matched conversion commission"], ["Conversion", "Approved"], ["Payout", "Pending payout cycle"], ["Event type", "Purchase conversion"]]} /></Section> : null}
    {item.id === "processor" ? <ProcessorFeeDetail order={order} /> : null}
    {item.id === "cogs" ? <Section title="Product Cost Detail"><DefinitionList values={[["Total COGS", money(Math.abs(item.amount || 0))], ["Main product", order.commercial.mainProduct], ["Order bump", order.commercial.orderBumps.join(", ") || "None"], ["Upsells", order.commercial.upsells.join(", ") || "None"], ["Cost source", "Configured Product costs"], ["Effective date", order.date.split(" · ")[0]]]} /></Section> : null}
    {item.id === "taxes" ? <Section title="Tax Detail"><DefinitionList values={[["Tax collected", money(order.commercial.taxCollected)], ["Treatment", "Included in Order Profit treatment"], ["Jurisdiction", "Order destination jurisdiction"], ["Rate", "Observed on source Order"], ["Remittance", "Treatment observed"], ["Tax source", "Order tax record"]]} /></Section> : null}
    <Section title="Explain"><ExplainBlock item={item} /></Section>
    <Section title="Supporting Evidence"><EvidenceList item={item} /></Section>
    <Section title="Related Objects" defaultOpen={false}><Relationships item={item} /></Section>
    <Section title="Raw Source Evidence" defaultOpen={false}><p className="mb-3 text-xs leading-5 text-slate-600">Source values remain available after the business explanation.</p><div className="space-y-0.5">{Object.entries(item.identifiers).map(([key, value]) => <CopyableValue key={key} label={key} value={value} focused={value === focusedIdentifier} />)}</div></Section>
  </>;
}

function JourneyEvidence({ item, focusedIdentifier }: { item: EvidenceItem; focusedIdentifier?: string }) {
  return <>
    <Section title="What Happened"><DefinitionList values={[["Event", item.title], ["Type", item.kind], ["Timestamp", item.timestamp], ["Status", item.status], ["Confidence", item.confidence]]} /><p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">{item.summary}</p></Section>
    {item.rawUrl ? <Section title="URL Evidence"><div className="space-y-3 text-xs">{[["Original URL", item.rawUrl], ["Referrer", item.referrer || "Not observed"], ["Destination", item.destination || "Not observed"]].map(([label, value]) => <div key={label}><div className="mb-1 text-slate-500">{label}</div><code className="block break-all rounded-md bg-slate-950 px-3 py-2 font-mono text-[11px] leading-5 text-slate-100">{value}</code></div>)}</div></Section> : null}
    <Section title="Query Parameters"><div className="space-y-0.5">{Object.entries(item.queryParameters).map(([key, value]) => <CopyableValue key={key} label={key} value={value} focused={value === focusedIdentifier} />)}</div></Section>
    <Section title="Identifiers"><div className="space-y-0.5">{Object.entries(item.identifiers).map(([key, value]) => <CopyableValue key={key} label={key} value={value} focused={value === focusedIdentifier} />)}</div></Section>
    <Section title="Redirect Path"><div className="space-y-3">{item.redirectPath.map((hop, index) => <div key={`${hop.url}:${index}`} className="relative rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">{hop.status}</span><span className="text-[11px] text-slate-500">{hop.elapsedMs} ms</span></div><code className="mt-2 block break-all font-mono text-[10px] leading-4 text-slate-700">{hop.url}</code><div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-600"><Link2 className="h-3 w-3" />{hop.transition}</div><div className="mt-2 grid grid-cols-2 gap-2 text-[10px]"><div><span className="text-slate-400">Added</span><div className="mt-1 font-medium text-slate-700">{hop.added.join(", ") || "None"}</div></div><div><span className="text-slate-400">Removed</span><div className="mt-1 font-medium text-slate-700">{hop.removed.join(", ") || "None"}</div></div></div>{index < item.redirectPath.length - 1 ? <ChevronDown className="absolute -bottom-3.5 left-1/2 z-10 h-4 w-4 -translate-x-1/2 rounded-full border bg-white text-slate-400" /> : null}</div>)}</div></Section>
    <Section title="Tracking Diagnostics"><div className="space-y-2">{item.diagnostics.map((diagnostic) => <div key={diagnostic.label} className="flex items-start gap-2 text-xs leading-5 text-slate-700">{diagnostic.state === "observed" ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" /> : diagnostic.state === "warning" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" /> : <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-700" />}<span><span className="sr-only">{diagnostic.state}: </span>{diagnostic.label}</span></div>)}</div></Section>
    <Section title="Relationships"><Relationships item={item} /></Section>
    <Section title="Explain"><ExplainBlock item={item} /></Section>
    <Section title="Raw Evidence"><EvidenceList item={item} /></Section>
  </>;
}

export default function OrderEvidenceDrawer({ order, item, focusedIdentifier, onClose }: { order: MockOrder; item: EvidenceItem; focusedIdentifier?: string; onClose: () => void }) {
  const financial = item.kind === "Financial" || item.kind === "Shipping";
  const title = financial ? financialTitle(item) : item.kind === "Intelligence" ? "Evidence Review" : "Journey / Attribution Evidence";
  return <aside className="fixed inset-0 z-50 flex flex-col bg-white shadow-2xl xl:static xl:z-auto xl:h-full xl:w-[400px] xl:shrink-0 xl:border-l xl:border-slate-200 xl:shadow-none" aria-label={`${title} drawer`}>
    <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5"><div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded bg-slate-950 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">{financial ? "Financial" : "Evidence"}</span><span className="truncate text-sm font-semibold text-slate-950">{title}</span></div><div className="mt-1 truncate text-[11px] text-slate-500">{order.number} remains selected · {item.title}</div></div><button type="button" className="ml-3 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900" onClick={onClose} aria-label="Close evidence drawer"><X className="h-4 w-4" /></button></div>
    <div className="min-h-0 flex-1 overflow-y-auto">{financial ? <FinancialAnalysis order={order} item={item} focusedIdentifier={focusedIdentifier} /> : item.kind === "Intelligence" ? <><Section title="Evidence Review"><DefinitionList values={[["Observation", item.title], ["Status", item.status], ["Confidence", item.confidence]]} /><p className="mt-3 text-xs leading-5 text-slate-700">{item.summary}</p></Section><Section title="Explain"><ExplainBlock item={item} /></Section><Section title="Evidence"><EvidenceList item={item} /></Section><Section title="Relationships"><Relationships item={item} /></Section></> : <JourneyEvidence item={item} focusedIdentifier={focusedIdentifier} />}</div>
  </aside>;
}
