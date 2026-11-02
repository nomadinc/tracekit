export type ProfitReportFilters = {
  from: string;
  to: string;
  currency: string;
  connector_id: string;
  platform: string;
  event_source: string;
};

export function validateProfitReportFilters(
  filters: ProfitReportFilters
): string | null {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value;
  };

  if (!validDate(filters.from) || !validDate(filters.to))
    return "Enter valid start and end dates.";

  if (filters.from > filters.to)
    return "Start date cannot be after end date.";

  if (filters.currency &&
      !/^[A-Z]{3}$/.test(filters.currency))
    return "Currency must be a three-letter ISO code.";

  for (const key of [
    "connector_id",
    "platform",
    "event_source",
  ] as const) {
    if (filters[key].length > 128 ||
        /[\u0000-\u001f]/.test(filters[key]))
      return `Invalid ${key} filter.`;
  }

  return null;
}

export function profitReportQuery(filters: ProfitReportFilters) {
  const params = new URLSearchParams();

  params.set("from", filters.from);
  params.set("to", filters.to);

  for (const key of [
    "currency",
    "connector_id",
    "platform",
    "event_source",
  ] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }

  return params.toString();
}
