"use client";

import * as React from "react";
import { Bell, CircleHelp, Command, LogOut, Palette, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { useIdentity } from "@/components/identity/identity-provider";
import { useShellDrawer } from "./shell-drawer";
import { runUserMenuSignOut, shouldShowDevelopmentIdentityNotice, userMenuContext, userMenuSignOutAction } from "@/lib/shell/user-menu-context";

type ProductionUserMenuProps = {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onBeforeOpen: () => void;
};

export function ProductionUserMenu({ open, onToggle, onClose, onBeforeOpen }: ProductionUserMenuProps) {
  const pathname = usePathname();
  const drawer = useShellDrawer();
  const { session, organizations, businessContexts, variant } = useIdentity();
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const firstItemRef = React.useRef<HTMLButtonElement | null>(null);
  const previousPathnameRef = React.useRef(pathname);
  const previousIdentityRef = React.useRef(session.identity.id);
  const previousOrganizationRef = React.useRef(session.activeOrganizationId);
  const previousBusinessContextRef = React.useRef(session.activeBusinessContextId);
  const requestClose = React.useCallback((restoreFocus = false) => {
    onClose();
    if (restoreFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, [onClose]);

  const context = userMenuContext(session, organizations, businessContexts, variant);
  const signOutAction = userMenuSignOutAction(session);

  React.useEffect(() => {
    if (!open) return;
    window.setTimeout(() => firstItemRef.current?.focus(), 0);
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) requestClose(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestClose(true);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, requestClose]);

  React.useEffect(() => {
    const changed = previousPathnameRef.current !== pathname
      || previousIdentityRef.current !== session.identity.id
      || previousOrganizationRef.current !== session.activeOrganizationId
      || previousBusinessContextRef.current !== session.activeBusinessContextId;
    if (open && changed) requestClose(false);
    previousPathnameRef.current = pathname;
    previousIdentityRef.current = session.identity.id;
    previousOrganizationRef.current = session.activeOrganizationId;
    previousBusinessContextRef.current = session.activeBusinessContextId;
  }, [open, pathname, requestClose, session.activeBusinessContextId, session.activeOrganizationId, session.identity.id]);

  function selectAction(title: string, description: string) {
    requestClose(false);
    openPlaceholder(title, description);
  }

  function openPlaceholder(title: string, description: string) {
    drawer.openDrawer(<div className="space-y-3"><p className="text-sm text-slate-700 dark:text-slate-200">{description}</p><div className="rounded-lg border bg-slate-50 p-3 text-xs text-slate-500 dark:border-white/10 dark:bg-white/5">Production Shell Phase 1 placeholder. No production account mutation occurs.</div></div>, title);
  }

  const actions = [
    { label: "Profile", icon: UserRound, description: "Profile management will be connected after production identity is approved." },
    { label: "Notifications", icon: Bell, description: "Notification preferences and history remain production placeholders in Phase 1." },
    { label: "Keyboard Shortcuts", icon: Command, description: "Use Command+K on macOS or Control+K elsewhere to open Universal Search." },
    { label: "Appearance / Theme", icon: Palette, description: "Appearance and Color Vision Optimized preferences will be connected in a later phase." },
    { label: "Help & Support", icon: CircleHelp, description: "Support entry points will be connected after account routing is approved." },
  ];

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) onBeforeOpen();
          onToggle();
        }}
        className="inline-flex h-10 items-center gap-2 rounded-xl border px-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open account menu"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/10"><UserRound className="h-4 w-4" /></span>
        <span className="hidden text-xs font-semibold sm:block">{session.identity.name.split(" ")[0]}</span>
      </button>
      {open ? (
        <div ref={menuRef} role="menu" aria-label="User and account menu" className="absolute right-0 top-12 z-50 max-h-[calc(100vh-5rem)] w-80 overflow-y-auto rounded-xl border bg-white p-3 shadow-2xl dark:border-white/10 dark:bg-ink">
          <div className="border-b pb-3 dark:border-white/10">
            <div className="text-sm font-semibold">{session.identity.name}</div>
            <div className="text-xs text-slate-500">{session.identity.email}</div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              <dt className="text-slate-500">Role</dt><dd className="text-right font-semibold">{context.role}</dd>
              <dt className="text-slate-500">Account type</dt><dd className="text-right font-semibold">{context.accountType}</dd>
              {variant === "product-admin" ? <><dt className="text-slate-500">Scope</dt><dd className="text-right font-semibold">{context.platformScope}</dd><dt className="text-slate-500">Product Admin role</dt><dd className="text-right font-semibold">{session.identity.title}</dd></> : null}
              {variant === "agency" ? <><dt className="text-slate-500">Active Agency</dt><dd className="text-right font-semibold">{context.activeAgency}</dd><dt className="text-slate-500">Active Client</dt><dd className="text-right font-semibold">{context.activeOrganization || "None selected"}</dd></> : null}
              {variant === "client" ? <><dt className="text-slate-500">Organization</dt><dd className="text-right font-semibold">{context.activeOrganization || "Unavailable"}</dd></> : null}
              {variant !== "product-admin" ? <><dt className="text-slate-500">Business Context</dt><dd className="text-right font-semibold">{context.activeBusinessContext || "None available"}</dd></> : null}
            </dl>
          </div>
          <div className="py-2">
            {actions.map((action, index) => {
              const Icon = action.icon;
              return <button key={action.label} ref={index === 0 ? firstItemRef : undefined} type="button" role="menuitem" onClick={() => selectAction(action.label, action.description)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:hover:bg-white/10"><Icon className="h-4 w-4 text-slate-500" /><span>{action.label}</span></button>;
            })}
            <button
              type="button"
              role="menuitem"
              onClick={() => runUserMenuSignOut(signOutAction, {
                closeMenu: () => requestClose(false),
                navigate: (href) => window.location.assign(href),
                openPlaceholder,
              })}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:hover:bg-white/10"
            >
              <LogOut className="h-4 w-4 text-slate-500" />
              <span>{signOutAction.label}</span>
            </button>
          </div>
          {shouldShowDevelopmentIdentityNotice(session) ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[10px] leading-4 text-amber-950">
              <strong className="block uppercase tracking-[.1em]">Development identity only</strong>
              Mock identity switching is isolated from the production account menu and is not production authentication.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
