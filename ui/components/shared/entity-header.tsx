"use client";

import * as React from "react";
import Link from "next/link";
import { ClipboardList, Compass, ExternalLink, ShoppingBag, UserRound } from "lucide-react";
import { CopyButton, StatusBadge } from "@/components/shared/primitives";
import { entityTypeLabel, type EntityStatus, type EntityType } from "@/lib/entities";

export type EntityAction = {
  id: string;
  label: string;
  kind: "link" | "copy" | "work_item_action";
  href?: string | null;
  value?: string | null;
  action?: string | null;
  safe: boolean;
};

export type EntityHeaderProps = {
  entityType: EntityType;
  title: string;
  subtitle?: string | null;
  statuses?: EntityStatus[];
  secondaryStatuses?: EntityStatus[];
  metadata?: Array<{ label: string; value: React.ReactNode }>;
  identifiers?: Array<{ label: string; value: string }>;
  actions?: EntityAction[];
  onAction?: (action: EntityAction) => void | Promise<void>;
  busyActionId?: string | null;
};

function iconFor(type: EntityType) {
  if (type === "customer") return UserRound;
  if (type === "order") return ShoppingBag;
  if (type === "journey") return Compass;
  return ClipboardList;
}

export function EntityHeader({
  entityType,
  title,
  subtitle,
  statuses = [],
  secondaryStatuses = [],
  metadata = [],
  identifiers = [],
  actions = [],
  onAction,
  busyActionId,
}: EntityHeaderProps) {
  const Icon = iconFor(entityType);
  return (
    <header className="space-y-5">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {entityTypeLabel(entityType)}
          </div>
          <h2 className="mt-1 break-words text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {title}
          </h2>
          {subtitle ? <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
          {statuses.length || secondaryStatuses.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {[...statuses, ...secondaryStatuses].map((status, index) => (
                <StatusBadge key={`${status.label}:${index}`} tone={status.tone}>
                  {status.label}
                </StatusBadge>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {metadata.length ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          {metadata.map((item) => (
            <div key={item.label} className="rounded-lg border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.label}</dt>
              <dd className="mt-1 min-w-0 break-words text-sm font-medium text-slate-900 dark:text-white">{item.value ?? "Not available"}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {identifiers.length ? (
        <div className="flex flex-wrap gap-2">
          {identifiers.slice(0, 6).map((identifier) => (
            <div key={`${identifier.label}:${identifier.value}`} className="inline-flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs dark:border-white/10">
              <span className="shrink-0 text-slate-500 dark:text-slate-400">{identifier.label}</span>
              <span className="min-w-0 truncate font-mono">{identifier.value}</span>
              <CopyButton value={identifier.value} label="Copy" />
            </div>
          ))}
        </div>
      ) : null}

      {actions.length ? (
        <div className="flex flex-wrap gap-2">
          {actions.filter((action) => action.safe).map((action) => {
            if (action.kind === "copy" && action.value) {
              return <CopyButton key={action.id} value={action.value} label={action.label} />;
            }
            if (action.kind === "link" && action.href) {
              return (
                <Link key={action.id} href={action.href} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/10">
                  {action.label}
                  <ExternalLink className="h-4 w-4" />
                </Link>
              );
            }
            if (action.kind === "work_item_action" && onAction) {
              return (
                <button
                  key={action.id}
                  type="button"
                  disabled={busyActionId === action.id}
                  onClick={() => onAction(action)}
                  className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/10"
                >
                  {busyActionId === action.id ? "Saving..." : action.label}
                </button>
              );
            }
            return null;
          })}
        </div>
      ) : null}
    </header>
  );
}
