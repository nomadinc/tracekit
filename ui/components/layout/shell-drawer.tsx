"use client";

import * as React from "react";
import { X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useIdentity } from "@/components/identity/identity-provider";

type ShellDrawerContextValue = {
  openDrawer: (
    content: React.ReactNode,
    title: string,
    options?: { onDismiss?: () => void },
  ) => void;
  closeDrawer: () => void;
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
  const params = useSearchParams();
  const selection = params.toString();
  const { session } = useIdentity();
  // Object identity is a generation: A -> B -> A cannot revive an old drawer.
  const owner = React.useMemo(() => ({ pathname, selection,
    authenticated: session.authenticated, identityId: session.identity.id,
    organizationId: session.activeOrganizationId, businessContextId: session.activeBusinessContextId,
  }), [pathname, selection, session.authenticated,
    session.identity.id, session.activeOrganizationId, session.activeBusinessContextId]);
  const currentOwner = React.useRef(owner);
  currentOwner.current = owner;
  const [storedDrawer, setDrawer] = React.useState<{
    owner: typeof owner;
    title: string;
    content: React.ReactNode;
    onDismiss?: () => void;
  } | null>(null);
  const drawer = storedDrawer?.owner === owner ? storedDrawer : null;
  const dismissDrawer = React.useCallback(() => {
    if (currentOwner.current !== owner) return;
    drawer?.onDismiss?.();
    setDrawer(null);
  }, [drawer, owner]);
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
        options?: { onDismiss?: () => void },
      ) => {
        if (currentOwner.current === owner)
          setDrawer({ owner, content, title, onDismiss: options?.onDismiss });
      },
      closeDrawer: () => { if (currentOwner.current === owner) setDrawer(null); },
    }),
    [owner],
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
            aria-label={drawer.title}
            className="absolute inset-y-0 right-0 flex w-full flex-col border-l bg-white shadow-2xl dark:border-white/10 dark:bg-ink sm:max-w-[460px]"
          >
            <header className="flex h-16 items-center justify-between border-b px-5 dark:border-white/10">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-slate-500">
                  Temporary Context
                </div>
                <h2 className="mt-1 text-sm font-semibold">{drawer.title}</h2>
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
              {drawer.content}
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
