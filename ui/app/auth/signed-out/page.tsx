import Link from "next/link";

export default function SignedOutPage() {
  return <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 p-6 text-center"><h1 className="text-2xl font-semibold">You are signed out</h1><p className="text-sm text-slate-600">Your TraceKit session has ended.</p><Link className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white" href="/auth/sign-in">Sign in</Link></main>;
}
