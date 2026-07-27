"use client";

import * as React from "react";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { InvestigationProvider } from "@/components/investigation/investigation-provider";
import { CommandProvider } from "@/components/shared/command-context";
import { LiveWorkspaceProvider } from "@/components/live/live-workspace-provider";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  const shell = (
    <div className="min-h-dvh bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block">
        <Sidebar />
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
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-72">
        <div className="sticky top-0 z-30">
          <Topbar onMenuClick={() => setMobileNavOpen(true)} />
        </div>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );

  return (
    <CommandProvider>
      <LiveWorkspaceProvider workspaceId="default">
        <React.Suspense fallback={shell}>
          <InvestigationProvider>{shell}</InvestigationProvider>
        </React.Suspense>
      </LiveWorkspaceProvider>
    </CommandProvider>
  );
}
