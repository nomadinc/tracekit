"use client";

import * as React from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleDollarSign,
  Command,
  FileSearch,
  Lightbulb,
  Menu,
  Package,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import OrderEvidenceDrawer from "./order-evidence-drawer";
import {
  detectOrderIdentifier,
  mockOrders,
  searchOrderMockData,
  type EvidenceItem,
  type MockOrder,
  type OrderSearchMatch,
  type OrderTrackingHealth,
  type TimelineEvent,
} from "@/lib/concepts/order-workspace-mock";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);
}

function healthTone(health: OrderTrackingHealth) {
  if (health === "Excellent") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (health === "Degraded") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-rose-300 bg-rose-50 text-rose-800";
}

function StatusMark({ kind }: { kind: "good" | "warning" | "negative" }) {
  if (kind === "good") return <Check className="h-3.5 w-3.5" />;
  return <AlertTriangle className="h-3.5 w-3.5" />;
}

function OrderList({ selected, onSelect, compact, onClose }: { selected: string; onSelect: (order: MockOrder) => void; compact?: boolean; onClose?: () => void }) {
  const [query, setQuery] = React.useState("");
  const filtered = mockOrders.filter((order) => [order.number, order.customer.name, order.scenario, order.status].join(" ").toLowerCase().includes(query.toLowerCase()));
  return (
    <aside className={`${compact ? "fixed inset-0 z-40 w-full" : "hidden w-[264px] shrink-0 border-r border-slate-200 lg:flex"} flex-col bg-white`}>
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
        <div><h1 className="text-lg font-semibold tracking-tight">Orders</h1><p className="text-[11px] text-slate-500">{mockOrders.length} investigation scenarios</p></div>
        {compact ? <button type="button" onClick={onClose} className="rounded-md border p-2" aria-label="Close Order list"><X className="h-4 w-4" /></button> : null}
      </div>
      <div className="border-b border-slate-200 p-3">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-slate-400 focus-within:bg-white">
          <Search className="h-3.5 w-3.5 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder="Search Orders" aria-label="Search Orders" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.map((order) => {
          const active = selected === order.id;
          const attention = order.status !== "Paid" || order.trackingHealth !== "Excellent" || order.profit < 20;
          return (
            <button type="button" key={order.id} onClick={() => { onSelect(order); onClose?.(); }} className={`relative w-full border-b border-slate-100 px-4 py-3.5 text-left ${active ? "bg-cyan-50/70" : "hover:bg-slate-50"}`}>
              {active ? <span className="absolute inset-y-0 left-0 w-0.5 bg-cyan-600" /> : null}
              <div className="flex items-start justify-between gap-3">
                <div><div className="text-sm font-semibold">{order.number}</div><div className="mt-0.5 text-[11px] text-slate-500">{order.customer.name}</div></div>
                <div className="text-right"><div className={`text-xs font-semibold ${order.profit < 0 ? "text-rose-700" : "text-slate-900"}`}>{money(order.profit)}</div><div className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-400">Profit</div></div>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-slate-600"><StatusMark kind={attention ? "warning" : "good"} />{order.scenario}</div>
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400"><span>{order.status}</span><span>{order.profitStatus}</span></div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function SearchModal({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (match: OrderSearchMatch) => void }) {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const matches = searchOrderMockData(query);
  React.useEffect(() => { if (open) { setQuery(""); setActive(0); window.setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-950/35 px-4 pt-[10vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Universal Search">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close Universal Search" />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5"><Search className="h-5 w-5 text-slate-400" /><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={(event) => { if (event.key === "Escape") onClose(); if (event.key === "ArrowDown") { event.preventDefault(); setActive((v) => Math.min(matches.length - 1, v + 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setActive((v) => Math.max(0, v - 1)); } if (event.key === "Enter" && matches[active]) onSelect(matches[active]); }} className="h-16 min-w-0 flex-1 outline-none" placeholder="Paste an Order ID, transaction ID, click ID..." aria-label="Search any Order identifier" /><kbd className="rounded border bg-slate-50 px-2 py-1 text-[10px] text-slate-500">ESC</kbd></div>
        <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-2.5 text-xs"><span className="text-slate-500">Detected type</span><span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 font-medium text-cyan-800">{detectOrderIdentifier(query)}</span></div>
        <div className="max-h-[430px] overflow-y-auto p-2">
          {matches.map((match, index) => <button type="button" key={match.id} onMouseEnter={() => setActive(index)} onClick={() => onSelect(match)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${active === index ? "bg-slate-100" : "hover:bg-slate-50"}`}><span className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white"><FileSearch className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{match.title}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{match.subtitle}</span></span><span className="text-right"><span className="block text-[10px] uppercase tracking-wide text-slate-400">{match.type}</span><code className="mt-1 block max-w-40 truncate text-[10px]">{match.value}</code></span><ChevronRight className="h-4 w-4 text-slate-400" /></button>)}
        </div>
        <div className="border-t bg-slate-50 px-5 py-3 text-[10px] text-slate-500">↑↓ Navigate · ↵ Open exact Order Evidence</div>
      </div>
    </div>
  );
}

function HeaderMetric({ label, value, title }: { label: string; value: string; title?: string }) {
  return <div className="min-w-0" title={title}><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</div><div className="mt-1 truncate text-xs font-semibold text-slate-900">{value}</div></div>;
}

function LedgerRow({
  label,
  amount,
  detail,
  onInspect,
  emphasis = false,
}: {
  label: string;
  amount: number;
  detail: string;
  onInspect: () => void;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onInspect}
      className={`group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 px-5 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-900 ${emphasis ? "py-5" : "py-3.5"}`}
    >
      <span className="min-w-0">
        <span className={`block font-semibold text-slate-950 ${emphasis ? "text-base" : "text-sm"}`}>{label}</span>
        <span className="mt-0.5 block truncate text-[11px] text-slate-500">{detail}</span>
      </span>
      <span className="text-right">
        <span className={`block tabular-nums font-semibold text-slate-950 ${emphasis ? "text-xl" : "text-sm"}`}>{amount > 0 && label !== "Revenue" ? "+" : ""}{money(amount)}</span>
        <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 underline decoration-dotted group-hover:text-slate-900">Inspect <ChevronRight className="h-3 w-3" /></span>
      </span>
    </button>
  );
}

function ProfitLedger({ order, onInspect }: { order: MockOrder; onInspect: (item: EvidenceItem) => void }) {
  const byLabel = new Map(order.breakdown.map((item) => [item.label, item]));
  const ledgerItem = (label: string) => byLabel.get(label);
  const inspect = (label: string) => {
    const item = ledgerItem(label);
    if (item) onInspect(order.evidence[item.evidenceId]);
  };
  const revenue = ledgerItem("Revenue")?.amount ?? order.revenue;
  const media = ledgerItem("Media Cost")?.amount ?? 0;
  const affiliate = ledgerItem("Affiliate Commission")?.amount ?? 0;
  const processor = ledgerItem("Processor Fees")?.amount ?? 0;
  const cogs = ledgerItem("COGS")?.amount ?? 0;
  const taxes = ledgerItem("Taxes")?.amount ?? 0;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-5">
        <div>
          <div className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4" /><h3 className="text-base font-semibold">Profit Breakdown</h3></div>
          <p className="mt-1 text-[11px] text-slate-500">An order-level P&amp;L from customer payment to remaining Profit.</p>
        </div>
        <button type="button" onClick={() => onInspect(order.evidence.profit)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold hover:bg-slate-50"><Sparkles className="h-3.5 w-3.5" />Explain Profit</button>
      </div>
      <div className="divide-y divide-slate-100">
        <LedgerRow label="Revenue" amount={revenue} detail="Total customer payment associated with this Order" onInspect={() => inspect("Revenue")} emphasis />
        <div className="bg-slate-50/70 px-5 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">What was sold</div>
          <div className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            <div className="flex justify-between gap-4"><span className="text-slate-500">Main product</span><span className="text-right font-medium text-slate-800">{order.commercial.mainProduct}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Order bump</span><span className="text-right font-medium text-slate-800">{order.commercial.orderBumps.join(", ") || "None"}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Upsells</span><span className="text-right font-medium text-slate-800">{order.commercial.upsells.join(", ") || "None"}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Discounts</span><span className="font-medium tabular-nums text-slate-800">−{money(order.commercial.discounts)}</span></div>
          </div>
        </div>
        <div className="px-5 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Costs</div>
        <LedgerRow label="Media cost" amount={media} detail="Allocated from Facebook · Scale Q3 · Prospecting" onInspect={() => inspect("Media Cost")} />
        <LedgerRow label="Affiliate commission" amount={affiliate} detail={`${order.affiliate} · matched conversion rule`} onInspect={() => inspect("Affiliate Commission")} />
        <LedgerRow label="Processor fees" amount={processor} detail="Observed fee for the matched payment" onInspect={() => inspect("Processor Fees")} />
        <LedgerRow label="COGS" amount={cogs} detail="Product costs for the purchased items and quantities" onInspect={() => inspect("COGS")} />
        <div className="bg-slate-50/70 px-5 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Shipping</div>
        <LedgerRow label="Shipping charged" amount={order.shipping.charged} detail="Amount paid by the customer for shipping" onInspect={() => onInspect(order.evidence.shipping)} />
        <LedgerRow label="Actual shipping cost" amount={-order.shipping.actual} detail="Observed carrier and fulfillment cost" onInspect={() => onInspect(order.evidence.shipping)} />
        <LedgerRow label="Packaging" amount={-order.shipping.packaging} detail="Packaging materials associated with fulfillment" onInspect={() => onInspect(order.evidence.shipping)} />
        <LedgerRow label="Net shipping" amount={order.shipping.margin} detail="Shipping charged less actual shipping and Packaging" onInspect={() => onInspect(order.evidence.shipping)} emphasis />
        <div className="px-5 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Tax treatment</div>
        <LedgerRow label="Taxes" amount={taxes} detail={`${money(order.commercial.taxCollected)} collected · inspect treatment and remittance status`} onInspect={() => inspect("Taxes")} />
        <div className="border-t-2 border-slate-900 bg-white">
          <LedgerRow label="Net Profit" amount={order.profit} detail={`${order.profitStatus} · after all currently available financial inputs`} onInspect={() => onInspect(order.evidence.profit)} emphasis />
          <div className="px-5 pb-5 text-right"><span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-semibold"><ShieldCheck className="h-3 w-3" />{order.profitStatus}</span></div>
        </div>
      </div>
    </section>
  );
}

function Timeline({ events, order, activeId, highlightedId, onInspect }: { events: TimelineEvent[]; order: MockOrder; activeId?: string; highlightedId?: string; onInspect: (event: TimelineEvent) => void }) {
  return <div className="overflow-x-auto pb-4"><div className="flex min-w-max items-start px-1 pt-10">{events.map((event, index) => {
    const active = activeId === event.id; const highlighted = highlightedId === event.id; const attention = event.state !== "complete";
    return <React.Fragment key={event.id}><div className="group relative w-[108px] shrink-0"><button type="button" data-order-event-id={event.id} onClick={() => onInspect(event)} className={`relative mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white text-xs font-bold focus:outline-none focus:ring-4 ${active ? "border-cyan-600 ring-cyan-100" : highlighted ? "border-violet-600 ring-violet-100" : attention ? "border-rose-400 text-rose-700" : "border-slate-400 text-slate-700"}`} aria-label={`Inspect ${event.label}`}>{attention ? <AlertTriangle className="h-4 w-4" /> : index + 1}{highlighted ? <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full border-2 border-white bg-violet-600" /> : null}</button><div className="mt-2 text-center"><div className="text-[10px] font-semibold">{event.label}</div><div className="mt-0.5 text-[9px] text-slate-400">{event.timestamp}</div></div><div className="pointer-events-none absolute bottom-[calc(100%+0.75rem)] left-1/2 z-30 hidden w-60 -translate-x-1/2 rounded-xl border bg-slate-950 p-3 text-white shadow-xl group-hover:block group-focus-within:block"><div className="flex items-center justify-between"><span className="text-xs font-semibold">{event.label}</span><span className="text-[9px] text-slate-400">{event.state}</span></div><div className="mt-2 text-[10px] leading-4 text-slate-300">{order.evidence[event.evidenceId]?.summary}</div><div className="mt-2 border-t border-white/10 pt-2 text-[9px] text-slate-400">Click for Evidence and Explain</div></div></div>{index < events.length - 1 ? <div className="mt-5 h-px w-5 bg-slate-300"><ChevronRight className="-mt-[7px] ml-1 h-3.5 w-3.5 text-slate-400" /></div> : null}</React.Fragment>;
  })}</div></div>;
}

export default function OrderWorkspaceConcept() {
  const [selectedId, setSelectedId] = React.useState(mockOrders[0].id);
  const [drawer, setDrawer] = React.useState<{ item: EvidenceItem; focusedIdentifier?: string } | null>(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [listOpen, setListOpen] = React.useState(false);
  const [replayOpen, setReplayOpen] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [replayIndex, setReplayIndex] = React.useState(0);
  const [highlighted, setHighlighted] = React.useState<string>();
  const order = mockOrders.find((item) => item.id === selectedId) || mockOrders[0];
  const activeEvent = order.timeline[replayIndex];

  React.useEffect(() => { function keydown(event: KeyboardEvent) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } if (event.key === "Escape") setSearchOpen(false); } window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown); }, []);
  React.useEffect(() => { if (!playing) return; const timer = window.setInterval(() => setReplayIndex((index) => { if (index >= order.timeline.length - 1) { setPlaying(false); return index; } return index + 1; }), 900); return () => window.clearInterval(timer); }, [playing, order.timeline.length]);

  function selectOrder(next: MockOrder) { setSelectedId(next.id); setDrawer(null); setReplayOpen(false); setPlaying(false); setReplayIndex(0); setHighlighted(undefined); }
  function inspect(item: EvidenceItem) { setDrawer({ item }); }
  function inspectTimeline(event: TimelineEvent) { setHighlighted(event.id); inspect(order.evidence[event.evidenceId]); }
  function selectSearch(match: OrderSearchMatch) { const next = mockOrders.find((item) => item.id === match.orderId); if (!next) return; setSelectedId(next.id); setSearchOpen(false); setReplayOpen(false); setPlaying(false); const event = next.timeline.find((item) => item.evidenceId === match.evidenceId); setHighlighted(event?.id); setDrawer({ item: next.evidence[match.evidenceId], focusedIdentifier: match.value }); window.setTimeout(() => document.querySelector(`[data-order-event-id="${event?.id}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "center" }), 50); }

  return <div className="flex h-dvh min-h-[720px] flex-col overflow-hidden bg-slate-100 text-slate-950">
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-[11px] font-bold text-white">TK</span><div className="hidden h-5 w-px bg-slate-200 sm:block" /><div><div className="flex items-center gap-2"><span className="text-sm font-semibold">Order Workspace</span><span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-violet-700">Concept</span></div><div className="hidden text-[10px] text-slate-400 sm:block">Order Profit Investigation · Local mock Evidence</div></div></div><div className="flex items-center gap-2"><button type="button" onClick={() => setSearchOpen(true)} className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs text-slate-500 hover:border-slate-400"><Search className="h-3.5 w-3.5" /><span className="hidden sm:inline">Search any identifier</span><span className="hidden items-center rounded border bg-slate-50 px-1.5 py-0.5 text-[9px] sm:flex"><Command className="h-2.5 w-2.5" />K</span></button><button type="button" onClick={() => setListOpen(true)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border lg:hidden" aria-label="Open Order list"><Menu className="h-4 w-4" /></button></div></header>
    <div className="flex min-h-0 flex-1">
      <OrderList selected={order.id} onSelect={selectOrder} />{listOpen ? <OrderList selected={order.id} onSelect={selectOrder} compact onClose={() => setListOpen(false)} /> : null}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="w-full">
        <section className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-semibold tracking-tight">{order.number}</h2><span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${order.status === "Paid" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-rose-300 bg-rose-50 text-rose-800"}`}><StatusMark kind={order.status === "Paid" ? "good" : "negative"} />{order.status}</span><span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-semibold"><ShieldCheck className="mr-1 inline h-3 w-3" />{order.profitStatus}</span></div><p className="mt-1 text-xs text-slate-500">{order.customer.name} · {order.date} · {order.scenario}</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => { setReplayOpen(true); setPlaying(true); setReplayIndex(0); }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3.5 text-xs font-semibold text-white"><Play className="h-3.5 w-3.5" />Replay Journey</button><button type="button" onClick={() => inspect(order.evidence.profit)} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-white px-3.5 text-xs font-semibold"><FileSearch className="h-3.5 w-3.5" />Explain</button></div></div>
          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-slate-100 pt-4 sm:grid-cols-4 2xl:grid-cols-6"><div><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">Profit</div><div className={`mt-1 text-xl font-bold ${order.profit < 0 ? "text-rose-700" : "text-slate-950"}`}>{money(order.profit)}</div><button type="button" onClick={() => inspect(order.evidence.profit)} className="mt-1 text-[10px] font-medium text-slate-500 underline decoration-dotted">{order.profitStatus} · Explain</button></div><HeaderMetric label="Revenue" value={money(order.revenue)} /><HeaderMetric label="Customer" value={order.customer.name} /><div><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">Tracking Health</div><button type="button" onClick={() => inspect(order.evidence.tracking)} className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${healthTone(order.trackingHealth)}`}>{order.trackingHealth === "Excellent" ? <ShieldCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{order.trackingHealth}</button></div><HeaderMetric label="Offer URL" value={order.offerUrl} title={order.offerUrl} /><HeaderMetric label="Click → Purchase" value={order.clickPurchaseDelta} /><HeaderMetric label="Affiliate" value={order.affiliate} /><HeaderMetric label="Traffic Source" value={order.trafficSource} /><HeaderMetric label="Campaign" value={order.campaign} /><HeaderMetric label="Creative" value={order.creative} /><HeaderMetric label="Landing Page" value={order.landingPage} /><HeaderMetric label="Context" value="Order · Permanent" /></div>
          {order.waitingOn.length ? <button type="button" onClick={() => inspect(order.evidence.profit)} className="mt-4 flex w-full items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs text-amber-950"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><strong>Estimated Profit.</strong> Waiting on: {order.waitingOn.join(", ")}. This amount may change slightly.</span></button> : null}
        </section>

        <div className="space-y-4 p-4 sm:p-6">
          <ProfitLedger order={order} onInspect={inspect} />

          <div className="grid gap-4 2xl:grid-cols-[1.2fr_.8fr]">
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b px-5 py-4"><div className="flex items-center gap-2"><Package className="h-4 w-4" /><h3 className="text-sm font-semibold">Commercial Summary</h3></div></div><div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4"><HeaderMetric label="Main Product" value={order.commercial.mainProduct} /><HeaderMetric label="Order Bump(s)" value={order.commercial.orderBumps.join(", ") || "None"} /><HeaderMetric label="Upsell(s)" value={order.commercial.upsells.join(", ") || "None"} /><HeaderMetric label="Quantity" value={String(order.commercial.quantity)} /><HeaderMetric label="Shipping Charged" value={money(order.commercial.shippingCharged)} /><HeaderMetric label="Tax Collected" value={money(order.commercial.taxCollected)} /><HeaderMetric label="Discounts" value={money(order.commercial.discounts)} /><HeaderMetric label="Status" value={order.status} /></div></section>
            <button type="button" onClick={() => inspect(order.evidence.shipping)} className="rounded-xl border border-slate-300 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Truck className="h-4 w-4" /><h3 className="text-sm font-semibold">Shipping</h3></div><span className="text-[10px] font-medium text-slate-500 underline decoration-dotted">Evidence · Explain</span></div><div className="mt-4 grid grid-cols-2 gap-3"><HeaderMetric label="Shipping Charged" value={money(order.shipping.charged)} /><HeaderMetric label="Actual Shipping" value={money(order.shipping.actual)} /><HeaderMetric label="Packaging" value={money(order.shipping.packaging)} /><div><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">Net Shipping Margin</div><div className={`mt-1 flex items-center gap-1 text-sm font-bold ${order.shipping.margin < 0 ? "text-rose-700" : "text-slate-900"}`}>{order.shipping.margin < 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}{money(order.shipping.margin)}</div></div></div></button>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b px-5 py-4"><div><h3 className="text-sm font-semibold">Attribution</h3><p className="mt-0.5 text-[11px] text-slate-500">Why this Order was attributed the way it was.</p></div><button type="button" onClick={() => inspect(order.evidence.attribution)} className="rounded-lg border px-3 py-1.5 text-[10px] font-semibold">Explain attribution</button></div><div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4">{[["Traffic Source", order.trafficSource], ["Affiliate", order.affiliate], ["Campaign", order.campaign], ["Creative", order.creative], ["Offer URL", order.offerUrl], ["Landing Page", order.landingPage], ["Click → Purchase Time", order.clickPurchaseDelta], ["Confidence", order.evidence.attribution.confidence]].map(([label, value]) => <button type="button" key={label} onClick={() => inspect(order.evidence.attribution)} className="p-4 text-left hover:bg-slate-50"><HeaderMetric label={label} value={value} /><span className="mt-2 block text-[9px] text-slate-400 underline decoration-dotted">Explain · Evidence</span></button>)}</div></section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><h3 className="text-sm font-semibold">Order Timeline</h3><p className="mt-0.5 text-[11px] text-slate-500">From first click through financial outcome.</p></div><span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500"><Check className="h-3 w-3" />{order.timeline.length} observed events</span></div>{replayOpen ? <div className="flex flex-wrap items-center gap-3 border-b border-cyan-200 bg-cyan-50 px-5 py-3"><button type="button" onClick={() => setPlaying((value) => !value)} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-white" aria-label={playing ? "Pause replay" : "Start replay"}>{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button><button type="button" onClick={() => { setPlaying(false); setReplayIndex(0); }} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300 bg-white" aria-label="Restart replay"><RotateCcw className="h-3.5 w-3.5" /></button><div className="min-w-0 flex-1"><div className="flex justify-between text-[10px] font-semibold text-cyan-900"><span>Event {replayIndex + 1} of {order.timeline.length}</span><span>{activeEvent?.label}</span></div><div className="mt-2 h-1 rounded-full bg-cyan-100"><div className="h-full rounded-full bg-cyan-700 transition-all" style={{ width: `${((replayIndex + 1) / order.timeline.length) * 100}%` }} /></div></div><button type="button" onClick={() => { setPlaying(false); setReplayIndex((index) => Math.min(order.timeline.length - 1, index + 1)); }} className="inline-flex h-8 items-center gap-1 rounded-lg border border-cyan-300 bg-white px-3 text-[10px] font-semibold">Next<SkipForward className="h-3 w-3" /></button><button type="button" onClick={() => activeEvent && inspectTimeline(activeEvent)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-cyan-300 bg-white px-3 text-[10px] font-semibold">Inspect<Search className="h-3 w-3" /></button><button type="button" onClick={() => { setReplayOpen(false); setPlaying(false); }}><X className="h-4 w-4" /></button></div> : null}<div className="px-4"><Timeline events={order.timeline} order={order} activeId={replayOpen ? activeEvent?.id : undefined} highlightedId={highlighted} onInspect={inspectTimeline} /></div></section>

          <section className="rounded-xl border border-slate-300 bg-white shadow-sm"><div className="flex items-center justify-between border-b px-5 py-4"><div><div className="flex items-center gap-2"><Lightbulb className="h-4 w-4" /><h3 className="text-sm font-semibold">TraceKit Intelligence</h3><span className="rounded border border-slate-300 px-2 py-0.5 text-[9px] font-semibold uppercase">Mock future capability</span></div><p className="mt-1 text-[11px] text-slate-500">Contextual business intelligence from observable Evidence. Not AI chat.</p></div></div><div className="grid gap-3 p-4 md:grid-cols-2">{order.intelligence.map((card) => <article key={card.id} className="rounded-lg border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{card.title}</div><p className="mt-1 text-sm font-semibold leading-5">{card.observation}</p></div><Sparkles className="h-4 w-4 shrink-0 text-slate-500" /></div><div className="mt-3 rounded-md bg-slate-50 p-3"><div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Recommendation</div><p className="mt-1 text-xs leading-5 text-slate-700">{card.recommendation}</p></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => inspect(order.evidence[card.evidenceId])} className="rounded-md border px-2.5 py-1.5 text-[10px] font-semibold">Explain</button><button type="button" onClick={() => inspect(order.evidence[card.evidenceId])} className="rounded-md border px-2.5 py-1.5 text-[10px] font-semibold">View Evidence</button></div></article>)}</div></section>
        </div>
        </div>
      </main>
      {drawer ? <OrderEvidenceDrawer order={order} item={drawer.item} focusedIdentifier={drawer.focusedIdentifier} onClose={() => setDrawer(null)} /> : null}
    </div>
    <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={selectSearch} />
  </div>;
}
