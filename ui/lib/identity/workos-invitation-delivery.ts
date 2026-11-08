import "server-only";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { InvitationProviderRejected, type InvitationDeliveryContext } from "./invitation-email-delivery";

// A finite vocabulary prevents an arbitrary provider string being logged as a
// code. Unknown codes remain unrecognized; never fall back to message/rawData.
const PROVIDER_CODES = new Set([
  "user_already_exists", "invitation_already_exists", "invitation_not_found",
  "invitation_email_not_sent", "invalid_email", "email_not_allowed",
  "invalid_request", "invalid_request_parameters", "validation_error",
  "rate_limit_exceeded", "unauthorized", "forbidden", "not_found", "invalid_state",
  "invalid_client", "invalid_grant", "access_denied", "invalid_scope", "unauthorized_client",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_ID = /^(?:(?:request|req)_[0-9A-HJKMNP-TV-Z]{26}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
function ownValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  // Do not invoke unknown getters or serialize provider objects, even on errors.
  try { return Object.getOwnPropertyDescriptor(value, key)?.value; }
  catch { return undefined; }
}
function safeUuid(value: unknown) { return typeof value === "string" && UUID.test(value) ? value : undefined; }
export function workOSInvitationDiagnostic(error: unknown, context?: InvitationDeliveryContext) {
  const status = ownValue(error, "status");
  const code = ownValue(error, "code") ?? ownValue(error, "error");
  const requestID = ownValue(error, "requestID") ?? ownValue(error, "requestId");
  const invitationId = safeUuid(ownValue(context, "invitationId"));
  const attemptId = safeUuid(ownValue(context, "attemptId"));
  return {
    operation: "workos.invitation.send" as const,
    ...(typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599 ? { httpStatus: status } : {}),
    ...(typeof code === "string" ? { providerCode: PROVIDER_CODES.has(code) ? code : "unrecognized" } : {}),
    ...(typeof requestID === "string" && REQUEST_ID.test(requestID) ? { providerRequestId: requestID } : {}),
    ...(invitationId ? { invitationId } : {}),
    ...(attemptId ? { attemptId } : {}),
  };
}
export async function sendWorkOSInvitation(email: string, expiresInDays: number, context?: InvitationDeliveryContext) {
  try { return await getWorkOS().userManagement.sendInvitation({ email, expiresInDays }); }
  catch (error) {
    const diagnostic = workOSInvitationDiagnostic(error, context);
    // Logging failure cannot change the durable failed/unknown outcome.
    try { console.warn("workos_invitation_delivery_failed", diagnostic); } catch {}
    if ([400, 401, 403, 404, 422, 429].includes(diagnostic.httpStatus || 0)) throw new InvitationProviderRejected();
    throw new Error("WorkOS invitation outcome unknown");
  }
}
