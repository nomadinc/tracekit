"use client";

import * as React from "react";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { useInvestigation } from "@/components/investigation/investigation-context";
import { EntityPreview } from "@/components/investigation/entity-preview";
import { useContextCommands, type ContextCommand } from "@/components/shared/command-context";
import { ErrorState, LoadingSkeleton } from "@/components/shared/primitives";
import {
  entityPreviewQuery,
  entityTypeLabel,
  type EntityPreviewResponse,
  type InvestigationTarget,
} from "@/lib/entities";

const WORKSPACE_ID = "default";
const PREVIEW_TTL_MS = 45_000;
const PREVIEW_CACHE_MAX = 50;

type CacheEntry = {
  at: number;
  response: EntityPreviewResponse;
};

const previewCache = new Map<string, CacheEntry>();

function cacheKey(target: InvestigationTarget) {
  return `${WORKSPACE_ID}:${target.type}:${target.id}`;
}

function setCache(key: string, response: EntityPreviewResponse) {
  previewCache.set(key, { at: Date.now(), response });
  if (previewCache.size > PREVIEW_CACHE_MAX) {
    const first = previewCache.keys().next().value;
    if (first) previewCache.delete(first);
  }
}

async function readJsonSafe(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: "invalid_json", message: text.slice(0, 240) };
  }
}

export function InvestigationDrawer() {
  const investigation = useInvestigation();
  const current = investigation.current;
  const panelRef = React.useRef<HTMLElement | null>(null);
  const titleRef = React.useRef<HTMLHeadingElement | null>(null);
  const [data, setData] = React.useState<EntityPreviewResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshId, setRefreshId] = React.useState(0);
  const [busyActionId, setBusyActionId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!current) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [current]);

  React.useEffect(() => {
    if (!current) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const key = cacheKey(current);
    const cached = previewCache.get(key);
    if (cached && Date.now() - cached.at < PREVIEW_TTL_MS) setData(cached.response);
    else setData(null);

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(entityPreviewQuery(current, WORKSPACE_ID), {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = (await readJsonSafe(res)) as EntityPreviewResponse;
        if (!res.ok || json?.ok === false) throw new Error(json?.message || json?.error || `Entity preview failed (${res.status})`);
        setCache(key, json);
        setData(json);
      })
      .catch((err: any) => {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Entity preview failed.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [current, refreshId]);

  React.useEffect(() => {
    if (!current) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        investigation.close();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
      )).filter((node) => !node.hasAttribute("disabled") && node.tabIndex !== -1);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, investigation]);

  const runWorkItemAction = React.useCallback(async (action: string) => {
    if (!current || current.type !== "work_item") return;
    setBusyActionId(action);
    try {
      const res = await fetch(`/api/work-items/${encodeURIComponent(current.id)}/${action}`, {
        method: "POST",
        cache: "no-store",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ workspace_id: WORKSPACE_ID }),
      });
      const json = await readJsonSafe(res);
      if (!res.ok || json?.ok === false) throw new Error(json?.message || json?.error || `${action} failed (${res.status})`);
      previewCache.delete(cacheKey(current));
      window.dispatchEvent(new CustomEvent("tracekit:work-item-mutated", { detail: { work_item_id: current.id, action } }));
      setRefreshId((value) => value + 1);
    } finally {
      setBusyActionId(null);
    }
  }, [current]);

  const contextCommands = React.useMemo<ContextCommand[]>(() => {
    if (!current || !data?.entity) return [];
    const entity = data.entity;
    const commands: ContextCommand[] = [
      {
        id: `${entity.type}:${entity.id}:copy-link`,
        title: "Copy link",
        subtitle: `Copy ${entity.title}`,
        run: () => navigator.clipboard?.writeText(window.location.href),
      },
      {
        id: `${entity.type}:${entity.id}:open-full-page`,
        title: "Open full page",
        subtitle: entity.full_page_link,
        run: () => {
          window.location.href = entity.full_page_link;
        },
      },
      ...entity.identifiers.slice(0, 3).map((identifier) => ({
        id: `${entity.type}:${entity.id}:copy-id:${identifier.label}`,
        title: `Copy ${identifier.label}`,
        subtitle: identifier.value,
        run: () => navigator.clipboard?.writeText(identifier.value),
      })),
    ];
    for (const action of entity.actions) {
      if (action.kind !== "work_item_action" || !action.safe || !action.action) continue;
      commands.push({
        id: `${entity.type}:${entity.id}:work-item:${action.id}`,
        title: action.label,
        subtitle: "Run safe Work Item action",
        run: () => runWorkItemAction(action.action || ""),
      });
    }
    return commands;
  }, [current, data?.entity, runWorkItemAction]);

  useContextCommands(current ? `investigation:${current.type}:${current.id}` : "investigation:none", contextCommands);

  if (!current) return null;
  const title = data?.entity?.title || current.label || entityTypeLabel(current.type);

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        aria-label="Close investigation panel"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
        onClick={investigation.close}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="investigation-title"
        className="absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden border-l bg-white shadow-2xl dark:border-white/10 dark:bg-ink sm:max-w-[680px]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 dark:border-white/10">
          <div className="flex min-w-0 items-center gap-2">
            {investigation.stack.length > 1 ? (
              <button
                type="button"
                onClick={investigation.back}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/10"
                aria-label="Back to previous preview"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : null}
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Investigation</div>
              <h2 id="investigation-title" ref={titleRef} tabIndex={-1} className="truncate text-base font-semibold outline-none">
                {title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={investigation.close}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/10"
            aria-label="Close investigation panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {loading && !data ? (
            <div className="space-y-5" aria-live="polite">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading preview
              </div>
              <LoadingSkeleton rows={7} />
            </div>
          ) : null}

          {error ? (
            <ErrorState title="Preview unavailable" body={error} onRetry={() => setRefreshId((value) => value + 1)} />
          ) : null}

          {data?.entity && !error ? (
            <EntityPreview
              entity={data.entity}
              busyActionId={busyActionId}
              onRefresh={() => setRefreshId((value) => value + 1)}
              onWorkItemAction={runWorkItemAction}
            />
          ) : null}
        </div>
      </aside>
    </div>
  );
}
