"use client";

import * as React from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Copy,
  ExternalLink,
  Link2,
  X,
} from "lucide-react";
import type {
  CustomerOrder,
  JourneyEvent,
  MockCustomer,
  TrackingHealth,
} from "@/lib/concepts/customer-workspace-mock";

export type EvidenceSelection =
  | { kind: "event"; event: JourneyEvent; focusedIdentifier?: string }
  | { kind: "order"; order: CustomerOrder; focusedIdentifier?: string };

function healthClasses(health: TrackingHealth) {
  if (health === "Excellent") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (health === "Degraded") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="border-b border-slate-200">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 hover:bg-slate-50"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {title}
        <ChevronDown className={`h-4 w-4 transition ${open ? "" : "-rotate-90"}`} />
      </button>
      {open ? <div className="px-5 pb-5">{children}</div> : null}
    </section>
  );
}

function DefinitionList({ values }: { values: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-xs">
      {values.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-slate-500">{label}</dt>
          <dd className="min-w-0 break-words font-medium text-slate-800">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function CopyableValue({
  label,
  value,
  focused,
}: {
  label: string;
  value: string;
  focused?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div
      className={`grid grid-cols-[7.5rem_minmax(0,1fr)_1.5rem] items-start gap-3 rounded-md px-2 py-1.5 text-xs ${
        focused ? "bg-cyan-50 ring-1 ring-cyan-300" : "hover:bg-slate-50"
      }`}
    >
      <div className="text-slate-500">{label}</div>
      <code className="break-all font-mono text-[11px] font-medium text-slate-800">{value}</code>
      <button type="button" onClick={copy} className="text-slate-400 hover:text-slate-700" aria-label={`Copy ${label}`}>
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function EventEvidence({
  event,
  focusedIdentifier,
}: {
  event: JourneyEvent;
  focusedIdentifier?: string;
}) {
  return (
    <>
      <Section title="Summary">
        <DefinitionList
          values={[
            ["Event type", event.name],
            ["Timestamp", event.timestamp],
            ["Status", event.status],
            ["Confidence", event.confidence],
            ["Attribution role", event.attributionRole],
          ]}
        />
      </Section>

      <Section title="URL">
        <div className="space-y-3 text-xs">
          {[
            ["Full original URL", event.originalUrl],
            ["Referrer", event.referrer],
            ["Destination URL", event.destinationUrl],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="mb-1 text-slate-500">{label}</div>
              <code className="block break-all rounded-md bg-slate-950 px-3 py-2 font-mono text-[11px] leading-5 text-slate-100">
                {value}
              </code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Query Parameters">
        <div className="space-y-0.5">
          {Object.entries(event.queryParameters).map(([key, value]) => (
            <CopyableValue key={key} label={key} value={value} focused={focusedIdentifier === value} />
          ))}
        </div>
      </Section>

      <Section title="Identifiers">
        <div className="space-y-0.5">
          {Object.entries(event.identifiers).map(([key, value]) => (
            <CopyableValue key={key} label={key} value={value} focused={focusedIdentifier === value} />
          ))}
        </div>
      </Section>

      <Section title="Redirect Path">
        <div className="space-y-3">
          {event.redirectPath.map((hop, index) => (
            <div key={`${hop.url}:${index}`} className="relative rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">{hop.statusCode}</span>
                <span className="text-[11px] text-slate-500">{hop.elapsedMs} ms</span>
              </div>
              <code className="mt-2 block break-all font-mono text-[10px] leading-4 text-slate-700">{hop.url}</code>
              <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-600">
                <Link2 className="h-3 w-3" />
                {hop.transition}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-slate-400">Added</span>
                  <div className="mt-1 text-emerald-700">{hop.parametersAdded.join(", ") || "None"}</div>
                </div>
                <div>
                  <span className="text-slate-400">Removed</span>
                  <div className="mt-1 text-rose-700">{hop.parametersRemoved.join(", ") || "None"}</div>
                </div>
              </div>
              {index < event.redirectPath.length - 1 ? (
                <ChevronDown className="absolute -bottom-3.5 left-1/2 z-10 h-4 w-4 -translate-x-1/2 rounded-full border bg-white text-slate-400" />
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tracking Diagnostics">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600">Tracking Health</span>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${healthClasses(event.trackingHealth)}`}>
            {event.trackingHealth}
          </span>
        </div>
        <div className="space-y-2">
          {event.diagnostics.map((diagnostic) => (
            <div key={diagnostic.label} className="flex items-start gap-2 text-xs leading-5 text-slate-700">
              {diagnostic.state === "positive" ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : diagnostic.state === "warning" ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              ) : (
                <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
              )}
              {diagnostic.label}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Relationships">
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {event.relationships.map((relationship) => (
            <button
              type="button"
              key={`${relationship.type}:${relationship.label}`}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-xs hover:bg-slate-50"
            >
              <span className="w-28 shrink-0 text-slate-500">{relationship.type}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{relationship.label}</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
          ))}
        </div>
      </Section>

      <Section title="Explain">
        <div className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-4">
          <div className="font-semibold text-slate-900">{event.explanation.title}</div>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</div>
          <p className="mt-1 text-xs leading-5 text-slate-700">{event.explanation.reason}</p>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</div>
          <ul className="mt-1.5 space-y-1 text-xs text-slate-700">
            {event.explanation.evidence.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-cyan-700" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </>
  );
}

function OrderEvidence({
  order,
  customer,
  focusedIdentifier,
}: {
  order: CustomerOrder;
  customer: MockCustomer;
  focusedIdentifier?: string;
}) {
  const health = order.status === "Refunded" ? "Degraded" : customer.trackingHealth;
  return (
    <>
      <Section title="Summary">
        <DefinitionList
          values={[
            ["Order", order.number],
            ["Customer", customer.name],
            ["Date", order.date],
            ["Status", order.status],
            ["Attribution", order.attributionSource],
          ]}
        />
      </Section>
      <Section title="Financial Story">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Revenue</div>
            <div className="mt-1 text-lg font-semibold">${order.revenue.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Operational Profit</div>
            <div className="mt-1 text-lg font-semibold">${order.operationalProfit.toLocaleString()}</div>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-600">{order.summary}</p>
      </Section>
      <Section title="Identifiers">
        <CopyableValue label="Order ID" value={order.number} focused={focusedIdentifier === order.number} />
        <CopyableValue label="Payment ID" value={order.paymentId} focused={focusedIdentifier === order.paymentId} />
        <CopyableValue label="Customer ID" value={customer.id} focused={focusedIdentifier === customer.id} />
      </Section>
      <Section title="Tracking Health">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-600">Evidence linked to customer journey</span>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${healthClasses(health)}`}>{health}</span>
        </div>
      </Section>
      <Section title="Relationships">
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {[
            ["Customer", customer.name],
            ["Journey", "Open linked customer journey"],
            ["Payment", order.paymentId],
            ["Profit calculation", `Operational Profit · $${order.operationalProfit}`],
          ].map(([type, label]) => (
            <button type="button" key={type} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-xs hover:bg-slate-50">
              <span className="w-28 text-slate-500">{type}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
              <ExternalLink className="h-3 w-3 text-slate-400" />
            </button>
          ))}
        </div>
      </Section>
      <Section title="Explain">
        <p className="text-xs leading-5 text-slate-700">
          This order remains inside {customer.name}&apos;s permanent customer context. Revenue and Operational Profit reflect currently observed commerce and cost evidence; they are not presented as Reconciled Profit.
        </p>
      </Section>
    </>
  );
}

export function EvidenceDrawer({
  customer,
  selection,
  onClose,
}: {
  customer: MockCustomer;
  selection: EvidenceSelection;
  onClose: () => void;
}) {
  const title = selection.kind === "event" ? selection.event.name : `Order ${selection.order.number}`;
  const subtitle = selection.kind === "event" ? selection.event.timestamp : selection.order.date;

  return (
    <aside
      className="fixed inset-0 z-50 flex flex-col bg-white shadow-2xl xl:static xl:z-auto xl:h-full xl:w-[420px] xl:shrink-0 xl:border-l xl:border-slate-200 xl:shadow-none"
      aria-label="Forensic evidence drawer"
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-950 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">Evidence</span>
            <span className="truncate text-sm font-semibold text-slate-950">{title}</span>
          </div>
          <div className="mt-1 truncate text-[11px] text-slate-500">{subtitle} · {customer.name}</div>
        </div>
        <button
          type="button"
          className="ml-3 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          onClick={onClose}
          aria-label="Close evidence drawer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {selection.kind === "event" ? (
          <EventEvidence event={selection.event} focusedIdentifier={selection.focusedIdentifier} />
        ) : (
          <OrderEvidence order={selection.order} customer={customer} focusedIdentifier={selection.focusedIdentifier} />
        )}
      </div>
    </aside>
  );
}
