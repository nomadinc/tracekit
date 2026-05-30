import Link from "next/link";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  "https://tracekit-api.anthony-d15.workers.dev";

async function getOrder(platformOrderId: string) {
  const res = await fetch(
    `${API_BASE}/v1/platform-orders/detail?platform_order_id=${encodeURIComponent(
      platformOrderId,
    )}`,
    {
      cache: "no-store",
    },
  );

  if (!res.ok) {
    throw new Error("Failed to load order");
  }

  return res.json();
}

function formatMoney(n: number | null | undefined, currency?: string | null) {
  const cur = currency || "USD";
  const val = Number(n ?? 0);

  return val.toLocaleString("en-US", {
    style: "currency",
    currency: cur,
  });
}

export default async function OrderDetailPage({
  params,
}: {
  params: { platform_order_id: string };
}) {
  const platformOrderId = decodeURIComponent(params.platform_order_id);

  const data = await getOrder(platformOrderId);

  const order = data.order;

  if (!order) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Order Not Found</h1>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-500">
            Full Order Detail
          </div>

          <h1 className="text-2xl font-bold">
            {order.order_id}
          </h1>
        </div>

        <div className="flex gap-2">
          {order.identity_key ? (
            <Link
              href={`/customers/${encodeURIComponent(order.identity_key)}`}
              className="rounded border px-3 py-2 text-sm"
            >
              Customer
            </Link>
          ) : null}

          <Link
            href="/orders"
            className="rounded border px-3 py-2 text-sm"
          >
            Back to Orders
          </Link>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">Summary</h2>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-slate-500">Platform</div>
            <div>{order.platform}</div>
          </div>

          <div>
            <div className="text-slate-500">Status</div>
            <div>{order.status}</div>
          </div>

          <div>
            <div className="text-slate-500">Order Timestamp</div>
            <div>{order.order_ts}</div>
          </div>

          <div>
            <div className="text-slate-500">Currency</div>
            <div>{order.currency}</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">Customer</h2>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-slate-500">Email</div>
            <div>{order.customer_email || "—"}</div>
          </div>

          <div>
            <div className="text-slate-500">Phone</div>
            <div>{order.phone || "—"}</div>
          </div>

          <div className="col-span-2">
            <div className="text-slate-500">Identity Key</div>
            <div className="font-mono text-xs break-all">
              {order.identity_key || "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">Attribution</h2>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-slate-500">TKID</div>
            <div>{order.tkid || "—"}</div>
          </div>

          <div>
            <div className="text-slate-500">Everflow TID</div>
            <div className="break-all">
              {order.everflow_transaction_id || order.sub5 || "—"}
            </div>
          </div>

          <div>
            <div className="text-slate-500">Payment Transaction ID</div>
            <div className="break-all">
              {order.transaction_id || "—"}
            </div>
          </div>

          <div>
            <div className="text-slate-500">Affiliate ID</div>
            <div>{order.affiliate_id || "—"}</div>
          </div>

          <div>
            <div className="text-slate-500">Offer ID</div>
            <div>{order.everflow_offer_id || "—"}</div>
          </div>

          <div>
            <div className="text-slate-500">Source ID</div>
            <div>{order.source_id || "—"}</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">Financials</h2>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-slate-500">Gross Amount</div>
            <div>
              {formatMoney(order.gross_amount, order.currency)}
            </div>
          </div>

          <div>
            <div className="text-slate-500">Receipt Total</div>
            <div>
              {formatMoney(order.receipt_total, order.currency)}
            </div>
          </div>

          <div>
            <div className="text-slate-500">Product Subtotal</div>
            <div>
              {formatMoney(order.product_subtotal, order.currency)}
            </div>
          </div>

          <div>
            <div className="text-slate-500">Shipping Amount</div>
            <div>
              {formatMoney(order.shipping_amount, order.currency)}
            </div>
          </div>

          <div>
            <div className="text-slate-500">Tax Amount</div>
            <div>
              {formatMoney(order.tax_amount, order.currency)}
            </div>
          </div>

          <div>
            <div className="text-slate-500">Gateway Fee</div>
            <div>
              {formatMoney(order.gateway_fee, order.currency)}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">Raw Payload</h2>

        <pre className="max-h-[600px] overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          {JSON.stringify(order.raw_json, null, 2)}
        </pre>
      </div>
    </div>
  );
}