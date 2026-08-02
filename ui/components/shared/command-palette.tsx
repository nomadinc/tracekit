"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  ClipboardList,
  Command,
  Loader2,
  Search,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import { useInvestigation } from "@/components/investigation/investigation-context";
import { GLOBAL_SEARCH_PLACEHOLDER } from "@/lib/app-navigation";
import {
  BUILT_IN_OPERATIONS_VIEW_COMMANDS,
  BUILT_IN_SAFE_ACTION_COMMANDS,
  type CommandDefinition,
  type SafeActionCommand,
} from "@/lib/commands";
import { useRegisteredCommands, type ContextCommand } from "@/components/shared/command-context";
import type { InvestigationTarget } from "@/lib/entities";
import { useIdentity } from "@/components/identity/identity-provider";
import { hasAnyPermission, shellVariant } from "@/lib/identity/authorization";
import { navigationForIdentity } from "@/lib/identity/shell-navigation";
import { withDevelopmentIdentity } from "@/lib/identity/development-state";
import type { Identity } from "@/lib/identity/types";
import { shellOverlayReducer } from "@/lib/shell/overlay-state";
import { offerRepository } from "@/lib/offers/mock-repository";
import type { OfferSearchResult } from "@/lib/offers/types";
import {
  globalSearchQuery,
  type GlobalSearchResponse,
  type GlobalSearchResult,
} from "@/lib/search";

const WORKSPACE_ID = "default";
const SEARCH_LIMIT = 12;

type PaletteItem = {
  id: string;
  group: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  href?: string;
  target?: InvestigationTarget;
  action?: SafeActionCommand["action"];
  run?: () => void | Promise<void>;
  icon: React.ComponentType<{ className?: string }>;
};

function navigationItems(identity: Identity): PaletteItem[] {
  const items: PaletteItem[] = [];
  const variant = shellVariant(identity);
  for (const item of navigationForIdentity(identity)) {
    items.push({
      id: `nav:${item.href}:${item.label}`,
      group: "Navigation",
      title: `Go to ${item.label}`,
      subtitle: `${variant === "product-admin" ? "Platform" : variant === "agency" ? "Agency" : "Organization"} destination`,
      href: item.href,
      icon: item.icon,
    });
  }
  const operationsCommands = hasAnyPermission(identity, ["imports.view", "connectors.view"]) ? BUILT_IN_OPERATIONS_VIEW_COMMANDS : [];
  const safeActionCommands = hasAnyPermission(identity, ["imports.manage", "connectors.manage"]) ? BUILT_IN_SAFE_ACTION_COMMANDS : [];
  for (const command of [...operationsCommands, ...safeActionCommands]) {
    items.push(commandToItem(command));
  }
  return items;
}

function commandToItem(command: CommandDefinition): PaletteItem {
  return {
    id: command.id,
    group: command.group,
    title: command.title,
    subtitle: command.subtitle,
    href: "href" in command ? command.href : undefined,
    action: "action" in command ? command.action : undefined,
    icon: command.icon,
  };
}

function contextCommandToItem(command: ContextCommand): PaletteItem {
  return {
    id: `context:${command.id}`,
    group: command.group || "Current Context",
    title: command.title,
    subtitle: command.subtitle,
    run: command.run,
    icon: command.icon || Command,
  };
}

function resultIcon(type: GlobalSearchResult["type"]) {
  if (type === "customer") return UserRound;
  if (type === "order") return ShoppingBag;
  return ClipboardList;
}

function resultGroupLabel(key: keyof GlobalSearchResponse["groups"]) {
  if (key === "customers") return "Customers";
  if (key === "orders") return "Orders";
  return "Work Items";
}

function resultToItem(result: GlobalSearchResult, group: string): PaletteItem {
  return {
    id: `${result.type}:${result.id}`,
    group,
    title: result.title,
    subtitle: result.subtitle,
    meta: result.meta,
    href: result.href,
    target: { type: result.type, id: result.id, label: result.title, query: { workspace_id: WORKSPACE_ID } },
    icon: resultIcon(result.type),
  };
}

function withWorkspace(href: string) {
  if (!href.startsWith("/")) return href;
  if (href.includes("workspace_id=")) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}workspace_id=${encodeURIComponent(WORKSPACE_ID)}`;
}

function groupItems(items: PaletteItem[]) {
  const groups: Array<{ label: string; items: PaletteItem[] }> = [];
  for (const item of items) {
    const existing = groups.find((group) => group.label === item.group);
    if (existing) existing.items.push(item);
    else groups.push({ label: item.group, items: [item] });
  }
  return groups;
}

export function useCommandPaletteController(onOpening?: () => void) {
  const [overlay, dispatch] = React.useReducer(shellOverlayReducer, "none");
  const open = overlay === "search";
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  const openPalette = React.useCallback(() => {
    if (typeof document !== "undefined") {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    onOpening?.();
    dispatch({ type: "open-search" });
  }, [onOpening]);

  const closePalette = React.useCallback((restoreFocus = true) => {
    dispatch({ type: "escape" });
    if (restoreFocus) window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }, []);

  const togglePalette = React.useCallback(() => {
    if (open) {
      closePalette();
      return;
    }
    openPalette();
  }, [closePalette, open, openPalette]);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        togglePalette();
        return;
      }
      if (open && event.key === "Escape") {
        closePalette();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePalette, open, togglePalette]);

  return { open, openPalette, closePalette, togglePalette };
}

export function CommandPaletteButton({
  onOpen,
  className = "",
  compact = false,
}: {
  onOpen: () => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={className}
      aria-label="Open command palette"
    >
      <Search className="h-4 w-4 text-slate-400" />
      <span className="min-w-0 flex-1 truncate text-left text-slate-500 dark:text-slate-400">
        {compact ? "Search..." : GLOBAL_SEARCH_PLACEHOLDER}
      </span>
      <span className="hidden items-center gap-1 rounded-md border bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:border-white/10 dark:bg-white/10 dark:text-slate-300 sm:inline-flex">
        <Command className="h-3 w-3" />
        K
      </span>
    </button>
  );
}

export function CommandPaletteDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useIdentity();
  const investigation = useInvestigation();
  const contextCommands = useRegisteredCommands();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const requestIdRef = React.useRef(0);
  const previousPathnameRef = React.useRef(pathname);
  const previousIdentityRef = React.useRef(session.identity.id);
  const previousBusinessContextRef = React.useRef(session.activeBusinessContextId);
  const navItems = React.useMemo(() => navigationItems(session.identity), [session.identity]);
  const [query, setQuery] = React.useState("");
  const [search, setSearch] = React.useState<GlobalSearchResponse | null>(null);
  const [offerSearch, setOfferSearch] = React.useState<OfferSearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  React.useEffect(() => {
    if (open && previousPathnameRef.current !== pathname) onClose();
    previousPathnameRef.current = pathname;
  }, [onClose, open, pathname]);

  React.useEffect(() => {
    if (open && previousIdentityRef.current !== session.identity.id) onClose();
    previousIdentityRef.current = session.identity.id;
  }, [onClose, open, session.identity.id]);

  React.useEffect(() => {
    if (open && previousBusinessContextRef.current !== session.activeBusinessContextId) onClose();
    previousBusinessContextRef.current = session.activeBusinessContextId;
  }, [onClose, open, session.activeBusinessContextId]);

  React.useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    setActiveIndex(0);
    setError(null);
    if (trimmed.length < 2) {
      setSearch(null);
      setOfferSearch([]);
      setLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const offerPromise = offerRepository.search({ authenticated: session.authenticated, identity: session.identity, organizationId: session.activeOrganizationId }, trimmed);
        const res = await fetch(globalSearchQuery({ workspace_id: WORKSPACE_ID, q: trimmed, limit: SEARCH_LIMIT }), {
          cache: "no-store",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => ({}))) as GlobalSearchResponse;
        if (requestIdRef.current !== requestId) return;
        if (!res.ok || json?.ok === false) throw new Error(json?.message || json?.error || `Search failed (${res.status})`);
        setSearch(json);
        setOfferSearch(await offerPromise);
      } catch (err: any) {
        if (err?.name === "AbortError" || requestIdRef.current !== requestId) return;
        setSearch(null);
        setOfferSearch([]);
        setError(err?.message || "Search failed.");
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [open, query, session.activeOrganizationId, session.authenticated, session.identity]);

  const visibleNavItems = React.useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return navItems.slice(0, 10);
    return navItems
      .filter((item) => `${item.title} ${item.subtitle || ""}`.toLowerCase().includes(trimmed))
      .slice(0, 6);
  }, [navItems, query]);

  const visibleContextItems = React.useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const items = contextCommands.map(contextCommandToItem);
    if (!trimmed) return items.slice(0, 8);
    return items
      .filter((item) => `${item.title} ${item.subtitle || ""}`.toLowerCase().includes(trimmed))
      .slice(0, 8);
  }, [contextCommands, query]);

  const resultItems = React.useMemo(() => {
    const items: PaletteItem[] = offerSearch.map(result => ({ id: `offer-search:${result.id}`, group: "Offers and related Evidence", title: result.title, subtitle: result.subtitle, meta: result.value, href: result.href, icon: Search }));
    if (!search) return items;
    (Object.keys(search.groups) as Array<keyof GlobalSearchResponse["groups"]>).forEach((key) => {
      for (const result of search.groups[key] || []) {
        items.push(resultToItem(result, resultGroupLabel(key)));
      }
    });
    return items;
  }, [offerSearch, search]);

  const items = query.trim().length < 2 ? [...visibleContextItems, ...visibleNavItems] : [...resultItems, ...visibleContextItems, ...visibleNavItems];
  const grouped = groupItems(items);

  function openItem(item: PaletteItem | undefined) {
    if (!item) return;
    if (item.run) {
      void Promise.resolve(item.run()).catch(() => undefined);
      onClose();
      return;
    }
    if (item.target) {
      investigation.open(item.target);
      onClose();
      return;
    }
    if (item.action === "copy_current_page_link") {
      void navigator.clipboard?.writeText(window.location.href);
      onClose();
      return;
    }
    if (item.action === "refresh_current_page") {
      router.refresh();
      onClose();
      return;
    }
    if (item.action === "open_notifications") {
      router.push(withDevelopmentIdentity(withWorkspace("/notifications"), session.identity.id));
      onClose();
      return;
    }
    if (item.href) router.push(withDevelopmentIdentity(withWorkspace(item.href), session.identity.id));
    onClose();
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(items.length - 1, current + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      openItem(items[activeIndex]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/35 p-0 backdrop-blur-sm sm:p-4" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="flex h-dvh w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-ink sm:mx-auto sm:mt-[8vh] sm:h-auto sm:max-h-[76vh] sm:max-w-2xl sm:rounded-xl sm:border dark:sm:border-white/10"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b px-4 py-3 dark:border-white/10">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={GLOBAL_SEARCH_PLACEHOLDER}
            className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
            aria-label="Search customers, orders, Work Items, and pages"
          />
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" role="alert">
              {error}
            </div>
          ) : null}

          {!error && !items.length && !loading ? (
            <div className="rounded-lg border border-dashed bg-slate-50 p-8 text-center dark:border-white/10 dark:bg-white/5">
              <div className="font-semibold">No results found</div>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Try a customer name, email, phone, order ID, Work Item title, or page name.
              </p>
            </div>
          ) : null}

          <div className="space-y-4">
            {grouped.map((group) => (
              <section key={group.label}>
                <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const flatIndex = items.findIndex((candidate) => candidate.id === item.id);
                    const Icon = item.icon;
                    const active = flatIndex === activeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => openItem(item)}
                        className={[
                          "flex w-full items-center gap-3 rounded-lg p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-slate-400",
                          active ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "hover:bg-slate-100 dark:hover:bg-white/10",
                        ].join(" ")}
                      >
                        <span className={[
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                          active ? "border-white/20 bg-white/10 dark:border-slate-950/10 dark:bg-slate-950/5" : "bg-slate-50 dark:border-white/10 dark:bg-white/5",
                        ].join(" ")}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{item.title}</span>
                          {item.subtitle ? <span className={["mt-0.5 block truncate text-sm", active ? "text-white/75 dark:text-slate-600" : "text-slate-500 dark:text-slate-400"].join(" ")}>{item.subtitle}</span> : null}
                          {item.meta ? <span className={["mt-1 block truncate text-xs", active ? "text-white/65 dark:text-slate-500" : "text-slate-400"].join(" ")}>{item.meta}</span> : null}
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 opacity-60" />
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
