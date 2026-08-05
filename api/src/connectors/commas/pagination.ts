import { CommasValidationError } from "./errors.ts";
import type { CommasJsonObject, CommasPagination, CommasResponseShape } from "./types.ts";

function object(value: unknown): CommasJsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as CommasJsonObject : null;
}

function finiteNumber(value: unknown): number | null {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const result = finiteNumber(value);
    if (result !== null) return result;
  }
  return null;
}

export function validateCommasPageNumber(value: unknown, field: "page" | "per_page") {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  const maximum = field === "per_page" ? 100 : Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new CommasValidationError({
      kind: "validation",
      message: `${field} must be an integer between 1 and ${maximum}.`,
      status: 400,
      retryable: false,
      resource: "request",
      correlationId: "configuration",
    });
  }
  return parsed;
}

export function parseCommasPage<T>(body: unknown, itemKeys: readonly string[], requestedPage: number): {
  items: T[];
  pagination: CommasPagination;
  shape: CommasResponseShape;
} {
  const root = object(body);
  if (!root) throw malformedResponse();
  const data = root.data;
  const dataObject = object(data);

  let items: unknown[] | null = Array.isArray(data) ? data : null;
  if (!items && dataObject) {
    for (const key of [...itemKeys, "data"]) {
      if (Array.isArray(dataObject[key])) {
        items = dataObject[key] as unknown[];
        break;
      }
    }
  }
  if (!items) throw malformedResponse();
  if (items.some((item) => {
    const candidate = object(item);
    return !candidate || candidate.id === undefined || candidate.id === null || String(candidate.id).trim() === "";
  })) throw malformedResponse();

  const pagination = object(dataObject?.pagination) || object(root.pagination) || object(root.meta) || dataObject || {};
  const currentPage = firstNumber(pagination.current_page, pagination.currentPage, requestedPage) ?? requestedPage;
  const perPage = firstNumber(pagination.per_page, pagination.perPage);
  const totalPages = firstNumber(pagination.total_pages, pagination.last_page, pagination.totalPages);
  const totalItems = firstNumber(pagination.total_items, pagination.total, pagination.totalItems);
  const explicitHasMore = pagination.has_more ?? pagination.has_next_page ?? pagination.hasMore;
  const hasMore = typeof explicitHasMore === "boolean"
    ? explicitHasMore
    : totalPages !== null
      ? currentPage < totalPages
      : Boolean(pagination.next_page_url ?? pagination.nextPageUrl);

  const firstItem = items.map(object).find(Boolean);
  return {
    items: items as T[],
    pagination: {
      currentPage,
      perPage,
      totalPages,
      totalItems,
      hasMore,
      nextPage: hasMore ? currentPage + 1 : null,
    },
    shape: {
      topLevelKeys: Object.keys(root).sort(),
      dataKeys: dataObject ? Object.keys(dataObject).sort() : [],
      itemKeys: firstItem ? Object.keys(firstItem).sort() : [],
    },
  };
}

export function parseCommasObject<T>(body: unknown): { item: T; shape: CommasResponseShape } {
  const root = object(body);
  const item = object(root?.data);
  if (!root || !item || item.id === undefined || item.id === null) throw malformedResponse();
  return {
    item: item as T,
    shape: {
      topLevelKeys: Object.keys(root).sort(),
      dataKeys: Object.keys(item).sort(),
      itemKeys: Object.keys(item).sort(),
    },
  };
}

function malformedResponse() {
  return new CommasValidationError({
    kind: "validation",
    message: "Commas returned an unsupported response shape.",
    status: 502,
    retryable: false,
    resource: "response",
    correlationId: "response-validation",
  });
}
