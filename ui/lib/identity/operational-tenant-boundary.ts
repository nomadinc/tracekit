import type { Permission } from "./permissions";

export const OPERATIONAL_ACCESS_POLICY = {
  workItemRead: "organizations.view",
  workItemTransition: "actions.execute",
  notificationRead: "organizations.view",
  notificationUpdate: "actions.execute",
  auditRead: "audit_logs.view",
} as const satisfies Record<string, Permission>;

export const TENANT_HINT_KEYS = ["workspace_id", "workspaceId", "organization_id", "organizationId"] as const;
export const ACTOR_HINT_KEYS = ["actor_id", "actorId", "user_id", "userId"] as const;

export function callerHintsMatch(values: Record<string, unknown>, keys: readonly string[], expected: string) {
  return keys.every((key) => values[key] === undefined || values[key] === null || values[key] === expected);
}
