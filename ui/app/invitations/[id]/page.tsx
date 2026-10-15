import Link from "next/link";
import { InvitationAcceptance } from "./invitation-acceptance";
export default async function InvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Accept invitation</h1><p className="my-4">Sign in with the intended, verified email, then accept this invitation. You only need to accept once.</p><div className="flex flex-wrap gap-4"><a href={`/auth/sign-in?returnTo=${encodeURIComponent(`/invitations/${id}`)}`} className="underline">Sign in to accept</a><Link href="/" className="underline">Already accepted? Open TraceKit</Link></div><InvitationAcceptance id={id} /></main>;
}
