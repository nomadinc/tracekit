export type ShopifyOrderLineDraft = {
  sourceLineKey: string;
  providerProductId: string | null;
  providerVariantId: string | null;
  title: string | null;
  sku: string | null;
  quantity: number;
  unitAmount: number | null;
  grossAmount: number | null;
  currency: string | null;
};

export type ShopifyRefundDraft = {
  providerRefundId: string;
  providerPaymentId: string | null;
  occurredAt: string;
  amount: number | null;
  currency: string | null;
};

export function shopifyOrderLines(order: Record<string, any>, fallbackCurrency: string | null): ShopifyOrderLineDraft[] {
  return connectionNodes(order.lineItems).flatMap((line) => {
    const sourceLineKey = clean(line.id);
    const quantity = Number(line.quantity || 0);
    if (!sourceLineKey || !Number.isFinite(quantity) || quantity <= 0) return [];
    const grossAmount = money(line.discountedTotalSet ?? line.originalTotalSet ?? line.originalUnitPriceSet);
    const unitAmount = money(line.discountedUnitPriceAfterAllDiscountsSet ?? line.originalUnitPriceSet) ?? (grossAmount === null ? null : grossAmount / quantity);
    return [{
      sourceLineKey,
      providerProductId: clean(line.product?.id) || clean(line.variant?.product?.id) || null,
      providerVariantId: clean(line.variant?.id) || null,
      title: clean(line.title) || clean(line.name) || null,
      sku: clean(line.sku) || clean(line.variant?.sku) || null,
      quantity,
      unitAmount,
      grossAmount,
      currency: currencyCode(line.discountedTotalSet ?? line.originalTotalSet ?? line.originalUnitPriceSet, fallbackCurrency),
    }];
  });
}

export function shopifyRefunds(order: Record<string, any>, fallbackCurrency: string | null): ShopifyRefundDraft[] {
  return connectionNodes(order.refunds).flatMap((refund) => {
    const providerRefundId = clean(refund.id);
    const occurredAt = isoOrNull(refund.createdAt ?? refund.updatedAt);
    if (!providerRefundId || !occurredAt) return [];
    const transactions = connectionNodes(refund.transactions);
    const transaction = transactions.find((value) => clean(value.id)) || null;
    const directAmount = money(refund.totalRefundedSet ?? refund.totalRefunded);
    const transactionAmount = transactions.reduce<number | null>((sum, value) => {
      const amount = money(value.amountSet ?? value.amount);
      if (amount === null) return sum;
      return (sum ?? 0) + amount;
    }, null);
    return [{
      providerRefundId,
      providerPaymentId: clean(transaction?.id) || null,
      occurredAt,
      amount: directAmount ?? transactionAmount,
      currency: currencyCode(refund.totalRefundedSet ?? transaction?.amountSet, fallbackCurrency),
    }];
  });
}

export async function deterministicUuid(namespace: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(namespace)));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function connectionNodes(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.nodes)) return value.nodes.filter(Boolean);
  if (Array.isArray(value?.edges)) return value.edges.map((edge: any) => edge?.node).filter(Boolean);
  return [];
}

function money(value: any): number | null {
  const raw = value?.shopMoney?.amount ?? value?.presentmentMoney?.amount ?? value?.amount ?? value;
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function currencyCode(value: any, fallback: string | null) {
  const result = String(value?.shopMoney?.currencyCode ?? value?.presentmentMoney?.currencyCode ?? value?.currencyCode ?? fallback ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(result) ? result : null;
}

function isoOrNull(value: unknown) {
  const raw = clean(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}
