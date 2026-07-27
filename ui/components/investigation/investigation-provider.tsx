"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InvestigationContext } from "@/components/investigation/investigation-context";
import { InvestigationDrawer } from "@/components/investigation/investigation-drawer";
import {
  inspectValue,
  parseInspectValue,
  type InvestigationTarget,
} from "@/lib/entities";

const MAX_STACK_DEPTH = 8;

function sameTarget(a: InvestigationTarget | null | undefined, b: InvestigationTarget | null | undefined) {
  return Boolean(a && b && a.type === b.type && a.id === b.id);
}

export function InvestigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const [stack, setStack] = React.useState<InvestigationTarget[]>([]);
  const current = stack[stack.length - 1] || null;

  const updateInspectParam = React.useCallback((target: InvestigationTarget | null, replace = false) => {
    const params = new URLSearchParams(searchParams.toString());
    if (target) params.set("inspect", inspectValue(target));
    else params.delete("inspect");
    const next = `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    if (replace) router.replace(next, { scroll: false });
    else router.push(next, { scroll: false });
  }, [pathname, router, searchParams]);

  React.useEffect(() => {
    const target = parseInspectValue(searchParams.get("inspect"));
    if (!target) {
      if (stack.length) setStack([]);
      return;
    }
    if (!sameTarget(current, target)) {
      setStack((existing) => {
        const next = [...existing, target].slice(-MAX_STACK_DEPTH);
        return next;
      });
    }
  }, [current, searchParams, stack.length]);

  const open = React.useCallback((target: InvestigationTarget, options?: { replace?: boolean }) => {
    setStack((existing) => {
      if (sameTarget(existing[existing.length - 1], target)) return existing;
      return [...existing, target].slice(-MAX_STACK_DEPTH);
    });
    updateInspectParam(target, Boolean(options?.replace));
  }, [updateInspectParam]);

  const replace = React.useCallback((target: InvestigationTarget) => {
    setStack((existing) => [...existing.slice(0, -1), target].slice(-MAX_STACK_DEPTH));
    updateInspectParam(target, true);
  }, [updateInspectParam]);

  const close = React.useCallback(() => {
    setStack([]);
    updateInspectParam(null, false);
  }, [updateInspectParam]);

  const back = React.useCallback(() => {
    setStack((existing) => {
      const next = existing.slice(0, -1);
      const target = next[next.length - 1] || null;
      updateInspectParam(target, false);
      return next;
    });
  }, [updateInspectParam]);

  const value = React.useMemo(() => ({ stack, current, open, back, close, replace }), [stack, current, open, back, close, replace]);

  return (
    <InvestigationContext.Provider value={value}>
      {children}
      <InvestigationDrawer />
    </InvestigationContext.Provider>
  );
}
