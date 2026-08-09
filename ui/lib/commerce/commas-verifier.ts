import "server-only";
import type { CommerceConnectionVerifier } from "./control-plane";

export class BoundedCommasConnectionVerifier implements CommerceConnectionVerifier {
  async verify(input: { provider: string; environment: string; secret: string; correlationId: string }) {
    if (input.provider !== "commas") throw new Error("Provider verification is unavailable.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch("https://www.fanbasis.com/public-api/customers?page=1&per_page=1", { method: "GET", cache: "no-store", signal: controller.signal, headers: { "x-api-key": input.secret, Accept: "application/json", "x-correlation-id": input.correlationId } });
      if (!response.ok) throw new Error("Provider verification failed.");
      await response.json().catch(() => { throw new Error("Provider verification returned an invalid response."); });
      const remaining = response.headers.get("x-ratelimit-remaining");
      return {
        capabilities: ["customers.read", "transactions.read", "pagination.page_number"],
        providerStatus: response.status,
        providerRequestIdPresent: Boolean(response.headers.get("x-request-id") || response.headers.get("request-id")),
        rateLimitRemaining: remaining && /^\d+$/.test(remaining) ? Number(remaining) : null,
      };
    } finally { clearTimeout(timeout); }
  }
}
