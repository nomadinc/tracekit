import type { CommasProduct } from "./types.ts";

export type CommasWorkbookProduct = {
  productId: string;
  title: string;
  internalName: string;
  price: string;
};

export type CommasProductMapComparison = {
  workbookProductId: string;
  apiProductIdMatch: boolean;
  titleMatch: boolean | null;
  internalNameMatch: boolean | null;
  priceMatch: boolean | null;
  proposedBusinessContext: "push-button-systems" | null;
  proposedRole: "front_end" | "order_bump" | "upsell" | null;
  proposedStep: number | null;
  proposedVariant: "discount-1" | "discount-2" | null;
  confidence: "high" | "medium" | "review_required";
  reviewRequiredReason: string | null;
};

export function compareCommasProductMap(
  workbookRows: CommasWorkbookProduct[],
  apiProducts: CommasProduct[],
): CommasProductMapComparison[] {
  const byId = new Map(apiProducts.map((product) => [String(product.id), product]));
  return workbookRows.map((row) => {
    const api = byId.get(row.productId);
    const inference = inferGrMapping(row.internalName);
    const exactMetadata = api
      ? normalized(api.title) === normalized(row.title)
        && normalized(api.internal_name) === normalized(row.internalName)
        && normalizedMoney(api.price) === normalizedMoney(row.price)
      : false;
    const reason = !api
      ? "Provider Product ID was not present in the bounded API response."
      : !inference
        ? "Internal name does not match the reviewed GR naming grammar."
        : !exactMetadata
          ? "Provider Product ID matched but descriptive metadata differed."
          : null;
    return {
      workbookProductId: row.productId,
      apiProductIdMatch: Boolean(api),
      titleMatch: api ? normalized(api.title) === normalized(row.title) : null,
      internalNameMatch: api ? normalized(api.internal_name) === normalized(row.internalName) : null,
      priceMatch: api ? normalizedMoney(api.price) === normalizedMoney(row.price) : null,
      proposedBusinessContext: inference ? "push-button-systems" : null,
      proposedRole: inference?.role ?? null,
      proposedStep: inference?.step ?? null,
      proposedVariant: inference?.variant ?? null,
      confidence: reason ? (api && inference ? "medium" : "review_required") : "high",
      reviewRequiredReason: reason,
    };
  });
}

function inferGrMapping(internalName: string) {
  const value = normalized(internalName);
  if (value === "GR") return { role: "front_end" as const, step: 0, variant: null };
  const match = /^GR\s*->\s*(OB|OTO([1-9]\d*))(?:\s+DS([12]))?$/.exec(value);
  if (!match) return null;
  if (match[1] === "OB") return { role: "order_bump" as const, step: null, variant: null };
  return {
    role: "upsell" as const,
    step: Number(match[2]),
    variant: match[3] === "1" ? "discount-1" as const : match[3] === "2" ? "discount-2" as const : null,
  };
}

function normalized(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizedMoney(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "";
}
