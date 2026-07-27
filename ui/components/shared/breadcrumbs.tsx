"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { AppBreadcrumb } from "@/lib/app-navigation";

export function Breadcrumbs({ items }: { items: AppBreadcrumb[] }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
        <li>
          <Link href="/" className="rounded px-1 py-0.5 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:hover:text-white">
            TraceKit
          </Link>
        </li>
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${item.label}:${index}`} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              {item.href && !current ? (
                <Link href={item.href} className="truncate rounded px-1 py-0.5 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:hover:text-white">
                  {item.label}
                </Link>
              ) : (
                <span className="truncate px-1 py-0.5 font-medium text-slate-700 dark:text-slate-200" aria-current={current ? "page" : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
