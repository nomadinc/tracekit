import { CommasClient } from "./client.ts";
import { runBoundedCommasDiscovery } from "./bounded-discovery.ts";
import { discoverCommasIdentifierSurface } from "./identifier-discovery.ts";
import { selectCommasDiscoveryAccount } from "./account-selection.ts";
import type { CommasTransaction } from "./types.ts";
import { probeCommasDisputeCollections } from "./dispute-discovery.ts";
import {
  summarizeCommasDiscovery,
} from "./discovery.ts";

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
};

type DiscoveryResource = "products" | "customers" | "transactions" | "bounded" | "identifiers" | "disputes";

async function main() {
  const resource = process.argv[2] as DiscoveryResource | undefined;
  if (!resource || !(["products", "customers", "transactions", "bounded", "identifiers", "disputes"] as string[]).includes(resource)) {
    throw new Error("Usage: npm run discover:commas -- products|customers|transactions|bounded|identifiers|disputes --account=small|main");
  }

  const selected = selectCommasDiscoveryAccount(process.argv.slice(3), process.env);

  const debug = process.env.COMMAS_DISCOVERY_DEBUG === "true";
  const client = new CommasClient({
      apiKey: selected.apiKey,
      baseUrl: process.env.COMMAS_BASE_URL,
      timeoutMs: 15_000,
      maxAttempts: 3,
    }, {
      discoveryDiagnostic: debug
        ? (event) => console.error(`[commas-discovery-debug] ${JSON.stringify(event)}`)
        : undefined,
    });
  if (resource === "bounded") {
    const summary = await runBoundedCommasDiscovery(client, {
      refundPageCap: boundedPositiveInteger("COMMAS_REFUND_SCAN_PAGE_CAP", process.env.COMMAS_REFUND_SCAN_PAGE_CAP, 10, 20),
    });
    console.log(JSON.stringify({ account: selected.account, ...summary }, null, 2));
    return;
  }
  if (resource === "identifiers") {
    const pageCap = boundedPositiveInteger("COMMAS_IDENTIFIER_SCAN_PAGE_CAP", process.env.COMMAS_IDENTIFIER_SCAN_PAGE_CAP, 5, 10);
    const transactions: CommasTransaction[] = [];
    let pagesScanned = 0;
    for (let page = 1; page <= pageCap; page += 1) {
      const result = await client.listTransactions({ page, perPage: 20 });
      pagesScanned = page;
      transactions.push(...result.items);
      const current = discoverCommasIdentifierSurface(transactions, { account: selected.account, pagesScanned, pageCap });
      if (current.externalAttributionIdentifiersObserved && current.disputeSurface.conclusion === "transaction_structure_observed") break;
      if (!result.pagination.hasMore) break;
    }
    console.log(JSON.stringify(discoverCommasIdentifierSurface(transactions, {
      account: selected.account,
      pagesScanned,
      pageCap,
    }), null, 2));
    return;
  }
  if (resource === "disputes") {
    console.log(JSON.stringify({
      account: selected.account,
      ...await probeCommasDisputeCollections({
        apiKey: selected.apiKey,
        baseUrl: process.env.COMMAS_BASE_URL,
      }),
    }, null, 2));
    return;
  }

  const page = resource === "products"
    ? await client.listProducts({ page: 1, perPage: 2 })
    : resource === "customers"
      ? await client.listCustomers({ page: 1, perPage: 2 })
      : await client.listTransactions({ page: 1, perPage: 2 });

  console.log(JSON.stringify({ account: selected.account, ...summarizeCommasDiscovery(resource, page) }, null, 2));
}

function boundedPositiveInteger(name: string, value: string | undefined, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > maximum) {
    throw new Error(`${name} must be an integer between 2 and ${maximum}.`);
  }
  return parsed;
}

main().catch((error) => {
  const safe = error && typeof error.toJSON === "function"
    ? error.toJSON()
    : { name: "DiscoveryError", message: "Commas discovery failed. See safe server diagnostics." };
  console.error(JSON.stringify(safe));
  process.exitCode = 1;
});
