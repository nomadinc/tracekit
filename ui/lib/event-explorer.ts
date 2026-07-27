export type EventExplorerStatusTone = "good" | "warn" | "bad" | "neutral";

export function eventStatusTone(status: unknown): EventExplorerStatusTone {
  const value = String(status || "").trim().toLowerCase();
  if (["normalized", "attributed", "commissioned", "approved", "paid"].includes(value)) return "good";
  if (["pending", "processing", "review", "needs_review", "draft"].includes(value)) return "warn";
  if (["failed", "error", "invalid", "unsupported"].includes(value)) return "bad";
  return "neutral";
}

export function formatEventTime(value: unknown) {
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

export function formatEventMoney(amount: unknown, currency: unknown) {
  if (amount === null || amount === undefined || String(amount).trim() === "") return "";
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return String(amount);
  const code = String(currency || "USD").trim() || "USD";
  try {
    return numeric.toLocaleString("en-US", { style: "currency", currency: code });
  } catch {
    return `${numeric.toFixed(2)} ${code}`;
  }
}

export function compactEventId(value: unknown) {
  const text = String(value || "").trim();
  if (text.length <= 18) return text || "unknown";
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

export function eventPipelinePercent(timeline: unknown[]) {
  const rows = Array.isArray(timeline) ? timeline : [];
  if (!rows.length) return 0;
  const completed = rows.filter((stage: any) => String(stage?.status || "") === "complete").length;
  return Math.round((completed / rows.length) * 100);
}
