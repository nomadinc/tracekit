import { requireResourceScope } from "./authorization-gateway";
import type { TraceKitSessionContext } from "./persistent-types";

export const CUSTOMER_INVITATION_ROLE = "client-read-only";

export function authorizeCustomerInvitation(session: TraceKitSessionContext, input: {
  organizationId: string; role: string; intendedEmail: string; businessContextIds: string[];
}) {
  requireResourceScope(session, input.organizationId, "users.invite");
  if (input.role !== CUSTOMER_INVITATION_ROLE) throw new Error("Unsupported customer role.");
  const email = input.intendedEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Invalid intended email.");
  const contexts = Array.from(new Set(input.businessContextIds));
  if (!contexts.length || contexts.some(id => !session.accessibleBusinessContexts.some(context => context.id === id && context.organizationId === input.organizationId))) throw new Error("Unavailable business context.");
  return { ...input, intendedEmail: email, businessContextIds: contexts };
}
