export type ShellOverlay = "none" | "search" | "user-menu";

export type ShellOverlayEvent =
  | { type: "open-search" }
  | { type: "toggle-search" }
  | { type: "open-user-menu" }
  | { type: "toggle-user-menu" }
  | { type: "escape" | "outside" | "selection" | "navigation" | "identity-change" | "organization-change" | "business-context-change" };

export function shellOverlayReducer(state: ShellOverlay, event: ShellOverlayEvent): ShellOverlay {
  if (event.type === "open-search") return "search";
  if (event.type === "toggle-search") return state === "search" ? "none" : "search";
  if (event.type === "open-user-menu") return "user-menu";
  if (event.type === "toggle-user-menu") return state === "user-menu" ? "none" : "user-menu";
  return "none";
}
