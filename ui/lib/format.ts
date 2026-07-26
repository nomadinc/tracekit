export function formatCurrency(value: unknown, currency = "USD", options: Intl.NumberFormatOptions = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Not available";
  return numeric.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  });
}

export function formatInteger(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatPercent(value: unknown, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Not available";
  return `${numeric.toFixed(digits)}%`;
}

export function formatRelativeTime(value: unknown) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return "Unknown";
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatAbsoluteTime(value: unknown) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return "Unknown";
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
