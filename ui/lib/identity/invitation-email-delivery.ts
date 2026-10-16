export type DeliveryState = "prepared" | "sending" | "sent" | "failed" | "unknown" | "sign-in-required";
export type DeliveryClaim = { ok: boolean; id: string; email: string; expiresAt: string; state: DeliveryState; claimed: boolean; attemptId: string; canRetry?: boolean };
export type DeliveryOutcome = { state: DeliveryState; provider: "workos"; sendAccepted: boolean; mailboxDelivery: "unconfirmed"; canRetry: boolean };
type ProviderResult = { id: string; email: string; state: "pending" | "accepted" | "expired" | "revoked"; organizationId: string | null };
export class InvitationProviderRejected extends Error {}
export class InvitationExistingUser extends InvitationProviderRejected {}
/** Provider credentials, invitation tokens and provider error bodies never enter audit/client payloads. */
export async function completeInvitationDelivery(claim: DeliveryClaim, send: (email: string, days: number) => Promise<ProviderResult>, finish: (parameters: Record<string, unknown>) => Promise<unknown>): Promise<DeliveryOutcome> {
  let state = claim.state;
  if (claim.claimed) {
    let parameters: Record<string, unknown>;
    try {
      const days = Math.max(1, Math.min(7, Math.ceil((Date.parse(claim.expiresAt) - Date.now()) / 86400000)));
      const result = await send(claim.email, days);
      if (result.email.toLowerCase() !== claim.email.toLowerCase() || result.organizationId !== null || !result.id.startsWith("invitation_")) throw new Error("Invalid provider result");
      state = "sent";
      parameters = { p_state: state, p_provider_id: result.id, p_provider_state: result.state };
    } catch (error) {
      state = error instanceof InvitationExistingUser ? "sign-in-required" : error instanceof InvitationProviderRejected ? "failed" : "unknown";
      parameters = { p_state: state };
    }
    try { const acknowledgement = await finish({ p_operation: "finish", p_invitation_id: claim.id, p_attempt_id: claim.attemptId, ...parameters }); if (acknowledgement && typeof acknowledgement === "object" && "ok" in acknowledgement && acknowledgement.ok !== true) throw new Error("Delivery acknowledgement rejected"); }
    catch { console.error("invitation_delivery_acknowledgement_failed", { invitationId: claim.id, attemptId: claim.attemptId, providerSendAccepted: state === "sent" }); state = "unknown"; } // No resend when the send or its durable acknowledgement is ambiguous.
  }
  return { state, provider: "workos", sendAccepted: state === "sent", mailboxDelivery: "unconfirmed", canRetry: !claim.claimed && (claim.canRetry ?? ["prepared", "failed"].includes(state)) === true };
}

/** Log structured diagnostics only; never messages or provider response bodies. */
export function invitationProviderDiagnostics(error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = typeof value.code === "string" && /^[a-z][a-z_]{0,79}$/.test(value.code) ? value.code : null;
  const allowedFields = new Set(["email", "expires_in_days", "organization_id", "role_slug", "inviter_user_id", "locale"]);
  const fields = Array.isArray(value.errors) ? value.errors.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const field = (item as Record<string, unknown>).field;
    return typeof field === "string" && allowedFields.has(field) ? [field] : [];
  }) : [];
  return { code, fields: Array.from(new Set(fields)) };
}
