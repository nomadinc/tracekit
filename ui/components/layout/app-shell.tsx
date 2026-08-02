"use client";

import * as React from "react";
import { ProductionSidebar } from "@/components/layout/production-sidebar";
import { ProductionHeader } from "@/components/layout/production-header";
import { InvestigationProvider } from "@/components/investigation/investigation-provider";
import { CommandProvider } from "@/components/shared/command-context";
import { LiveWorkspaceProvider } from "@/components/live/live-workspace-provider";
import { IdentityProvider } from "@/components/identity/identity-provider";
import { ShellDrawerProvider } from "@/components/layout/shell-drawer";
import { ShellRouteBoundary } from "@/components/identity/shell-route-boundary";
import type { BusinessContext, IdentitySession, Organization } from "@/lib/identity/types";

export default function AppShell({ children, initialSession, organizations, businessContexts }: { children: React.ReactNode; initialSession?: IdentitySession; organizations?: Organization[]; businessContexts?: BusinessContext[] }) {
  return (
    <IdentityProvider initialSession={initialSession} persistentOrganizations={organizations} persistentBusinessContexts={businessContexts}>
      <CommandProvider>
        <LiveWorkspaceProvider enabled={false}>
          <ShellDrawerProvider>
            <React.Suspense fallback={<div className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm font-medium text-slate-600">Preparing TraceKit…</div>}>
              <InvestigationProvider><ShellFrame>{children}</ShellFrame></InvestigationProvider>
            </React.Suspense>
          </ShellDrawerProvider>
        </LiveWorkspaceProvider>
      </CommandProvider>
    </IdentityProvider>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block">
        <ProductionSidebar />
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0">
            <ProductionSidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-72">
        <div className="sticky top-0 z-30">
          <ProductionHeader onMenuClick={() => setMobileNavOpen(true)} />
        </div>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          <ShellRouteBoundary>{children}</ShellRouteBoundary>
        </main>
      </div>
    </div>
  );
}
