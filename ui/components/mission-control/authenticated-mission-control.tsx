import Link from "next/link";
import AppShell from "@/components/layout/app-shell";
import FirstAdminBootstrap from "@/components/identity/first-admin-bootstrap";
import { MissionControl } from "./mission-control";
import { missionControlRepository } from "@/lib/mission-control/mock-repository";
import { readMissionControlPortfolio } from "@/lib/mission-control/production-portfolio";
import { resolveApplicationSession } from "@/lib/identity/application-session";

export async function AuthenticatedMissionControl() {
  const resolution = await resolveApplicationSession();
  const snapshot = await missionControlRepository.getMissionControl();

  if (resolution.kind === "provider-unavailable")
    return <SessionState title="Authentication unavailable" description="WorkOS and persistent identity configuration are required for authenticated TraceKit operation." />;
  if (resolution.kind === "unauthenticated")
    return <SessionState title="Sign in required" description="Authenticate to continue." signIn />;
  if (resolution.kind === "bootstrap") return <FirstAdminBootstrap />;
  if (resolution.kind === "no-membership")
    return <SessionState title="No TraceKit access" description="Your identity is verified, but no active TraceKit account membership is assigned." />;

  if (resolution.kind === "development") {
    return (
      <AppShell>
        <MissionControl snapshot={snapshot} portfolio={null} />
      </AppShell>
    );
  }

  const portfolio = await readMissionControlPortfolio(resolution.session).catch(() => null);
  return (
    <AppShell
      initialSession={resolution.legacySession}
      organizations={resolution.session.availableOrganizations}
      businessContexts={resolution.session.accessibleBusinessContexts}
    >
      <MissionControl snapshot={snapshot} portfolio={portfolio} />
    </AppShell>
  );
}

function SessionState({
  title,
  description,
  signIn = false,
}: {
  title: string;
  description: string;
  signIn?: boolean;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">TraceKit identity</p>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-slate-400">{description}</p>
      {signIn ? (
        <Link className="tk-primary-action rounded-lg px-4 py-2 text-sm" href="/auth/sign-in">
          Sign in
        </Link>
      ) : null}
    </main>
  );
}
