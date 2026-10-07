import "server-only";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { InvitationProviderRejected } from "./invitation-email-delivery";
export async function sendWorkOSInvitation(email: string, expiresInDays: number) {
  try { return await getWorkOS().userManagement.sendInvitation({ email, expiresInDays }); }
  catch (error) {
    const status = (error as { status?: number }).status;
    if ([400, 401, 403, 404, 422, 429].includes(status || 0)) throw new InvitationProviderRejected();
    throw new Error("WorkOS invitation outcome unknown");
  }
}
