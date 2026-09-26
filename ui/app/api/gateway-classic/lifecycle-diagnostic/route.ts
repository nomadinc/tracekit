import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError, requirePermission } from "@/lib/identity/authorization-gateway";
import {
  handleBlackboxLifecycleDiagnosticProxy,
  type LifecycleDiagnosticAuthorization,
} from "@/lib/gateway-classic/lifecycle-diagnostic-server";

async function authorizeDiagnosticOperator(): Promise<LifecycleDiagnosticAuthorization> {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") return { kind: "unauthenticated" };
  if (!resolution.session.activeOrganization) return { kind: "no_active_organization" };
  try {
    requirePermission(resolution.session, "connectors.manage");
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return { kind: "forbidden" };
    throw error;
  }
  // The active Organization authorizes this human operator. It does not assert
  // ownership of the allowlisted legacy NMI account, which belongs to the
  // future NH Discounts LLC tenant and remains intentionally unregistered.
  return { kind: "authorized", organizationId: resolution.session.activeOrganization.id };
}

function dependencies() {
  return {
    authorize: authorizeDiagnosticOperator,
    apiBaseUrl: String(process.env.TRACEKIT_API_BASE_URL || "").trim(),
    adminSecret: String(process.env.TK_SECRET_KEY || "").trim(),
  };
}

export async function POST(request: Request) {
  return handleBlackboxLifecycleDiagnosticProxy(request, dependencies());
}

export async function GET(request: Request) {
  return handleBlackboxLifecycleDiagnosticProxy(request, dependencies());
}
