import Link from "next/link";
import AppShell from "@/components/layout/app-shell";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import FirstAdminBootstrap from "./first-admin-bootstrap";

export async function AuthenticatedAppShell({ children }: { children: React.ReactNode }) {
  const resolution = await resolveApplicationSession();
  console.log(`TRACEKIT_SESSION_STATE=${resolution.kind}`);
  if (resolution.kind === "bootstrap" || resolution.kind === "no-membership") {
    console.log(`TRACEKIT_EMPTY_INSTALLATION=${resolution.kind === "bootstrap"}`);
  }
  if (resolution.kind === "provider-unavailable") return <SessionState title="Authentication unavailable" description="WorkOS and persistent identity configuration are required for authenticated TraceKit operation." />;
  if (resolution.kind === "unauthenticated") return <SessionState title="Sign in required" description="Authenticate to continue." signIn />;
  if (resolution.kind === "bootstrap") return <FirstAdminBootstrap />;
  if (resolution.kind === "no-membership") return <SessionState title="No TraceKit access" description="Your identity is verified, but no active TraceKit account membership is assigned." />;
  if (resolution.kind === "development") return <AppShell>{children}</AppShell>;
  return <AppShell initialSession={resolution.legacySession} organizations={resolution.session.availableOrganizations} businessContexts={resolution.session.accessibleBusinessContexts}>{children}</AppShell>;
}

function SessionState({ title, description, signIn = false }: { title: string; description: string; signIn?: boolean }) {
  return <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 p-6 text-center"><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">TraceKit identity</p><h1 className="text-2xl font-semibold">{title}</h1><p className="text-sm text-slate-600">{description}</p>{signIn ? <Link className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white" href="/auth/sign-in">Sign in</Link> : null}</main>;
}
