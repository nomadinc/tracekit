export default function AccessPendingPage() {
  return (
    <section className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-ink">
      <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">Identity & Access</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Access is being configured</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
        Your TraceKit membership is active, but there is not currently a workspace destination available within your assigned permissions. Contact your organization administrator to review your role or Business Context access.
      </p>
    </section>
  );
}
