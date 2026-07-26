"use client";

import * as React from "react";
import type { InvestigationTarget } from "@/lib/entities";

export type InvestigationContextValue = {
  stack: InvestigationTarget[];
  current: InvestigationTarget | null;
  open: (target: InvestigationTarget, options?: { replace?: boolean }) => void;
  back: () => void;
  close: () => void;
  replace: (target: InvestigationTarget) => void;
};

export const InvestigationContext = React.createContext<InvestigationContextValue | null>(null);

export function useInvestigation() {
  const value = React.useContext(InvestigationContext);
  if (!value) {
    return {
      stack: [],
      current: null,
      open: () => {},
      back: () => {},
      close: () => {},
      replace: () => {},
    } satisfies InvestigationContextValue;
  }
  return value;
}
