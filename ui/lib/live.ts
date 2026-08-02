export const LIVE_WORKSPACE_UPDATE_EVENT = "tracekit:workspace-update";

export type LiveConnectionState = "disabled" | "connecting" | "live" | "reconnecting" | "offline" | "error";

export const LIVE_RECONNECT_MAX_ATTEMPTS = 5;

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

export function liveWorkspaceStreamUrl(cursor?: string | null) {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return `/api/events/stream${query ? `?${query}` : ""}`;
}

export function liveReconnectDelay(attempt: number, jitter = Math.floor(Math.random() * 300)) {
  return Math.min(30000, 1000 * Math.pow(2, Math.max(0, attempt - 1))) + jitter;
}

export function shouldReconnectLiveStream(attempt: number) {
  return attempt < LIVE_RECONNECT_MAX_ATTEMPTS;
}

export function isWorkspaceUpdate(value: unknown): value is WorkspaceUpdate {
  const update = value as WorkspaceUpdate;
  return Boolean(update && typeof update === "object" && update.id && update.cursor && update.workspaceId && update.type);
}
