import { InvitationAcceptance } from "./invitation-acceptance";
export default async function InvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Accept customer invitation</h1><p className="my-4">Sign in with the intended, verified email, then accept this invitation. Existing memberships are preserved.</p><a href={`/auth/sign-in?returnTo=${encodeURIComponent(`/invitations/${id}`)}`} className="underline">Sign in</a><InvitationAcceptance id={id} /></main>;
}
