"use client";

import * as React from "react";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useIdentity } from "@/components/identity/identity-provider";
import { effectivePermissions } from "@/lib/identity/authorization";
import {
  admitOwnedDrawer,
  admitLeasedDrawer,
  closeOwnedDrawer,
  visibleOwnedDrawer,
  type DrawerOwnerLease,
} from "@/lib/identity/drawer-ownership";

type ShellDrawerContextValue = {
  openDrawer: (
    content: React.ReactNode,
    title: string,
    options?: { onDismiss?: () => void; owner?: string; lease?: DrawerOwnerLease },
  ) => void;
  closeDrawer: (owner?: string) => void;
};

const ShellDrawerContext = React.createContext<ShellDrawerContextValue | null>(
  null,
);

export function ShellDrawerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { session } = useIdentity();
  const contextKey = JSON.stringify({
    pathname,
    authenticated: session.authenticated,
    identityId: session.identity.id,
    membershipId: session.identity.membership.id,
    organizationId: session.activeOrganizationId,
    businessContextId: session.activeBusinessContextId,
    allowedOrganizations: [
      ...session.identity.membership.organizationIds
    ].sort(),
    permissions: Array.from(effectivePermissions(session.identity)).sort(),
  });

  const activeContextRef = React.useRef(contextKey);
  activeContextRef.current = contextKey;

  type DrawerValue = {
    title: string;
    content: React.ReactNode;
    onDismiss?: () => void;
  };

  const [storedDrawer, setDrawer] =
    React.useState<import("@/lib/identity/drawer-ownership").OwnedDrawer<DrawerValue> | null>(null);

  const drawer = visibleOwnedDrawer(storedDrawer, contextKey);

  const dismissDrawer = React.useCallback(() => {
    if (!drawer) return;
    setDrawer((current) =>
      current === drawer ? null : current
    );
    drawer.value.onDismiss?.();
  }, [drawer]);

  React.useEffect(() => {
    setDrawer((current) =>
      current && current.contextKey !== contextKey ? null : current
    );
  }, [contextKey]);

  React.useEffect(() => {
    if (!drawer) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismissDrawer();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismissDrawer, drawer]);
  const value = React.useMemo(
    () => ({
      openDrawer: (
        content: React.ReactNode,
        title: string,
        options?: { onDismiss?: () => void; owner?: string; lease?: DrawerOwnerLease },
      ) => {
        setDrawer((current) => {
          const value = {
            content,
            title,
            onDismiss: options?.onDismiss,
          };

          return options?.lease
            ? admitLeasedDrawer(
                current,
                activeContextRef.current,
                contextKey,
                options.lease,
                value
              )
            : admitOwnedDrawer(
                current,
                activeContextRef.current,
                contextKey,
                options?.owner ?? null,
                value
              );
        });
      },
      closeDrawer: (owner?: string) =>
        setDrawer((current) => closeOwnedDrawer(current, owner)),
    }),
    [contextKey],
  );
  return (
    <ShellDrawerContext.Provider value={value}>
      {children}
      {drawer ? (
        <div className="fixed inset-0 z-50" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
            onClick={dismissDrawer}
            aria-label="Close temporary Drawer"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={drawer.value.title}
            className="absolute inset-y-0 right-0 flex w-full flex-col border-l bg-white shadow-2xl dark:border-white/10 dark:bg-ink sm:max-w-[460px]"
          >
            <header className="flex h-16 items-center justify-between border-b px-5 dark:border-white/10">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-slate-500">
                  Temporary Context
                </div>
                <h2 className="mt-1 text-sm font-semibold">{drawer.value.title}</h2>
              </div>
              <button
                type="button"
                onClick={dismissDrawer}
                className="rounded-lg border p-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
                aria-label="Close Drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {drawer.value.content}
            </div>
          </aside>
        </div>
      ) : null}
    </ShellDrawerContext.Provider>
  );
}

export function useShellDrawer() {
  const value = React.useContext(ShellDrawerContext);
  if (!value)
    throw new Error("useShellDrawer must be used inside ShellDrawerProvider");
  return value;
}
