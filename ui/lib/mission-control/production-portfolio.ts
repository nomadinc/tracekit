import "server-only";

import { commercePersistenceCount, commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";

export type PortfolioMetric = {
  value: number | null;
  state: "available" | "partial" | "unavailable";
  detail: string;
};

export type MissionControlPortfolio = {
  generatedAt: string;
  organizationId: string;
  organizationName: string;
  metrics: {
    revenue: PortfolioMetric;
    profit: PortfolioMetric;
    conversions: PortfolioMetric;
    refunds: PortfolioMetric;
    chargebacks: PortfolioMetric;
  };
};

const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function isoStart(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Math.max(0, days - 1));
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

export function sumPortfolioRows(rows: Record<string, unknown>[], field: string) {
  return rows.reduce((total, row) => total + number(row[field]), 0);
}

export async function readMissionControlPortfolio(
  session: TraceKitSessionContext,
  days = 30,
): Promise<MissionControlPortfolio | null> {
  const organization = session.activeOrganization;
  if (!organization) return null;

  // Scope is derived only from the authenticated persistent session. Never
  // accept an Organization ID from browser input for this portfolio read.
  const organizationId = organization.id;
  const from = isoStart(days);
  const organizationFilter = `organization_id=eq.${encodeURIComponent(organizationId)}`;
  const timeFilter = `order_ts=gte.${encodeURIComponent(from)}`;
  const ledgerTimeFilter = `occurred_at=gte.${encodeURIComponent(from)}`;

  const [orders, conversionCount, refunds, chargebacks] = await Promise.all([
    commercePersistenceRequest(
      `platform_orders?${organizationFilter}&${timeFilter}&select=amount,gross_amount,currency,status`,
    ),
    commercePersistenceCount(
      `conversions?${organizationFilter}&${ledgerTimeFilter}&ledger_type=is.null&select=id`,
    ).catch(() => 0),
    commercePersistenceRequest(
      `conversions?${organizationFilter}&${ledgerTimeFilter}&ledger_type=eq.refund&select=amount,currency,reconciliation_state`,
    ),
    commercePersistenceRequest(
      `conversions?${organizationFilter}&${ledgerTimeFilter}&ledger_type=eq.chargeback&select=amount,currency,reconciliation_state`,
    ),
  ]);

  const revenue = orders.reduce(
    (total, row) => total + number(row.amount ?? row.gross_amount),
    0,
  );
  const refundAmount = Math.abs(sumPortfolioRows(refunds, "amount"));
  const chargebackAmount = Math.abs(sumPortfolioRows(chargebacks, "amount"));

  return {
    generatedAt: new Date().toISOString(),
    organizationId,
    organizationName: organization.name,
    metrics: {
      revenue: {
        value: revenue,
        state: "available",
        detail: `${orders.length} canonical commerce order record${orders.length === 1 ? "" : "s"} in the selected period.`,
      },
      profit: {
        value: null,
        state: "unavailable",
        detail:
          "Qualified portfolio Profit is not asserted until the canonical profit projection confirms all required financial inputs.",
      },
      conversions: {
        value: conversionCount,
        state: "partial",
        detail: "Canonical conversion rows without a financial ledger subtype; provider-specific qualification remains visible elsewhere.",
      },
      refunds: {
        value: refundAmount,
        state: "available",
        detail: `${refunds.length} append-only refund event${refunds.length === 1 ? "" : "s"}.`,
      },
      chargebacks: {
        value: chargebackAmount,
        state: "available",
        detail: `${chargebacks.length} append-only chargeback event${chargebacks.length === 1 ? "" : "s"}; reversals remain separate.`,
      },
    },
  };
}
