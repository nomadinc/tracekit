import type { BusinessContext } from "./types";

export function persistentBusinessContextsWithDisplay(
  persistentContexts: readonly BusinessContext[],
  displayContexts: readonly BusinessContext[],
) {
  return persistentContexts.map((context) => {
    const display = displayContexts.find((candidate) => candidate.id === context.id);
    return display ? { ...context, name: display.name, mark: display.mark } : context;
  });
}
