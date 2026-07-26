export const LIVE_WORKSPACE_UPDATE_EVENT = "tracekit:workspace-update";

export type LiveConnectionState = "connecting" | "live" | "reconnecting" | "offline" | "error";

export type WorkspaceUpdate = {
  id: string;
  cursor: string;
  workspaceId: string;
  type:
    | "entity.changed"
    | "metric.changed"
    | "work_item.changed"
    | "notification.created"
    | "health.changed"
    | "activity.created"
    | "activity.updated";
  occurredAt: string;
  entity?: {
    type: string;
    id: string;
  };
  changedFields?: string[];
  metric?: {
    key: string;
    value?: number;
    delta?: number;
    currency?: string;
    invalidated?: boolean;
  };
  activityGroupId?: string;
  severity?: "info" | "success" | "warning" | "critical";
  payload?: Record<string, any>;
};

export function liveWorkspaceStreamUrl(workspaceId: string, cursor?: string | null) {
  const params = new URLSearchParams();
  params.set("workspace_id", workspaceId || "default");
  if (cursor) params.set("cursor", cursor);
  return `/api/events/stream?${params.toString()}`;
}

export function isWorkspaceUpdate(value: unknown): value is WorkspaceUpdate {
  const update = value as WorkspaceUpdate;
  return Boolean(update && typeof update === "object" && update.id && update.cursor && update.workspaceId && update.type);
}
