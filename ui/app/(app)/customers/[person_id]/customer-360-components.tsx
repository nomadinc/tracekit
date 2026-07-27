"use client";

import * as React from "react";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  CheckCircle2,
  Clipboard,
  DollarSign,
  Fingerprint,
  HeartPulse,
  Info,
  Package,
  Receipt,
  RefreshCcw,
  ShieldCheck,
  Target,
  UserRound,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  compactCustomerId,
  customerStatusTone,
  eventCategoryLabel,
  formatCustomerMoney,
  formatCustomerTime,
  redactCustomerEvidence,
} from "@/lib/customers";
import { Badge, DetailGrid, EmptyInvestigationState, Section } from "./narrative-components";

function populated(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function HealthIcon({ status }: { status: string }) {
  if (status === "healthy") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "attention") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (status === "informational") return <Info className="h-4 w-4 text-blue-500" />;
  return <Info className="h-4 w-4 text-slate-400" />;
}

function EvidenceDrawer({ block }: { block: any }) {
  const statements = block?.statements || [];
  const limitations = block?.limitations || [];
  if (!statements.length && !limitations.length) return null;
  return (
    <details className="mt-3 rounded-md border bg-slate-50 p-3 text-xs dark:border-white/10 dark:bg-white/5">
      <summary className="cursor-pointer font-medium">View supporting evidence</summary>
      <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(redactCustomerEvidence({ statements, limitations }), null, 2)}</pre>
    </details>
  );
}

export function Customer360Header({ customer, summary, customer360, onCopyPerson }: { customer: any; summary: any; customer360: any; onCopyPerson: () => void }) {
  const chips = customer360?.status?.chips || [];
  return (
    <section className="rounded-lg border bg-white p-5 shadow-sm dark:bg-ink/80">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-2xl font-semibold tracking-tight">{customer.display_name}</h1>
              <Badge tone={customerStatusTone(summary.identity_status)}>{summary.identity_status}</Badge>
              {chips.map((chip: string) => <Badge key={chip} tone={customerStatusTone(chip)}>{chip}</Badge>)}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              {customer.primary_email ? <span>{customer.primary_email}</span> : null}
              {customer.primary_phone ? <span>{customer.primary_phone}</span> : null}
              <span>{compactCustomerId(customer.id)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={onCopyPerson} className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-white/5">
                <Clipboard className="h-4 w-4" />
                Copy person ID
              </button>
            </div>
          </div>
        </div>
        <div className="grid min-w-[280px] grid-cols-2 gap-3 text-sm sm:grid-cols-4 xl:grid-cols-2">
          {[
            ["First seen", formatCustomerTime(customer360?.metrics?.first_seen_at || summary.first_seen_at)],
            ["Last seen", formatCustomerTime(customer360?.metrics?.last_seen_at || summary.last_seen_at)],
            ["Source systems", summary.source_systems?.join(", ")],
            ["Status", customer360?.status?.identity],
          ].filter(([, value]) => populated(value)).map(([label, value]) => (
            <div key={label} className="rounded-md border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-1 font-medium">{String(value)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CustomerMetricGrid({ metrics }: { metrics: any }) {
  const items = [
    ["Lifetime Revenue", metrics?.lifetime_revenue, DollarSign],
    ["Net Revenue", metrics?.net_revenue, DollarSign],
    ["Orders", metrics?.orders, Package],
    ["Average Order Value", metrics?.average_order_value, Receipt],
    ["Attributed Revenue", metrics?.attributed_revenue, Target],
    ["Commission Generated", metrics?.commission_generated, DollarSign],
    ["Commission Paid", metrics?.commission_paid, ShieldCheck],
    ["Journeys", metrics?.journeys, BarChart3],
  ].filter(([, value]) => populated(value));
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([label, value, Icon]: any) => (
        <div key={label} className="rounded-lg border bg-white p-4 shadow-sm dark:border-white/10 dark:bg-ink/80">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
            <Icon className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{String(value)}</div>
        </div>
      ))}
    </section>
  );
}

export function CustomerExplainPanel({ explanation }: { explanation: any }) {
  return (
    <Section title="Explain This Customer" icon={Info}>
      {explanation?.summary ? <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{explanation.summary}</p> : <EmptyInvestigationState title="Limited explanation" body="Historical explanation evidence was not retained." />}
      {explanation?.statements?.length ? (
        <ol className="mt-4 space-y-2 text-sm">
          {explanation.statements.slice(0, 8).map((statement: any) => (
            <li key={statement.id} className="rounded-md border p-3 dark:border-white/10">{statement.text}</li>
          ))}
        </ol>
      ) : null}
      {explanation?.limitations?.length ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {explanation.limitations.slice(0, 3).map((item: string) => <p key={item}>{item}</p>)}
        </div>
      ) : null}
      <EvidenceDrawer block={explanation} />
    </Section>
  );
}

export function CustomerStatusCard({ status }: { status: any }) {
  return (
    <Section title="Current Status" icon={HeartPulse}>
      <DetailGrid rows={[
        ["Identity", status?.identity],
        ["Last purchase", formatCustomerTime(status?.last_purchase_at)],
        ["Attribution", status?.attribution],
        ["Commissions", status?.commissions ? Object.entries(status.commissions).map(([key, value]) => `${value} ${key}`).join(", ") : null],
        ["Refunds", status?.refunds],
        ["Chargebacks", status?.chargebacks],
        ["Subscription", status?.subscription],
      ]} />
    </Section>
  );
}

export function OperationalHealthCard({ items }: { items: any[] }) {
  return (
    <Section title="Operational Health" icon={ShieldCheck}>
      <div className="space-y-3">
        {items?.length ? items.map((item) => (
          <div key={item.id} className="flex gap-3 rounded-md border p-3 text-sm dark:border-white/10">
            <HealthIcon status={item.status} />
            <div>
              <div className="font-medium">{item.label}</div>
              <p className="mt-1 text-slate-500 dark:text-slate-400">{item.summary}</p>
            </div>
          </div>
        )) : <EmptyInvestigationState title="No health checks" body="No customer-level health indicators are available." />}
      </div>
    </Section>
  );
}

export function CustomerWorkItemsCard({ workItems }: { workItems: { open?: any[]; recent_resolved?: any[] } | null | undefined }) {
  const open = workItems?.open || [];
  const recentResolved = workItems?.recent_resolved || [];
  return (
    <Section title="Operational Items" icon={ClipboardList}>
      {open.length || recentResolved.length ? (
        <div className="space-y-3">
          {open.slice(0, 5).map((item) => (
            <a key={item.id} href={`/operations?work_item_id=${encodeURIComponent(item.id)}`} className="block rounded-md border p-3 text-sm transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{item.title}</div>
                  <p className="mt-1 text-slate-500 dark:text-slate-400">{item.related_order_id ? `Order ${item.related_order_id}` : item.summary}</p>
                </div>
                <Badge tone={item.priority === "urgent" || item.priority === "high" ? "warn" : "neutral"}>{item.priority}</Badge>
              </div>
            </a>
          ))}
          {recentResolved.length ? (
            <details className="rounded-md border p-3 text-sm dark:border-white/10">
              <summary className="cursor-pointer font-medium">Resolved history</summary>
              <div className="mt-3 space-y-2">
                {recentResolved.slice(0, 5).map((item) => (
                  <a key={item.id} href={`/operations?work_item_id=${encodeURIComponent(item.id)}`} className="block rounded-md bg-slate-50 p-2 dark:bg-white/5">
                    <span className="font-medium">{item.title}</span>
                    <span className="ml-2 text-slate-500">resolved</span>
                  </a>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : (
        <EmptyInvestigationState title="No open operational items" body="No active Work Items are linked to this customer." />
      )}
    </Section>
  );
}

export function AcquisitionSummary({ acquisition }: { acquisition: any }) {
  return (
    <Section title="Acquisition" icon={Target}>
      <DetailGrid rows={[
        ["First known marketing touch", acquisition?.first_known_touch ? `${acquisition.first_known_touch.source} · ${formatCustomerTime(acquisition.first_known_touch.occurred_at)}` : null],
        ["First attributed source", acquisition?.first_attributed_source ? `${acquisition.first_attributed_source.source} · ${formatCustomerTime(acquisition.first_attributed_source.occurred_at)}` : null],
        ["Most recent touch", acquisition?.most_recent_touch ? `${acquisition.most_recent_touch.source} · ${formatCustomerTime(acquisition.most_recent_touch.occurred_at)}` : null],
        ["Most recent attributed source", acquisition?.most_recent_attributed_source ? `${acquisition.most_recent_attributed_source.source} · ${formatCustomerTime(acquisition.most_recent_attributed_source.occurred_at)}` : null],
        ["Primary lifetime source", acquisition?.primary_lifetime_source ? `${acquisition.primary_lifetime_source.source} · ${acquisition.primary_lifetime_source.attributed_revenue}` : null],
      ]} />
    </Section>
  );
}

export function ChannelHistoryCard({ channels }: { channels: any[] }) {
  return (
    <Section title="Channel History" icon={Target}>
      <div className="space-y-3">
        {channels?.length ? channels.slice(0, 8).map((channel) => (
          <div key={channel.channel} className="rounded-md border p-3 text-sm dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="font-medium">{channel.channel}</div>
              <Badge tone="good">{channel.attributed_revenue}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
              <span>First {formatCustomerTime(channel.first_touch)}</span>
              <span>Last {formatCustomerTime(channel.last_touch)}</span>
              <span>{channel.touchpoint_count} touchpoints</span>
              <span>{channel.attributed_orders} attributed orders</span>
            </div>
            {channel.primary_campaign ? <p className="mt-2 text-xs text-slate-500">Primary campaign: {channel.primary_campaign}</p> : null}
          </div>
        )) : <EmptyInvestigationState title="Limited acquisition history" body="No eligible marketing touchpoints were retained for this customer." />}
      </div>
    </Section>
  );
}

export function CommercialHistoryTable({ rows, selectedOrderId, onSelectOrder }: { rows: any[]; selectedOrderId?: string | null; onSelectOrder: (order: any) => void }) {
  if (!rows?.length) {
    return <Section title="Commercial History" icon={Receipt}><EmptyInvestigationState title="No linked purchases" body="This customer has been identified, but no linked purchases are available." /></Section>;
  }
  return (
    <Section title="Commercial History" icon={Receipt}>
      <div className="overflow-x-auto">
        <table className="min-w-[860px] w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Products</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Gross</th>
              <th className="px-3 py-2">Refunded</th>
              <th className="px-3 py-2">Net</th>
              <th className="px-3 py-2">Attributed Source</th>
              <th className="px-3 py-2">Commission</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-white/10">
            {rows.slice(0, 50).map((row) => {
              const selected = selectedOrderId && [row.platform_order_id, row.order_id, row.transaction_id, row.key].filter(Boolean).includes(selectedOrderId);
              return (
                <tr key={row.key} className={selected ? "bg-amber-50 dark:bg-amber-500/10" : "hover:bg-slate-50 dark:hover:bg-white/5"}>
                  <td className="px-3 py-3">{formatCustomerTime(row.date)}</td>
                  <td className="px-3 py-3">
                    <button type="button" onClick={() => onSelectOrder(row)} className="font-medium text-slate-950 underline-offset-2 hover:underline dark:text-white">
                      {row.order_id || row.platform_order_id || row.key}
                    </button>
                    <div className="text-xs text-slate-500">{row.platform}</div>
                  </td>
                  <td className="px-3 py-3">{row.products?.length ? row.products.join(", ") : "-"}</td>
                  <td className="px-3 py-3"><Badge tone={customerStatusTone(row.status)}>{row.status || "stored"}</Badge></td>
                  <td className="px-3 py-3">{row.gross}</td>
                  <td className="px-3 py-3">{row.refunded || row.chargeback || "-"}</td>
                  <td className="px-3 py-3">{row.net}</td>
                  <td className="px-3 py-3">{row.attributed_source || "-"}</td>
                  <td className="px-3 py-3">{row.commission || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function CustomerValueChart({ rows }: { rows: any[] }) {
  const chartRows = (rows || []).filter((row) => row.order_revenue_raw || row.attributed_revenue_raw || row.refunds_raw || row.commission_generated_raw);
  if (chartRows.length < 2) return null;
  return (
    <Section title="Customer Value by Month" icon={BarChart3}>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartRows}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} />
            <Tooltip formatter={(value: any) => formatCustomerMoney(value)} />
            <Area type="monotone" dataKey="order_revenue_raw" name="Order revenue" stroke="#0f172a" fill="#0f172a" fillOpacity={0.12} />
            <Area type="monotone" dataKey="attributed_revenue_raw" name="Attributed revenue" stroke="#2563eb" fill="#2563eb" fillOpacity={0.1} />
            <Area type="monotone" dataKey="refunds_raw" name="Refunds" stroke="#dc2626" fill="#dc2626" fillOpacity={0.08} />
            <Area type="monotone" dataKey="commission_generated_raw" name="Commission generated" stroke="#059669" fill="#059669" fillOpacity={0.1} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Section>
  );
}

export function RefundRiskCard({ refunds, chargebacks }: { refunds: any; chargebacks: any }) {
  if (!refunds?.count && !chargebacks?.count) return null;
  return (
    <Section title="Refund and Chargeback Summary" icon={RefreshCcw}>
      <DetailGrid rows={[
        ["Refund count", refunds?.count],
        ["Refunded amount", refunds?.amount],
        ["Last refund", formatCustomerTime(refunds?.last_refund_at)],
        ["Chargeback count", chargebacks?.count],
        ["Chargeback amount", chargebacks?.amount],
        ["Last chargeback", formatCustomerTime(chargebacks?.last_chargeback_at)],
      ]} />
    </Section>
  );
}

export function LifetimeAttributionCard({ rows }: { rows: any[] }) {
  return (
    <Section title="Lifetime Attribution" icon={Target}>
      <div className="space-y-3">
        {rows?.length ? rows.slice(0, 8).map((row) => (
          <div key={row.source} className="rounded-md border p-3 text-sm dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{row.source}</div>
                <div className="text-xs text-slate-500">{row.orders} attributed orders</div>
              </div>
              <Badge tone="good">{row.credited_revenue}</Badge>
            </div>
            <p className="mt-2 text-xs text-slate-500">{row.commissions ? `${row.commissions} commissions` : "No affiliate commission"}</p>
          </div>
        )) : <EmptyInvestigationState title="No attribution" body="Purchases are linked to this customer, but no attribution credits were recorded." />}
      </div>
    </Section>
  );
}

export function LifetimeCommissionCard({ summary }: { summary: any }) {
  return (
    <Section title="Lifetime Commission" icon={DollarSign}>
      <DetailGrid rows={[
        ["Generated", summary?.generated],
        ["Paid", summary?.paid],
        ["Pending", summary?.pending],
        ["Reversed", summary?.reversed],
      ]} />
    </Section>
  );
}

export function OrderExplainPanel({ explanation }: { explanation: any }) {
  if (!explanation) return null;
  return (
    <Section title="Explain This Order" icon={Info}>
      <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{explanation.summary || "Stored order evidence is linked to this customer."}</p>
      {explanation.limitations?.length ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {explanation.limitations.slice(0, 3).map((item: string) => <p key={item}>{item}</p>)}
        </div>
      ) : null}
      <EvidenceDrawer block={explanation} />
    </Section>
  );
}
