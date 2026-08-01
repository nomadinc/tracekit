"use client";

import * as React from "react";
import { Bell, Bot, Building2, Menu, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { CommandPaletteButton, CommandPaletteDialog, useCommandPaletteController } from "@/components/shared/command-palette";
import { useIdentity } from "@/components/identity/identity-provider";
import { useShellDrawer } from "./shell-drawer";
import { ProductionUserMenu } from "./production-user-menu";
import { pageChromeForPath } from "@/lib/app-navigation";

function SelectLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="hidden min-w-0 md:block"><span className="block text-[8px] font-semibold uppercase tracking-[.12em] text-slate-400">{label}</span>{children}</label>;
}

export function ProductionHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const chrome = pageChromeForPath(pathname);
  const drawer = useShellDrawer();
  const { session, organizations, businessContexts, variant, setActiveOrganization, setActiveBusinessContext } = useIdentity();
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const closeUserMenu = React.useCallback(() => setUserMenuOpen(false), []);
  const command = useCommandPaletteController(closeUserMenu);

  return (
    <header className="border-b bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-ink/90">
      <div className="flex min-h-16 items-center gap-3 px-4 lg:px-6">
        <button type="button" onClick={onMenuClick} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border focus:outline-none focus:ring-2 focus:ring-slate-400 lg:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-slate-400">{variant === "product-admin" ? "Platform Operations" : variant === "agency" ? session.identity.membership.accountName : organizations[0]?.name || "Organization unavailable"}</div>
          <div className="mt-0.5 flex items-end gap-3"><h1 className="truncate text-xl font-semibold tracking-tight">{chrome.title}</h1><p className="hidden truncate pb-0.5 text-xs text-slate-500 xl:block">{chrome.description}</p></div>
        </div>
        <div className="hidden min-w-[260px] max-w-sm flex-1 xl:block"><CommandPaletteButton onOpen={command.openPalette} className="inline-flex h-10 w-full items-center gap-2 rounded-xl border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 dark:bg-white/5" /></div>
        {variant !== "product-admin" ? (
          <div className="hidden items-center gap-2 lg:flex">
            {organizations.length > 1 ? <SelectLabel label={variant === "agency" ? "Client Organization" : "Organization"}><select value={session.activeOrganizationId || ""} onChange={(event) => setActiveOrganization(event.target.value)} className="mt-0.5 h-9 max-w-[180px] rounded-lg border bg-white px-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-ink"><option value="" disabled>Select Organization</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></SelectLabel> : <div className="hidden items-center gap-2 rounded-lg border px-3 py-2 text-xs lg:flex"><Building2 className="h-3.5 w-3.5" /><span><span className="block text-[8px] uppercase text-slate-400">Active Organization</span><strong>{organizations[0]?.name || "Unavailable"}</strong></span></div>}
            <SelectLabel label="Business Context"><select value={session.activeBusinessContextId || ""} onChange={(event) => setActiveBusinessContext(event.target.value)} className="mt-0.5 h-9 max-w-[190px] rounded-lg border bg-white px-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-ink" disabled={!businessContexts.length}><option value="">{businessContexts.length ? "Select Business Context" : "No accessible Offers"}</option>{businessContexts.map((context) => <option key={context.id} value={context.id}>{context.name}</option>)}</select></SelectLabel>
          </div>
        ) : <div className="hidden items-center gap-2 rounded-lg border px-3 py-2 text-xs lg:flex"><ShieldCheck className="h-3.5 w-3.5" /><span><span className="block text-[8px] uppercase text-slate-400">Scope</span><strong>TraceKit Platform</strong></span></div>}
        <button type="button" onClick={() => drawer.openDrawer(<div className="space-y-4"><p className="text-sm">MCP Chat is a reactive Core entry point. Phase 1 provides shell infrastructure only.</p><div className="rounded-lg border bg-slate-50 p-3 text-xs">Ask about the active Organization and Business Context after the production identity boundary is approved.</div></div>, "MCP Chat")} className="hidden h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold sm:inline-flex focus:outline-none focus:ring-2 focus:ring-slate-400"><Bot className="h-4 w-4" />MCP</button>
        <button type="button" onClick={() => drawer.openDrawer(<div className="rounded-lg border bg-slate-50 p-4 text-sm">No production notifications are wired in Phase 1.</div>, "Notifications")} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border focus:outline-none focus:ring-2 focus:ring-slate-400" aria-label="Open notifications"><Bell className="h-4 w-4" /></button>
        <ProductionUserMenu open={userMenuOpen} onToggle={() => setUserMenuOpen((value) => !value)} onClose={closeUserMenu} onBeforeOpen={() => command.closePalette(false)} />
      </div>
      <div className="border-t px-4 py-3 dark:border-white/10 xl:hidden"><CommandPaletteButton onOpen={command.openPalette} compact className="inline-flex h-10 w-full items-center gap-2 rounded-xl border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 dark:bg-white/5" /></div>
      <CommandPaletteDialog open={command.open} onClose={command.closePalette} />
    </header>
  );
}
