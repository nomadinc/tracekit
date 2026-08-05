import { CommasProviderError } from "./errors.ts";
import {
  compareProductAndService,
  compareTransactionListAndDetail,
  summarizeNestedTransactions,
  summarizeObservedProducts,
  summarizeTwoPageTraversal,
} from "./discovery.ts";
import type { CommasClient } from "./client.ts";
import type { CommasTransaction } from "./types.ts";

export async function runBoundedCommasDiscovery(client: CommasClient, options: { refundPageCap?: number } = {}) {
  const refundPageCap = boundedPositiveInteger(options.refundPageCap, 10, 20);
  // Authentication/list errors deliberately propagate: these are required discovery capabilities.
  const customerPage1 = await client.listCustomers({ page: 1, perPage: 2 });
  const customerPage2 = await client.listCustomers({ page: 2, perPage: 2 });
  const transactionPage1 = await client.listTransactions({ page: 1, perPage: 2 });
  const transactionPage2 = await client.listTransactions({ page: 2, perPage: 2 });
  const boundedTransactions = [...transactionPage1.items, ...transactionPage2.items];

  let refundFoundOnPage: number | null = null;
  let refundObservation: ReturnType<typeof summarizeNestedTransactions>["refundItem"] = [];
  let lastRefundPageScanned = 2;
  const scannedTransactions: CommasTransaction[] = [...boundedTransactions];
  const initialRefund = summarizeNestedTransactions(scannedTransactions).refundItem;
  if (initialRefund.length > 0) {
    refundFoundOnPage = transactionPage1.items.some((item) => Array.isArray(item.refunds) && item.refunds.length > 0) ? 1 : 2;
    refundObservation = initialRefund;
  } else {
    for (let page = 3; page <= refundPageCap; page += 1) {
      const result = await client.listTransactions({ page, perPage: 2 });
      lastRefundPageScanned = page;
      scannedTransactions.push(...result.items);
      const observation = summarizeNestedTransactions(result.items).refundItem;
      if (observation.length > 0) {
        refundFoundOnPage = page;
        refundObservation = observation;
        break;
      }
      if (!result.pagination.hasMore) break;
    }
  }

  const firstTransaction = transactionPage1.items[0];
  let transactionDetail: Record<string, unknown> = { status: "not_attempted_no_list_record" };
  if (firstTransaction) {
    try {
      // This is intentionally the top-level transaction-list id. servicePayment.id is not
      // substituted: Commas documentation does not establish it as the detail identifier.
      const detail = await client.getTransaction(String(firstTransaction.id));
      transactionDetail = {
        status: "available",
        identifierSource: "transaction_list.id",
        identifierScalarType: typeof firstTransaction.id,
        comparison: compareTransactionListAndDetail(firstTransaction, detail.item),
      };
    } catch (error) {
      if (!(error instanceof CommasProviderError)) throw error;
      transactionDetail = {
        status: error.status === 500 ? "unavailable_provider_500" : "unavailable_provider_error",
        identifierSource: "transaction_list.id",
        identifierScalarType: typeof firstTransaction.id,
        httpStatus: error.status,
        providerRequestIdPresent: Boolean(error.providerRequestId),
        retryable: error.retryable,
      };
    }
  }

  return {
    mode: "bounded-schema-only",
    customers: summarizeTwoPageTraversal("customers", customerPage1, customerPage2),
    transactions: summarizeTwoPageTraversal("transactions", transactionPage1, transactionPage2),
    nestedTransactionSchema: summarizeNestedTransactions(boundedTransactions),
    observedProducts: summarizeObservedProducts(boundedTransactions),
    productServiceComparison: compareProductAndService(boundedTransactions),
    servicePaymentCandidateFields: summarizeNestedTransactions(boundedTransactions).servicePayment,
    refundScan: {
      pageCap: refundPageCap,
      stoppedAtPage: refundFoundOnPage ?? lastRefundPageScanned,
      found: refundFoundOnPage !== null,
      foundOnPage: refundFoundOnPage,
      fields: refundObservation,
    },
    transaction_detail: transactionDetail,
  };
}

function boundedPositiveInteger(value: number | undefined, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 2 || value > maximum) {
    throw new Error(`refundPageCap must be an integer between 2 and ${maximum}.`);
  }
  return value;
}
