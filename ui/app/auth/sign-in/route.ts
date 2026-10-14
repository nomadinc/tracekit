import { getSignInUrl, getWorkOS } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { invitationState, invitationTokenFromUrl } from "@/lib/identity/invitation-onboarding";

export async function GET(request: Request) {
  try {
    const incoming = new URL(request.url);
    const token = invitationTokenFromUrl(incoming);
    if (token) {
      const invitation = await getWorkOS().userManagement.findInvitationByToken(token);
      if (invitation.organizationId !== null || !["pending", "accepted"].includes(invitation.state) || (invitation.state === "pending" && !(Date.parse(invitation.expiresAt) > Date.now()))) return NextResponse.json({ error: "Invitation unavailable." }, { status: 400 });
      // AuthKit 4.3.1 establishes PKCE, but does not forward invitation_token.
      const url = new URL(await getSignInUrl({ returnTo: "/invitations", loginHint: invitation.email, state: invitationState(invitation.id) }));
      // Accepted tokens must not be replayed into hosted signup.
      if (invitation.state === "pending") url.searchParams.set("invitation_token", token);
      const response = NextResponse.redirect(url);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    }
    const requested = incoming.searchParams.get("returnTo") || "/";
    const returnPathname = requested === "/invitations" || /^\/invitations\/[0-9a-f-]{36}$/.test(requested) ? requested : "/";
    return NextResponse.redirect(await getSignInUrl({ returnTo: returnPathname }));
  } catch {
    return NextResponse.json({ error: "Authentication is temporarily unavailable." }, { status: 503 });
  }
}
