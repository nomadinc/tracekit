export type EntityType = "customer" | "order" | "journey" | "work_item";

export type EntityStatus = {
  label: string;
  tone: "success" | "warning" | "critical" | "info" | "neutral";
};

export type EntityPreview = {
  type: EntityType;
  id: string;
  title: string;
  subtitle: string | null;
  statuses: EntityStatus[];
  metrics: Array<{ label: string; value: string | number | null; unit?: string | null }>;
  identifiers: Array<{ label: string; value: string }>;
  related_entities: Array<{
    type: EntityType;
    id: string;
    label: string;
    subtitle?: string | null;
    href: string;
  }>;
  explanation: null | {
    title: string;
    summary: string;
    statements?: Array<{ id: string; text: string }>;
    recommended_review_steps?: string[];
  };
  recent_activity: Array<{
    id: string;
    title: string;
    summary: string | null;
    occurred_at: string | null;
    entity?: {
      type: EntityType;
      id: string;
      label: string;
      subtitle?: string | null;
      href: string;
    } | null;
  }>;
  actions: Array<{
    id: string;
    label: string;
    kind: "link" | "copy" | "work_item_action";
    href?: string | null;
    value?: string | null;
    action?: string | null;
    safe: boolean;
  }>;
  full_page_link: string;
  sections: Array<{ id: string; title: string; items: Array<{ label: string; value: unknown }> }>;
};

export type EntityPreviewResponse = {
  ok: boolean;
  workspace_id: string;
  entity: EntityPreview;
  limits?: Record<string, number>;
  error?: string;
  message?: string;
};

export type InvestigationTarget = {
  type: EntityType;
  id: string;
  label?: string;
  query?: Record<string, string>;
};

export function entityTypeLabel(type: EntityType) {
  if (type === "work_item") return "Work Item";
  return type.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function entityPreviewQuery(target: InvestigationTarget, workspaceId = "default") {
  const params = new URLSearchParams({ workspace_id: workspaceId });
  for (const [key, value] of Object.entries(target.query || {})) {
    if (value) params.set(key, value);
  }
  return `/api/entities/${target.type}/${encodeURIComponent(target.id)}/preview?${params.toString()}`;
}

export function fullPageHrefForEntity(target: InvestigationTarget, workspaceId = "default") {
  if (target.type === "customer") return `/customers/${encodeURIComponent(target.id)}?workspace_id=${encodeURIComponent(workspaceId)}`;
  if (target.type === "order") return `/orders/${encodeURIComponent(target.id)}?workspace_id=${encodeURIComponent(workspaceId)}`;
  if (target.type === "journey") return `/journeys/${encodeURIComponent(target.id)}?workspace_id=${encodeURIComponent(workspaceId)}`;
  return `/operations?workspace_id=${encodeURIComponent(workspaceId)}&inspect=work_item:${encodeURIComponent(target.id)}`;
}

export function inspectValue(target: InvestigationTarget) {
  return `${target.type}:${target.id}`;
}

export function parseInspectValue(value: string | null): InvestigationTarget | null {
  const text = String(value || "").trim();
  const separator = text.indexOf(":");
  if (separator <= 0) return null;
  const type = text.slice(0, separator) as EntityType;
  const id = text.slice(separator + 1);
  if (!["customer", "order", "journey", "work_item"].includes(type) || !id) return null;
  return { type, id };
}
