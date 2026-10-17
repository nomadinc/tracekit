import type { OrderSummary } from "./types";
export type OrderListResult = { kind: "loaded"; orders: OrderSummary[] } | { kind: "unavailable" };
export async function loadOrderList(read: () => Promise<OrderSummary[]>): Promise<OrderListResult> {
  try { return { kind: "loaded", orders: await read() }; }
  catch { return { kind: "unavailable" }; }
}
