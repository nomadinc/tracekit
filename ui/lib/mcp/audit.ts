import type { Permission } from "@/lib/identity/permissions";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import type { AuditEventInput, IdentityTenancyRepository } from "@/lib/identity/persistent-repository";

export type McpAuditResult = AuditEventInput["result"];

export async function recordMcpToolAudit(input: {
  repository: Pick<IdentityTenancyRepository, "recordAuditEvent">;
  session: TraceKitSessionContext;
  tool: string;
  result: McpAuditResult;
  permission?: Permission | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { repository, session } = input;
  await repository.recordAuditEvent({
    actorUserId: session.user.id,
    authenticatedIdentityId: session.externalWorkosUserId,
    accountId: session.activeAccount.id,
    organizationId: session.activeOrganization?.id ?? null,
    action: `mcp.tool.${input.tool}`,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    result: input.result,
    permissionEvaluated: input.permission ?? null,
    correlationId: session.correlationId,
    metadata: {
      toolVersion: 1,
      ...(input.metadata || {}),
    },
  });
}
