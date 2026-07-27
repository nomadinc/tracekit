export type GlobalSearchResultType = "customer" | "order" | "work_item";

export type GlobalSearchResult = {
  id: string;
  type: GlobalSearchResultType;
  title: string;
  subtitle: string | null;
  meta: string | null;
  href: string;
  matched_by: string;
};

export type GlobalSearchResponse = {
  ok: boolean;
  workspace_id: string;
  query: string;
  min_query_length: number;
  limit: number;
  groups: {
    customers: GlobalSearchResult[];
    orders: GlobalSearchResult[];
    work_items: GlobalSearchResult[];
  };
  error?: string;
  message?: string;
};

export function globalSearchQuery(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return `/api/search${query ? `?${query}` : ""}`;
}
