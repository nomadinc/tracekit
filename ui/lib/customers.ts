export type CustomerBadgeTone = "good" | "warn" | "bad" | "neutral";

export function formatCustomerTime(value: unknown) {
  const text = String(value || "").trim();
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return text || "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function formatCustomerDateRange(from: unknown, to: unknown) {
  const start = formatCustomerTime(from);
  const end = formatCustomerTime(to);
  if (start === end) return start;
  return `${start} - ${end}`;
}

export function formatCustomerMoney(amount: unknown, currency: unknown = "USD") {
  if (amount === null || amount === undefined || String(amount).trim() === "") return "-";
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return String(amount);
  const code = String(currency || "USD").trim() || "USD";
  try {
    return numeric.toLocaleString("en-US", { style: "currency", currency: code });
  } catch {
    return `${numeric.toFixed(2)} ${code}`;
  }
}

export function compactCustomerId(value: unknown) {
  const text = String(value || "").trim();
  if (text.length <= 18) return text || "-";
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

export function customerStatusTone(status: unknown): CustomerBadgeTone {
  const value = String(status || "").trim().toLowerCase();
  if (["resolved", "linked", "active", "completed", "attributed", "paid", "approved"].includes(value)) return "good";
  if (["under review", "partially linked", "pending", "draft", "unattributed"].includes(value)) return "warn";
  if (["unresolved", "failed", "chargeback", "refunded"].includes(value)) return "bad";
  return "neutral";
}

export function eventCategoryLabel(value: unknown) {
  const text = String(value || "").trim().replace(/_/g, " ");
  return text ? text.replace(/\b\w/g, (char) => char.toUpperCase()) : "Event";
}

export function redactCustomerEvidence(value: any, depth = 0): any {
  if (depth > 4) return "[redacted_nested_value]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => redactCustomerEvidence(item, depth + 1));
  const blocked = /token|secret|authorization|password|card|cvv|pan|credential|access[_-]?key|api[_-]?key|bearer/i;
  const redacted: Record<string, any> = {};
  for (const [key, nested] of Object.entries(value)) {
    redacted[key] = blocked.test(key) ? "[redacted]" : redactCustomerEvidence(nested, depth + 1);
  }
  return redacted;
}
