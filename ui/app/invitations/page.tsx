import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveAuthenticatedPersistentIdentity } from "@/lib/identity/application-session";
import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";
export default async function PendingInvitationsPage() {
  const identity = await resolveAuthenticatedPersistentIdentity();
  if (!identity) redirect("/auth/sign-in?returnTo=%2Finvitations");
  if (!identity.emailVerified || identity.user.status !== "active") return <main className="p-8">Verify your intended email before reviewing invitations.</main>;
  const invitations = await new SupabaseIdentityTenancyRepository().pendingInvitationsForVerifiedEmail(identity.user.primaryEmail);
  return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Pending customer invitations</h1><p className="my-4">Review and explicitly accept an invitation to create your scoped customer access.</p>{invitations.length ? <ul>{invitations.map(invitation => <li key={invitation.id}><Link className="underline" href={`/invitations/${invitation.id}`}>Review customer invitation</Link></li>)}</ul> : <p>No pending, unexpired invitations match your verified email.</p>}</main>;
}
