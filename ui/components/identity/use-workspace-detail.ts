"use client";
import { useEffect, useState } from "react";
import { currentWorkspaceDetail, type WorkspaceDetail } from "@/lib/navigation/workspace-detail";

export function useWorkspaceDetail<S extends object, T>(scope: S, id: string | null, load: (scope: S, id: string) => Promise<T | null>) {
  const [state, setState] = useState<WorkspaceDetail<T> | null>(null);
  useEffect(() => {
    let active = true;
    setState({ scope, id, status: id ? "loading" : "missing", value: null });
    if (id) Promise.resolve().then(() => load(scope, id)).then(
      value => { if (active) setState({ scope, id, status: value ? "ready" : "missing", value }); },
      () => { if (active) setState({ scope, id, status: "unavailable", value: null }); },
    );
    return () => { active = false; };
  }, [scope, id, load]);
  return currentWorkspaceDetail(state, scope, id);
}
