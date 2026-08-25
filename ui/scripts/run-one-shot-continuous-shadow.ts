import { randomUUID } from "node:crypto";

const connectionFlag = process.argv.find((value) => value.startsWith("--connection-id="));
const connectionId = connectionFlag?.slice("--connection-id=".length);
const confirmed = process.argv.includes("--confirm-one-shot-continuous-shadow");
const expectedConnection = "ea1c2313-6120-4692-84c5-ec3562e7dcf6";
if (!confirmed) throw new Error("One-shot shadow dispatch requires --confirm-one-shot-continuous-shadow.");
if (connectionId !== expectedConnection) throw new Error(`This acceptance command requires --connection-id=${expectedConnection}.`);
const apiBase = String(process.env.TRACEKIT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
const secret = String(process.env.TK_SECRET_KEY || "");
if (!apiBase || !secret) throw new Error("TRACEKIT_API_BASE_URL (or NEXT_PUBLIC_API_BASE_URL) and TK_SECRET_KEY are required.");
const requestKey = randomUUID();
const response = await fetch(`${apiBase}/internal/commerce/one-shot-shadow`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-tk-secret": secret },
  body: JSON.stringify({ confirmation: "one-shot-continuous-shadow", connection_id: connectionId, resource: "transactions", mode: "continuous", max_pages: 8, per_page: 100, request_key: requestKey }),
});
const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
console.log(JSON.stringify({ ok: response.ok, status: response.status, status_code: payload.status ?? null, run_id: payload.run_id ?? null, dispatch_source: payload.dispatch_source ?? null, acceptance_cycle: payload.acceptance_cycle ?? null, max_pages: payload.max_pages ?? null, per_page: payload.per_page ?? null, request_key: response.ok ? requestKey : null }));
if (!response.ok) process.exitCode = 1;
