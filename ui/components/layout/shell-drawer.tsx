"use client";

import * as React from "react";
import { X } from "lucide-react";

type ShellDrawerContextValue = {
  openDrawer: (content: React.ReactNode, title: string) => void;
  closeDrawer: () => void;
};

const ShellDrawerContext = React.createContext<ShellDrawerContextValue | null>(null);

export function ShellDrawerProvider({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = React.useState<{ title: string; content: React.ReactNode } | null>(null);
  const value = React.useMemo(() => ({ openDrawer: (content: React.ReactNode, title: string) => setDrawer({ content, title }), closeDrawer: () => setDrawer(null) }), []);
  return <ShellDrawerContext.Provider value={value}>{children}{drawer ? <div className="fixed inset-0 z-50" role="presentation"><button type="button" className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setDrawer(null)} aria-label="Close temporary Drawer" /><aside role="dialog" aria-modal="true" aria-label={drawer.title} className="absolute inset-y-0 right-0 flex w-full flex-col border-l bg-white shadow-2xl dark:border-white/10 dark:bg-ink sm:max-w-[460px]"><header className="flex h-16 items-center justify-between border-b px-5 dark:border-white/10"><div><div className="text-[9px] font-semibold uppercase tracking-[.12em] text-slate-500">Temporary Context</div><h2 className="mt-1 text-sm font-semibold">{drawer.title}</h2></div><button type="button" onClick={() => setDrawer(null)} className="rounded-lg border p-2 focus:outline-none focus:ring-2 focus:ring-slate-400" aria-label="Close Drawer"><X className="h-4 w-4" /></button></header><div className="min-h-0 flex-1 overflow-y-auto p-5">{drawer.content}</div></aside></div> : null}</ShellDrawerContext.Provider>;
}

export function useShellDrawer() {
  const value = React.useContext(ShellDrawerContext);
  if (!value) throw new Error("useShellDrawer must be used inside ShellDrawerProvider");
  return value;
}
