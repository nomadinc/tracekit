import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError, requirePermission } from "@/lib/identity/authorization-gateway";
import { handleGatewayClassicProxy, type GatewayClassicAuthorization } from "@/lib/gateway-classic/server-proxy";

async function authorizeGatewayClassic(): Promise<GatewayClassicAuthorization> {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") return { kind: "unauthenticated" };
  if (!resolution.session.activeOrganization) return { kind: "forbidden" };
  try {
    requirePermission(resolution.session, "organizations.manage");
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return { kind: "forbidden" };
    throw error;
  }
  return { kind: "authorized", organizationId: resolution.session.activeOrganization.id };
}

function dependencies() {
  return {
    authorize: authorizeGatewayClassic,
    apiBaseUrl: String(process.env.TRACEKIT_API_BASE_URL || "http://127.0.0.1:8787").trim(),
    adminSecret: String(process.env.TK_SECRET_KEY || "").trim(),
  };
}

type Context = { params: Promise<{ operation: string }> };

export async function GET(request: Request, context: Context) {
  return handleGatewayClassicProxy(request, (await context.params).operation, dependencies());
}

export async function POST(request: Request, context: Context) {
  return handleGatewayClassicProxy(request, (await context.params).operation, dependencies());
}
