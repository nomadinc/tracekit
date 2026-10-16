import { tenantInvitationsEnabled } from "./tenant-invitation-feature";
import "server-only";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { InvitationProviderRejected, InvitationExistingUser, invitationProviderDiagnostics } from "./invitation-email-delivery";
export async function sendWorkOSInvitation(email: string, expiresInDays: number) {
  try { return await getWorkOS().userManagement.sendInvitation({ email, expiresInDays }); }
  catch (error) {
    const rawStatus = error && typeof error === "object" ? (error as { status?: unknown }).status : undefined;
    const status = typeof rawStatus === "number" && Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : undefined;
    if (tenantInvitationsEnabled() && status === 400 && invitationProviderDiagnostics(error).code === "user_already_exists") {
      console.info("workos_invitation_existing_identity", { outcome: "sign_in_required" });
      throw new InvitationExistingUser();
    }
    // Never log the provider error body: it can contain invitation tokens or credentials.
    console.error("workos_invitation_send_failed", { status: status ?? null, ...invitationProviderDiagnostics(error), outcome: [400, 401, 403, 404, 422, 429].includes(status || 0) ? "rejected" : "unknown" });

    if ([400, 401, 403, 404, 422, 429].includes(status || 0)) throw new InvitationProviderRejected();
    throw new Error("WorkOS invitation outcome unknown");
  }
}
