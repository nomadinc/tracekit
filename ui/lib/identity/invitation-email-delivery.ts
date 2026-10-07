export type DeliveryState = "prepared" | "sending" | "sent" | "failed" | "unknown";
export type DeliveryClaim = { ok: boolean; id: string; email: string; expiresAt: string; state: DeliveryState; claimed: boolean; attemptId: string };
export type DeliveryOutcome = { state: DeliveryState; provider: "workos"; sendAccepted: boolean; mailboxDelivery: "unconfirmed" };
type ProviderResult = { id: string; email: string; state: "pending" | "accepted" | "expired" | "revoked"; organizationId: string | null };
export class InvitationProviderRejected extends Error {}
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
      state = error instanceof InvitationProviderRejected ? "failed" : "unknown";
      parameters = { p_state: state };
    }
    try { await finish({ p_operation: "finish", p_invitation_id: claim.id, p_attempt_id: claim.attemptId, ...parameters }); }
    catch { state = "unknown"; } // No resend when the send or its durable acknowledgement is ambiguous.
  }
  return { state, provider: "workos", sendAccepted: state === "sent", mailboxDelivery: "unconfirmed" };
}
