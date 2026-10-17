export type WorkspaceDetail<T> = { scope: object; id: string | null; status: "loading" | "ready" | "missing" | "unavailable"; value: T | null };

export function currentWorkspaceDetail<T>(state: WorkspaceDetail<T> | null, scope: object, id: string | null): WorkspaceDetail<T> {
  // Render-time binding also hides old detail before the next effect executes.
  if (!state || state.scope !== scope || state.id !== id)
    return { scope, id, status: id ? "loading" : "missing", value: null };
  return state;
}
