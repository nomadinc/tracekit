import Link from "next/link";

type Props = { params: Promise<{ tkid: string }> };

/** TKID is an attribution identifier, not a canonical journey ID.
 * Until an authenticated deterministic resolver is available, fail closed.
 * Never use the legacy unscoped customer search endpoint. */
export default async function JourneyDeepLinkPage({ params }: Props) {
  const { tkid } = await params;
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">Customer Journey</h1>
      <section className="rounded-xl border p-5 space-y-3">
        <h2 className="font-semibold">Canonical Journey identity unresolved</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">This tracking identifier has not been verified against a tenant-scoped customer and canonical Journey. No customer, order, attribution or financial relationship has been inferred.</p>
        <p className="text-xs font-mono break-all">TKID: {tkid}</p>
        <Link href="/journeys" className="inline-block underline text-sm">Open Customer Explorer</Link>
      </section>
    </main>
  );
}
