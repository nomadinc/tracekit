"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { sameOriginGetJson } from "@/lib/api";
import { useIdentity } from "@/components/identity/identity-provider";
import { profitReportContext } from "@/lib/identity/profit-report-context";
import { ProfitRequestController } from "@/lib/identity/profit-request-controller";
import type { ProfitSummaryResponse } from "@/lib/profit-types";

function isoDateLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseYmdLocal(v: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v).trim());
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function availableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(value: unknown, currency = "USD") {
  const n = availableNumber(value);
  if (n === null) return "Unavailable";
  return n.toLocaleString("en-US", { style: "currency", currency });
}

function formatSignedMoney(value: unknown, currency = "USD") {
  const n = availableNumber(value);
  if (n === null) return "Unavailable";
  const formatted = Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency,
  });
  return n < 0 ? `-${formatted}` : n > 0 ? `+${formatted}` : formatted;
}

function formatPositiveMoney(value: unknown, currency = "USD") {
  const n = availableNumber(value);
  if (n === null) return "Unavailable";
  return Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency,
  });
}

function formatProfitMargin(value: unknown) {
  const n = availableNumber(value);
  return n === null ? "Unavailable" : `${n.toFixed(1)}%`;
}

function useDashboardDateRange() {
  const searchParams = useSearchParams();
  const fromQ = searchParams.get("from");
  const toQ = searchParams.get("to");

  return React.useMemo(() => {
    const today = new Date();
    const defaultTo = isoDateLocal(today);
    const defaultFromDate = new Date(today);
    defaultFromDate.setDate(defaultFromDate.getDate() - 6);
    const defaultFrom = isoDateLocal(defaultFromDate);

    const fromDate = parseYmdLocal(fromQ || defaultFrom);
    const toDate = parseYmdLocal(toQ || fromQ || defaultTo);

    return {
      from: isoDateLocal(fromDate || defaultFromDate),
      to: isoDateLocal(toDate || today),
    };
  }, [fromQ, toQ]);
}

export function ProfitSummaryPanel() {
  const range = useDashboardDateRange();
  const { session } = useIdentity();
  const context = profitReportContext(session);
  const contextKey = JSON.stringify({
    identity: context.key,
    from: range.from,
    to: range.to,
  });
  const authorized = context.authorized;
  const controllerRef = React.useRef<ProfitRequestController<ProfitSummaryResponse> | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new ProfitRequestController<ProfitSummaryResponse>();
  }

  const controller = controllerRef.current;
  const [, forceUpdate] = React.useReducer((value: number) => value + 1, 0);

  const state = controller.snapshot(contextKey, authorized);
  const summary = state.data;
  const error = state.error;
  const loading = state.loading;

  const reportCurrency = summary?.currency || undefined;
  const reportHasData = summary?.data_available === true;
  const reportReady = authorized && reportHasData && Boolean(reportCurrency);

  const costFields = [
    summary?.processor_fees,
    summary?.chargeback_fees,
    summary?.bank_fees,
    summary?.shipping_cost ?? summary?.shipping,
    summary?.cogs,
    summary?.affiliate_payout,
    summary?.ad_spend,
  ];

  const missingRecordedCosts =
    reportReady && costFields.some((value) => availableNumber(value) === null);

  const displayMoney = (value: unknown) =>
    reportHasData && reportCurrency
      ? formatMoney(value, reportCurrency)
      : "Unavailable";

  const displayPositiveMoney = (value: unknown) =>
    reportHasData && reportCurrency
      ? formatPositiveMoney(value, reportCurrency)
      : "Unavailable";

  const displaySignedMoney = (value: unknown) =>
    reportHasData && reportCurrency
      ? formatSignedMoney(value, reportCurrency)
      : "Unavailable";

  const displayMargin = (value: unknown) =>
    reportHasData && reportCurrency
      ? formatProfitMargin(value)
      : "Unavailable";

  React.useEffect(() => {
    return controller.subscribe(forceUpdate);
  }, [controller]);

  React.useEffect(() => {
    if (!authorized) {
      controller.invalidate();
      return;
    }

    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
    });

    const operation = controller.start(
      contextKey,
      authorized,
      (signal) => sameOriginGetJson<ProfitSummaryResponse>(
        `/api/profit/summary?${params.toString()}`,
        { signal }
      ).then((json) => {
        if (json?.ok === false) {
          throw new Error(
            json.message || json.error || "Profit summary unavailable"
          );
        }
        return json;
      })
    );

    return () => operation.cancel();
  }, [controller, contextKey, authorized, range.from, range.to]);

  React.useEffect(() => {
    return () => controller.dispose();
  }, [controller]);

  const rows = [
    { label: "Refunds", value: summary?.refunds, treatment: "Deduction" },
    { label: "Chargebacks", value: summary?.chargebacks, treatment: "Deduction" },
    { label: "Processor Fees", value: summary?.processor_fees, treatment: "Deduction" },
    { label: "Chargeback Fees", value: summary?.chargeback_fees, treatment: "Deduction" },
    { label: "Bank Fees", value: summary?.bank_fees, treatment: "Deduction" },
    { label: "Shipping", value: summary?.shipping_cost ?? summary?.shipping, treatment: "Deduction" },
    { label: "Tax", value: summary?.tax, treatment: "Category" },
    { label: "COGS", value: summary?.cogs, treatment: "Deduction" },
    { label: "Affiliate Payouts", value: summary?.affiliate_payout, treatment: "Deduction" },
    { label: "Ad Spend", value: summary?.ad_spend, treatment: "Deduction" },
  ];

  return (
    <Card
      title="Profit Summary"
      right={
        <span className="text-xs text-slate-500">
          {loading ? "loading..." : `${range.from} to ${range.to}`}
        </span>
      }
    >
      <div className="mb-4 text-xs text-slate-500">
        Financial status: Operational — Unreconciled.
        Calculated totals do not establish complete cost coverage
        or period reconciliation. This report uses financial ledger
        revenue, recorded costs, refunds, chargebacks, and affiliate
        payouts. Mission Control uses commerce-based sales and separately
        accrued affiliate commissions. Differences may reflect source
        coverage, accounting definitions, or reporting periods.
      </div>

      {authorized && loading ? (
        <p role="status" className="mb-4 text-sm text-slate-500">
          Loading financial evidence for the selected period…
        </p>
      ) : null}

      {authorized && !loading && !error && !reportHasData ? (
        <p role="status" className="mb-4 text-sm text-slate-500">
          No qualified financial records are available for the selected period.
        </p>
      ) : null}

      {reportReady && missingRecordedCosts ? (
        <p role="status" className="mb-4 text-sm text-amber-700 dark:text-amber-300">
          Some recorded cost categories are unavailable. Profit remains
          operational and unreconciled; missing costs are not confirmed zero.
        </p>
      ) : null}

      {!authorized ? (
        <p role="status" className="mb-4 text-sm text-slate-500">
          Detailed Profit Reporting is unavailable for the current access context.
        </p>
      ) : null}

      {authorized && error ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="font-semibold">Profit summary unavailable.</span>{" "}
          <span className="font-mono text-xs opacity-80">{error}</span>
        </div>
      ) : null}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Net Revenue"
          value={displayMoney(summary?.net_revenue)}
        />
        <KpiCard
          label="Operating Costs"
          value={displayPositiveMoney(summary?.total_costs)}
        />
        <KpiCard
          label="Net Profit"
          value={displayMoney(summary?.net_profit)}
        />
        <KpiCard
          label="Profit Margin"
          value={displayMargin(summary?.profit_margin_pct)}
        />
      </div>

      <div className="mt-4 overflow-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-left">Treatment</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t">
              <td className="px-4 py-2 font-medium">Gross Revenue</td>
              <td className="px-4 py-2 text-slate-500">Revenue</td>
              <td className="px-4 py-2 text-right font-mono">
                {displayMoney(summary?.gross_revenue)}
              </td>
            </tr>
            {rows.map((row) => (
              <tr key={row.label} className="border-t">
                <td className="px-4 py-2 font-medium">{row.label}</td>
                <td className="px-4 py-2 text-slate-500">{row.treatment}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {displaySignedMoney(row.value)}
                </td>
              </tr>
            ))}
            <tr className="border-t bg-slate-50 dark:bg-slate-900">
              <td className="px-4 py-2 font-semibold">Net Profit</td>
              <td className="px-4 py-2 text-slate-500">Result</td>
              <td className="px-4 py-2 text-right font-mono font-semibold">
                {displayMoney(summary?.net_profit)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
