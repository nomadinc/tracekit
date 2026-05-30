"use client";

import Link from "next/link";
import { useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  "https://tracekit-api.anthony-d15.workers.dev";

export default function CustomersPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  async function runSearch() {
    const search = q.trim();
    if (!search) return;

    setLoading(true);

    try {
      const res = await fetch(
        `${API_BASE}/v1/customers/search?q=${encodeURIComponent(search)}`
      );

      const json = await res.json();

      setResults(json.results || []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Customer Search</h1>

        <p className="text-slate-500 mt-1">
          Search by email, phone, order ID, transaction ID, Everflow TID,
          TKID, or tracking number.
        </p>
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex gap-3">
          <input
            className="flex-1 rounded border px-3 py-2"
            placeholder="Search customer..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch();
            }}
          />

          <button
            onClick={runSearch}
            className="rounded bg-blue-600 px-4 py-2 text-white"
          >
            Search
          </button>
        </div>
      </div>

      {loading && (
        <div className="rounded-lg border p-6">
          Searching...
        </div>
      )}

      {!loading &&
        results.map((row) => {
          const customer = row.customer;

          return (
            <div
              key={row.identity_key}
              className="rounded-lg border p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-lg">
                    {customer?.primary_email || row.identity_key}
                  </div>

                  <div className="text-sm text-slate-500 mt-1">
                    {row.identity_key}
                  </div>
                </div>

                <Link
                  href={`/customers/${encodeURIComponent(row.identity_key)}`}
                  className="rounded border px-3 py-2 text-sm"
                >
                  Open Customer
                </Link>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-slate-500">Orders</div>
                  <div className="font-semibold">
                    {customer?.order_count ?? 0}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500">Revenue</div>
                  <div className="font-semibold">
                    $
                    {Number(
                      customer?.lifetime_revenue || 0
                    ).toFixed(2)}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500">Latest Order</div>
                  <div className="font-semibold">
                    {row.latest_order_id || "—"}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500">Matches</div>
                  <div className="font-semibold">
                    {row.match_count}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}