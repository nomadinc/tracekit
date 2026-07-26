"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  GitBranch,
  Loader2,
} from "lucide-react";
import { EntityHeader } from "@/components/shared/entity-header";
import { customerStatusTone, formatCustomerDateRange, formatCustomerMoney } from "@/lib/customers";
import type { EntityStatus } from "@/lib/entities";
import { LIVE_WORKSPACE_UPDATE_EVENT, type WorkspaceUpdate } from "@/lib/live";
import {
  ActivityFilterBar,
  AttributionExplanationCard,
  Badge,
  CommissionExplanationCard,
  EmptyInvestigationState,
  IdentityExplanationCard,
  JourneyStoryHeader,
  NarrativeTimeline,
  OrderInvestigationPanel,
  Section,
  type ActivityFilter,
  type TimelineViewMode,
} from "./narrative-components";
import {
  AcquisitionSummary,
  ChannelHistoryCard,
  CommercialHistoryTable,
  CustomerExplainPanel,
  CustomerMetricGrid,
  CustomerStatusCard,
  CustomerValueChart,
  CustomerWorkItemsCard,
  LifetimeAttributionCard,
  LifetimeCommissionCard,
  OperationalHealthCard,
  OrderExplainPanel,
  RefundRiskCard,
} from "./customer-360-components";

type CustomerDetail = {
  ok: boolean;
  workspace_id: string;
  customer: any;
  identifiers: any[];
  identity_events: any[];
  journeys: any[];
  orders: any[];
  attribution: any[];
  commissions: any[];
  customer_360?: any;
  work_items?: any;
  explanations?: any;
  summary: any;
  message?: string;
};

type JourneyDetail = {
  ok: boolean;
  workspace_id: string;
  customer: any;
  journey: any;
  events: any[];
  activity?: any[];
  activity_summary?: any;
  touchpoints: any[];
  orders: any[];
  attribution: any[];
  attribution_explanations?: any[];
  commissions: any[];
  commission_explanations?: any[];
  identity_context: any;
  identity_explanation?: any;
  page: { next_cursor?: string | null; has_more?: boolean };
  message?: string;
};

async function readJsonSafe(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: "invalid_json", message: text.slice(0, 240) };
  }
}

async function fetchCustomer(personId: string, workspaceId: string) {
  const res = await fetch(`/api/customers/${encodeURIComponent(personId)}?workspace_id=${encodeURIComponent(workspaceId)}`, {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body?.message || body?.error || `Customer detail failed (${res.status})`);
  return body as CustomerDetail;
}

async function fetchJourney(personId: string, journeyId: string, workspaceId: string, cursor?: string | null) {
  const params = new URLSearchParams({ workspace_id: workspaceId, limit: "100" });
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`/api/customers/${encodeURIComponent(personId)}/journeys/${encodeURIComponent(journeyId)}?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body?.message || body?.error || `Journey detail failed (${res.status})`);
  return body as JourneyDetail;
}

function bestJourneyId(detail: CustomerDetail | null, requested: string | null) {
  if (requested && detail?.journeys?.some((journey) => journey.id === requested)) return requested;
  return detail?.journeys?.[0]?.id || null;
}

function updateQuery(router: any, personId: string, searchParams: URLSearchParams, updates: Record<string, string | null>) {
  const params = new URLSearchParams(searchParams.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "" || value === "all" || value === "story") params.delete(key);
    else params.set(key, value);
  }
  router.replace(`/customers/${encodeURIComponent(personId)}?${params.toString()}`);
}

function selectedOrderFrom(detail: CustomerDetail | null, journey: JourneyDetail | null, requestedOrderId: string | null) {
  if (!requestedOrderId) return null;
  const orders = [...(journey?.orders || []), ...(detail?.orders || [])];
  return orders.find((order) => [order.platform_order_id, order.order_id, order.transaction_id].filter(Boolean).includes(requestedOrderId)) || null;
}

function selectedCommercialOrderFrom(detail: CustomerDetail | null, requestedOrderId: string | null) {
  if (!requestedOrderId) return null;
  const rows = detail?.customer_360?.commercial_summary?.orders || [];
  return rows.find((order: any) => [order.platform_order_id, order.order_id, order.transaction_id, order.key].filter(Boolean).includes(requestedOrderId)) || null;
}

function orderExplanationFor(detail: CustomerDetail | null, order: any) {
  if (!order) return null;
  const explanations = detail?.explanations?.orders || {};
  return explanations[order.key] || explanations[order.platform_order_id] || explanations[order.order_id] || null;
}

function entityToneForCustomerStatus(status: unknown): EntityStatus["tone"] {
  const tone = customerStatusTone(status);
  if (tone === "good") return "success";
  if (tone === "warn") return "warning";
  if (tone === "bad") return "critical";
  return "neutral";
}

export default function CustomerDetailClient({ personId }: { personId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workspaceId, setWorkspaceId] = React.useState(searchParams.get("workspace_id") || "default");
  const requestedJourneyId = searchParams.get("journey_id");
  const requestedOrderId = searchParams.get("order_id");
  const [activityFilter, setActivityFilter] = React.useState<ActivityFilter>((searchParams.get("activity") as ActivityFilter) || "all");
  const [viewMode, setViewMode] = React.useState<TimelineViewMode>((searchParams.get("view") as TimelineViewMode) || "story");
  const [detail, setDetail] = React.useState<CustomerDetail | null>(null);
  const [journey, setJourney] = React.useState<JourneyDetail | null>(null);
  const [selectedJourneyId, setSelectedJourneyId] = React.useState<string | null>(requestedJourneyId);
  const [loading, setLoading] = React.useState(true);
  const [journeyLoading, setJourneyLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [journeyError, setJourneyError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCustomer(personId, workspaceId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setSelectedJourneyId(bestJourneyId(data, requestedJourneyId));
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || "Customer detail failed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId, workspaceId, requestedJourneyId]);

  React.useEffect(() => {
    if (!selectedJourneyId) {
      setJourney(null);
      return;
    }
    let cancelled = false;
    setJourneyLoading(true);
    setJourneyError(null);
    fetchJourney(personId, selectedJourneyId, workspaceId)
      .then((data) => {
        if (!cancelled) setJourney(data);
      })
      .catch((err: any) => {
        if (!cancelled) setJourneyError(err?.message || "Journey detail failed.");
      })
      .finally(() => {
        if (!cancelled) setJourneyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId, selectedJourneyId, workspaceId]);

  React.useEffect(() => {
    if (!requestedOrderId || !journey?.activity?.length) return;
    const selector = `[data-related-order="${CSS.escape(requestedOrderId)}"]`;
    window.setTimeout(() => document.querySelector(selector)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
  }, [requestedOrderId, journey?.activity]);

  React.useEffect(() => {
    function relatedEntityMatches(update: WorkspaceUpdate, type: string, id: string | null | undefined) {
      if (!id) return false;
      if (update.entity?.type === type && update.entity.id === id) return true;
      const related = Array.isArray(update.payload?.related_entities) ? update.payload?.related_entities : [];
      return related.some((entity: any) => entity?.type === type && String(entity?.id || "") === id);
    }

    function onWorkspaceUpdate(event: Event) {
      const update = (event as CustomEvent<WorkspaceUpdate>).detail;
      if (!update || update.workspaceId !== workspaceId) return;
      const customerRelated =
        relatedEntityMatches(update, "customer", personId) ||
        relatedEntityMatches(update, "person", personId) ||
        relatedEntityMatches(update, "journey", selectedJourneyId);
      if (!customerRelated) return;
      fetchCustomer(personId, workspaceId)
        .then((data) => {
          setDetail(data);
          setSelectedJourneyId((current) => current || bestJourneyId(data, requestedJourneyId));
        })
        .catch(() => null);
      if (selectedJourneyId) {
        fetchJourney(personId, selectedJourneyId, workspaceId)
          .then((data) => setJourney(data))
          .catch(() => null);
      }
    }
    window.addEventListener(LIVE_WORKSPACE_UPDATE_EVENT, onWorkspaceUpdate);
    return () => window.removeEventListener(LIVE_WORKSPACE_UPDATE_EVENT, onWorkspaceUpdate);
  }, [personId, requestedJourneyId, selectedJourneyId, workspaceId]);

  function selectJourney(journeyId: string) {
    setSelectedJourneyId(journeyId);
    updateQuery(router, personId, new URLSearchParams(searchParams.toString()), {
      journey_id: journeyId,
      workspace_id: workspaceId,
      activity: activityFilter,
      view: viewMode,
    });
  }

  function selectOrder(order: any) {
    updateQuery(router, personId, new URLSearchParams(searchParams.toString()), {
      workspace_id: workspaceId,
      order_id: order.platform_order_id || order.order_id || order.transaction_id || order.key,
      journey_id: selectedJourneyId,
      activity: activityFilter,
      view: viewMode,
    });
  }

  function changeActivityFilter(value: ActivityFilter) {
    setActivityFilter(value);
    updateQuery(router, personId, new URLSearchParams(searchParams.toString()), { activity: value, workspace_id: workspaceId });
  }

  function changeViewMode(value: TimelineViewMode) {
    setViewMode(value);
    updateQuery(router, personId, new URLSearchParams(searchParams.toString()), { view: value, workspace_id: workspaceId });
  }

  const customer = detail?.customer;
  const summary = detail?.summary || {};
  const customer360 = detail?.customer_360 || {};
  const selectedOrder = selectedOrderFrom(detail, journey, requestedOrderId);
  const selectedCommercialOrder = selectedCommercialOrderFrom(detail, requestedOrderId);
  const selectedOrderExplanation = orderExplanationFor(detail, selectedCommercialOrder);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-lg bg-slate-100 dark:bg-white/10" />
        <div className="h-32 animate-pulse rounded-lg bg-slate-100 dark:bg-white/10" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="h-96 animate-pulse rounded-lg bg-slate-100 dark:bg-white/10" />
          <div className="h-96 animate-pulse rounded-lg bg-slate-100 dark:bg-white/10" />
        </div>
      </div>
    );
  }

  if (error || !detail || !customer) {
    return (
      <section className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
        <Link href="/customers" className="mb-4 inline-flex items-center gap-2 text-sm font-medium"><ArrowLeft className="h-4 w-4" /> Customers</Link>
        <div className="flex gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5" />
          <div>
            <h1 className="font-semibold">Customer not found</h1>
            <p className="mt-1 text-sm">{error || "This customer does not exist in the selected workspace."}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="min-h-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/customers" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Customers
        </Link>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Workspace</span>
          <input value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value || "default")} className="w-40 rounded-md border bg-white px-3 py-1.5 dark:bg-transparent" />
        </label>
      </div>

      <section className="rounded-lg border bg-white p-5 shadow-sm dark:border-white/10 dark:bg-ink/80">
        <EntityHeader
          entityType="customer"
          title={customer.display_name || customer.primary_email || customer.primary_phone || customer.id}
          subtitle={summary.source_systems?.length ? `Customer · ${summary.source_systems.join(", ")}` : "Customer"}
          statuses={[
            { label: summary.identity_status || "Identity unknown", tone: entityToneForCustomerStatus(summary.identity_status) },
            { label: customer360?.status?.identity || "Operational state unknown", tone: entityToneForCustomerStatus(customer360?.status?.identity) },
          ]}
          secondaryStatuses={(customer360?.status?.chips || []).map((chip: string) => ({ label: chip, tone: entityToneForCustomerStatus(chip) }))}
          metadata={[
            { label: "Lifetime revenue", value: customer360?.metrics?.lifetime_revenue || "-" },
            { label: "Orders", value: customer360?.metrics?.orders || summary.order_count || 0 },
            { label: "Last activity", value: customer360?.metrics?.last_seen_at || summary.last_seen_at || "-" },
            { label: "Open Work Items", value: detail.work_items?.open?.length || 0 },
          ]}
          identifiers={[
            { label: "Person ID", value: customer.id },
            ...(customer.primary_email ? [{ label: "Email", value: customer.primary_email }] : []),
            ...(customer.primary_phone ? [{ label: "Phone", value: customer.primary_phone }] : []),
          ]}
          actions={[
            { id: "copy-customer-id", label: "Copy customer ID", kind: "copy", value: customer.id, safe: true },
            { id: "copy-customer-link", label: "Copy link", kind: "copy", value: `/customers/${encodeURIComponent(customer.id)}?workspace_id=${encodeURIComponent(workspaceId)}`, safe: true },
          ]}
        />
      </section>
      <CustomerMetricGrid metrics={customer360.metrics || {}} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-5">
          <CustomerExplainPanel explanation={detail.explanations?.customer} />
          <CommercialHistoryTable rows={customer360.commercial_summary?.orders || []} selectedOrderId={requestedOrderId} onSelectOrder={selectOrder} />
          <CustomerValueChart rows={customer360.value_by_month || []} />
          <OrderExplainPanel explanation={selectedOrderExplanation} />

          <Section title="Journey Explorer" icon={GitBranch} right={journeyLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}>
            <div className="mb-5">
              {detail.journeys?.length ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {detail.journeys.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => selectJourney(item.id)}
                      className={`rounded-lg border p-4 text-left transition hover:bg-slate-50 dark:hover:bg-white/5 ${selectedJourneyId === item.id ? "border-slate-950 ring-2 ring-slate-200 dark:border-white dark:ring-white/20" : "dark:border-white/10"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-medium">{formatCustomerDateRange(item.started_at, item.ended_at)}</div>
                        <Badge tone={customerStatusTone(item.status)}>{item.status}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
                        <span>{item.event_count} events</span>
                        <span>{item.purchase_count} purchases</span>
                        <span>{formatCustomerMoney(item.total_revenue)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyInvestigationState title="No journeys" body="This customer does not have a journey record yet." />
              )}
            </div>

            {journeyError ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">{journeyError}</p>
            ) : journey ? (
              <div className="space-y-5">
                <JourneyStoryHeader journey={journey.journey} summary={journey.activity_summary} />
                <ActivityFilterBar value={activityFilter} mode={viewMode} onChange={changeActivityFilter} onModeChange={changeViewMode} />
                <NarrativeTimeline activities={journey.activity || journey.events || []} filter={activityFilter} mode={viewMode} highlightedOrderId={requestedOrderId} />
              </div>
            ) : (
              <EmptyInvestigationState title="Select a journey" body="Select a journey to inspect the full customer story." />
            )}
          </Section>
        </div>

        <aside className="space-y-5">
          <CustomerStatusCard status={customer360.status || {}} />
          <CustomerWorkItemsCard workItems={detail.work_items} />
          <OperationalHealthCard items={customer360.operational_health || []} />
          <AcquisitionSummary acquisition={customer360.acquisition || {}} />
          <ChannelHistoryCard channels={customer360.channels || []} />
          <RefundRiskCard refunds={customer360.refunds} chargebacks={customer360.chargebacks} />
          <LifetimeAttributionCard rows={customer360.attribution_summary || []} />
          <LifetimeCommissionCard summary={customer360.commission_summary || {}} />
          <IdentityExplanationCard explanation={journey?.identity_explanation || detail.explanations?.identity || detail} />
          <OrderInvestigationPanel order={selectedOrder} attribution={journey?.attribution || detail.attribution || []} commissions={journey?.commissions || detail.commissions || []} />
          <div className="grid gap-5">
            <AttributionExplanationCard explanations={journey?.attribution_explanations || []} />
            <CommissionExplanationCard explanations={journey?.commission_explanations || []} />
          </div>
        </aside>
      </div>
    </div>
  );
}
