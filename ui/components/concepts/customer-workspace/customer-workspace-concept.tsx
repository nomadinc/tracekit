"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Command,
  HelpCircle,
  Menu,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  SkipForward,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  detectIdentifierType,
  mockCustomers,
  searchMockData,
  type JourneyEvent,
  type MockCustomer,
  type SearchMatch,
  type TrackingHealth,
} from "@/lib/concepts/customer-workspace-mock";
import { EvidenceDrawer, type EvidenceSelection } from "./evidence-drawer";

const FILTERS = ["Recent", "New Today", "Needs Attention", "High Value", "Refunded"];

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function healthTone(health: TrackingHealth) {
  if (health === "Excellent") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (health === "Degraded") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function CustomerList({
  selectedId,
  onSelect,
  compact,
  onClose,
}: {
  selectedId: string;
  onSelect: (customer: MockCustomer) => void;
  compact?: boolean;
  onClose?: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("Recent");
  const customers = mockCustomers.filter((customer) => {
    const matchesQuery = [customer.name, customer.email, customer.eventLabel, customer.journeyPreview]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase());
    const matchesFilter = filter === "Recent" ? true : customer.tags.includes(filter);
    return matchesQuery && matchesFilter;
  });

  return (
    <aside className={`${compact ? "fixed inset-0 z-40 w-full" : "hidden w-[320px] shrink-0 border-r border-slate-200 lg:flex"} flex-col bg-white`}>
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-950">Customers</h1>
          <p className="text-[11px] text-slate-500">{mockCustomers.length} in this concept</p>
        </div>
        {compact ? (
          <button type="button" className="rounded-md border p-2 text-slate-500" onClick={onClose} aria-label="Close customer list">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="border-b border-slate-200 p-3">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-slate-400 focus-within:bg-white">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
            placeholder="Search customers"
            aria-label="Search customers"
          />
        </label>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium transition ${
                filter === item
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {customers.map((customer) => {
          const selected = customer.id === selectedId;
          return (
            <button
              type="button"
              key={customer.id}
              onClick={() => {
                onSelect(customer);
                onClose?.();
              }}
              className={`relative w-full border-b border-slate-100 px-4 py-3.5 text-left transition ${
                selected ? "bg-cyan-50/70" : "hover:bg-slate-50"
              }`}
            >
              {selected ? <span className="absolute inset-y-0 left-0 w-0.5 bg-cyan-500" /> : null}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{customer.name}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{customer.lastActivity}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-semibold text-slate-900">{money(customer.operationalProfit)}</div>
                  <div className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-400">Op. profit</div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${customer.trackingHealth === "Excellent" ? "bg-emerald-500" : customer.trackingHealth === "Degraded" ? "bg-amber-500" : "bg-rose-500"}`} />
                <span className="truncate text-[11px] font-medium text-slate-600">{customer.eventLabel}</span>
              </div>
              <div className="mt-1.5 truncate text-[10px] text-slate-400">{customer.journeyPreview}</div>
            </button>
          );
        })}
        {!customers.length ? (
          <div className="px-5 py-10 text-center text-xs text-slate-500">No customers match this view.</div>
        ) : null}
      </div>
    </aside>
  );
}

function SearchModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (match: SearchMatch) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const matches = searchMockData(query);
  const detected = detectIdentifierType(query);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-950/35 px-4 pt-[10vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Universal forensic search">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close search" />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((value) => Math.min(matches.length - 1, value + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((value) => Math.max(0, value - 1));
              }
              if (event.key === "Enter" && matches[activeIndex]) onSelect(matches[activeIndex]);
            }}
            className="h-16 min-w-0 flex-1 text-base text-slate-900 outline-none placeholder:text-slate-400"
            placeholder="Paste an email, order ID, click ID, session ID..."
            aria-label="Search any identifier"
          />
          <kbd className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-500">ESC</kbd>
        </div>
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-xs">
          <span className="text-slate-500">Detected type</span>
          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 font-medium text-cyan-800">{detected}</span>
        </div>
        <div className="max-h-[440px] overflow-y-auto p-2">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {query ? "Matching objects" : "Try a realistic identifier"}
          </div>
          {matches.map((match, index) => (
            <button
              type="button"
              key={match.id}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelect(match)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${
                index === activeIndex ? "bg-slate-100" : "hover:bg-slate-50"
              }`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
                {match.objectType === "Customer" ? <UserRound className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">{match.title}</span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">{match.subtitle}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-400">{match.identifierType}</span>
                <code className="mt-1 block max-w-40 truncate font-mono text-[10px] text-slate-600">{match.value}</code>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          ))}
          {!matches.length ? (
            <div className="px-5 py-12 text-center">
              <HelpCircle className="mx-auto h-6 w-6 text-slate-300" />
              <div className="mt-3 text-sm font-medium">No mock evidence found</div>
              <p className="mt-1 text-xs text-slate-500">Try `ef_21a7f0ce98`, `TK-10501`, or `IwAR2zE9f8jQ4N`.</p>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50 px-5 py-3 text-[10px] text-slate-500">
          <span>↑↓ Navigate</span>
          <span>↵ Open evidence</span>
          <span className="ml-auto">Mock forensic index</span>
        </div>
      </div>
    </div>
  );
}

function JourneyTimeline({
  events,
  activeEventId,
  highlightedEventId,
  onSelect,
}: {
  events: JourneyEvent[];
  activeEventId?: string;
  highlightedEventId?: string;
  onSelect: (event: JourneyEvent) => void;
}) {
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex min-w-max items-start px-1 pt-10">
        {events.map((event, index) => {
          const active = activeEventId === event.id;
          const highlighted = highlightedEventId === event.id;
          const poor = event.trackingHealth === "Poor";
          const degraded = event.trackingHealth === "Degraded";
          return (
            <React.Fragment key={event.id}>
              <div className="group relative w-[112px] shrink-0">
                <button
                  type="button"
                  data-event-id={event.id}
                  onClick={() => onSelect(event)}
                  className={`relative mx-auto flex h-11 w-11 items-center justify-center rounded-full border-2 bg-white transition focus:outline-none focus:ring-4 ${
                    active
                      ? "border-cyan-500 bg-cyan-50 text-cyan-800 ring-4 ring-cyan-100"
                      : highlighted
                        ? "border-violet-500 bg-violet-50 text-violet-700 ring-4 ring-violet-100"
                        : poor
                          ? "border-rose-300 text-rose-600 hover:border-rose-500"
                          : degraded
                            ? "border-amber-300 text-amber-600 hover:border-amber-500"
                            : "border-slate-300 text-slate-600 hover:border-slate-600"
                  }`}
                  aria-label={`Inspect ${event.name}`}
                >
                  {event.name === "Profit Updated" ? <Sparkles className="h-4 w-4" /> : index + 1}
                  {highlighted ? <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full border-2 border-white bg-violet-500" /> : null}
                </button>
                <div className="mt-2 text-center">
                  <div className="text-[11px] font-semibold text-slate-800">{event.shortName}</div>
                  <div className="mt-0.5 text-[9px] text-slate-400">{event.timestamp.replace("Today, ", "")}</div>
                </div>

                <div className="pointer-events-none absolute bottom-[calc(100%+0.75rem)] left-1/2 z-30 hidden w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-slate-950 p-3 text-left text-white shadow-xl group-hover:block group-focus-within:block">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold">{event.name}</span>
                    <span className={`h-2 w-2 rounded-full ${poor ? "bg-rose-400" : degraded ? "bg-amber-400" : "bg-emerald-400"}`} />
                  </div>
                  <dl className="mt-2 grid grid-cols-[5.25rem_1fr] gap-x-2 gap-y-1 text-[10px] leading-4">
                    <dt className="text-slate-400">Timestamp</dt><dd>{event.timestamp}</dd>
                    <dt className="text-slate-400">Domain</dt><dd className="truncate">{event.domain}</dd>
                    <dt className="text-slate-400">Attribution</dt><dd>{event.attributionRole}</dd>
                    <dt className="text-slate-400">Identifier</dt><dd className="truncate">{event.identifiers["Session ID"]}</dd>
                    <dt className="text-slate-400">Tracking</dt><dd>{event.trackingStatus}</dd>
                  </dl>
                  <div className="mt-2 border-t border-white/10 pt-2 text-[9px] text-slate-400">Click to inspect all evidence</div>
                </div>
              </div>
              {index < events.length - 1 ? (
                <div className="mt-5 h-px w-5 shrink-0 bg-slate-300">
                  <ArrowRight className="-mt-[7px] ml-1 h-3.5 w-3.5 text-slate-400" />
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</div>
      {detail ? <div className="mt-0.5 truncate text-[10px] text-slate-500">{detail}</div> : null}
    </div>
  );
}

export default function CustomerWorkspaceConcept() {
  const [selectedCustomerId, setSelectedCustomerId] = React.useState(mockCustomers[0].id);
  const [selection, setSelection] = React.useState<EvidenceSelection | null>(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [mobileListOpen, setMobileListOpen] = React.useState(false);
  const [replayOpen, setReplayOpen] = React.useState(false);
  const [replayPlaying, setReplayPlaying] = React.useState(false);
  const [replayIndex, setReplayIndex] = React.useState(0);
  const [highlightedEventId, setHighlightedEventId] = React.useState<string>();
  const customer = mockCustomers.find((item) => item.id === selectedCustomerId) || mockCustomers[0];
  const activeReplayEvent = customer.journey[replayIndex];

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    if (!replayPlaying) return;
    const timer = window.setInterval(() => {
      setReplayIndex((index) => {
        if (index >= customer.journey.length - 1) {
          setReplayPlaying(false);
          return index;
        }
        return index + 1;
      });
    }, 950);
    return () => window.clearInterval(timer);
  }, [replayPlaying, customer.journey.length]);

  React.useEffect(() => {
    if (!replayOpen || !activeReplayEvent) return;
    document.querySelector(`[data-event-id="${activeReplayEvent.id}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeReplayEvent, replayOpen]);

  function selectCustomer(next: MockCustomer) {
    setSelectedCustomerId(next.id);
    setSelection(null);
    setReplayIndex(0);
    setReplayPlaying(false);
    setReplayOpen(false);
    setHighlightedEventId(undefined);
  }

  function inspectEvent(event: JourneyEvent, focusedIdentifier?: string) {
    setSelection({ kind: "event", event, focusedIdentifier });
    setHighlightedEventId(event.id);
  }

  function selectSearchMatch(match: SearchMatch) {
    const nextCustomer = mockCustomers.find((item) => item.id === match.customerId);
    if (!nextCustomer) return;
    setSelectedCustomerId(nextCustomer.id);
    setSearchOpen(false);
    setReplayPlaying(false);
    setReplayOpen(false);
    window.setTimeout(() => {
      const matchedEvent = match.eventId
        ? nextCustomer.journey.find((item) => item.id === match.eventId)
        : undefined;
      if (matchedEvent) {
        setHighlightedEventId(matchedEvent.id);
        window.setTimeout(() => {
          document.querySelector(`[data-event-id="${matchedEvent.id}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "center" });
        }, 60);
      }
      if (match.orderId) {
        const order = nextCustomer.orders.find((item) => item.id === match.orderId);
        if (order) setSelection({ kind: "order", order, focusedIdentifier: match.value });
      } else if (matchedEvent) {
        setSelection({ kind: "event", event: matchedEvent, focusedIdentifier: match.value });
      } else {
        const firstEvent = nextCustomer.journey[0];
        setSelection({ kind: "event", event: firstEvent, focusedIdentifier: match.value });
        setHighlightedEventId(firstEvent.id);
      }
    }, 0);
  }

  return (
    <div className="flex h-dvh min-h-[680px] flex-col overflow-hidden bg-slate-100 text-slate-950">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-[11px] font-bold text-white">TK</span>
          <div className="hidden h-5 w-px bg-slate-200 sm:block" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">Customer Workspace</span>
              <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-violet-700">Concept</span>
            </div>
            <div className="hidden text-[10px] text-slate-400 sm:block">Local mock data · No production connection</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-500 shadow-sm transition hover:border-slate-400 hover:text-slate-800"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search any identifier</span>
            <span className="hidden items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] sm:flex">
              <Command className="h-2.5 w-2.5" />K
            </span>
          </button>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 lg:hidden"
            onClick={() => setMobileListOpen(true)}
            aria-label="Open customer list"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <CustomerList selectedId={customer.id} onSelect={selectCustomer} />
        {mobileListOpen ? <CustomerList selectedId={customer.id} onSelect={selectCustomer} compact onClose={() => setMobileListOpen(false)} /> : null}

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold tracking-tight">{customer.name}</h2>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                    customer.statusTone === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : customer.statusTone === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}>
                    {customer.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{customer.journeyPreview}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReplayOpen(true);
                    setReplayPlaying(true);
                    setReplayIndex(0);
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
                >
                  <Play className="h-3.5 w-3.5" />
                  Replay Journey
                </button>
                <button
                  type="button"
                  onClick={() => inspectEvent(customer.journey.find((item) => item.trackingHealth !== "Excellent") || customer.journey[0])}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold hover:border-slate-400"
                >
                  <Search className="h-3.5 w-3.5" />
                  Investigate
                </button>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-slate-100 pt-4 sm:grid-cols-4 2xl:grid-cols-7">
              <Metric label="Operational Profit" value={money(customer.operationalProfit)} detail="Lifetime observed" />
              <Metric label="Lifetime Revenue" value={money(customer.lifetimeRevenue)} />
              <Metric label="Customer Since" value={customer.customerSince} />
              <Metric label="First Touch" value={customer.firstTouch} />
              <Metric label="Last Purchase" value={customer.lastPurchase} />
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Tracking Health</div>
                <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${healthTone(customer.trackingHealth)}`}>
                  {customer.trackingHealth === "Excellent" ? <ShieldCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {customer.trackingHealth}
                </span>
              </div>
              <Metric label="Context" value="Customer" detail="Permanent" />
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-6">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
                <div>
                  <h3 className="text-sm font-semibold">Customer Journey</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">Every observed event remains attached to this customer.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500">
                    <span className={`h-1.5 w-1.5 rounded-full ${customer.trackingHealth === "Excellent" ? "bg-emerald-500" : customer.trackingHealth === "Degraded" ? "bg-amber-500" : "bg-rose-500"}`} />
                    {customer.journey.length} events observed
                  </span>
                  <button
                    type="button"
                    onClick={() => inspectEvent(customer.journey[0])}
                    className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold hover:bg-slate-50"
                  >
                    Explain first touch
                  </button>
                </div>
              </div>
              {replayOpen ? (
                <div className="flex flex-wrap items-center gap-3 border-b border-cyan-100 bg-cyan-50 px-4 py-3 sm:px-5">
                  <button
                    type="button"
                    onClick={() => setReplayPlaying((value) => !value)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-white"
                    aria-label={replayPlaying ? "Pause replay" : "Start replay"}
                  >
                    {replayPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplayPlaying(false);
                      setReplayIndex(0);
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-slate-600"
                    aria-label="Restart replay"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-wide text-cyan-800">
                      <span>Replay · Event {replayIndex + 1} of {customer.journey.length}</span>
                      <span className="truncate normal-case tracking-normal">{activeReplayEvent?.name}</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-cyan-100">
                      <div className="h-full rounded-full bg-cyan-600 transition-all" style={{ width: `${((replayIndex + 1) / customer.journey.length) * 100}%` }} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReplayPlaying(false);
                      setReplayIndex((index) => Math.min(customer.journey.length - 1, index + 1));
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-200 bg-white px-3 text-[10px] font-semibold"
                  >
                    Next <SkipForward className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => activeReplayEvent && inspectEvent(activeReplayEvent)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-200 bg-white px-3 text-[10px] font-semibold"
                  >
                    Inspect <Search className="h-3 w-3" />
                  </button>
                  <button type="button" onClick={() => { setReplayOpen(false); setReplayPlaying(false); }} className="text-cyan-800" aria-label="Close replay">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
              <div className="px-3 pb-1 sm:px-5">
                <JourneyTimeline
                  events={customer.journey}
                  activeEventId={replayOpen ? activeReplayEvent?.id : undefined}
                  highlightedEventId={highlightedEventId}
                  onSelect={inspectEvent}
                />
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5">
                <div>
                  <h3 className="text-sm font-semibold">Orders</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">Temporary inspection contexts within {customer.name}&apos;s permanent story.</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-600">{customer.orders.length} lifetime</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-2.5">Order</th>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5 text-right">Revenue</th>
                      <th className="px-4 py-2.5 text-right">Operational Profit</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Attribution</th>
                      <th className="w-10 px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customer.orders.map((order) => (
                      <tr
                        key={order.id}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => setSelection({ kind: "order", order })}
                      >
                        <td className="px-5 py-3 font-semibold text-slate-900">{order.number}</td>
                        <td className="px-4 py-3 text-slate-500">{order.date}</td>
                        <td className="px-4 py-3 text-right font-medium">{money(order.revenue)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">{money(order.operationalProfit)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-medium ${
                            order.status === "Paid" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
                          }`}>{order.status}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{order.attributionSource}</td>
                        <td className="px-3 py-3"><ChevronRight className="h-4 w-4 text-slate-400" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>

        {selection ? <EvidenceDrawer customer={customer} selection={selection} onClose={() => { setSelection(null); setHighlightedEventId(undefined); }} /> : null}
      </div>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={selectSearchMatch} />
    </div>
  );
}
