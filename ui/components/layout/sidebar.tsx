"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { APP_NAVIGATION, SECONDARY_NAVIGATION } from "@/lib/app-navigation";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() || "/";

  return (
    <aside className="flex h-full w-72 flex-col border-r bg-white/95 shadow-sm backdrop-blur dark:bg-ink/95">
      <div className="border-b px-5 py-5">
        <Link href="/" onClick={onNavigate} className="inline-flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white dark:bg-white dark:text-slate-950">TK</span>
          <span>
            <span className="block text-lg font-semibold tracking-tight">TraceKit</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">Marketing command center</span>
          </span>
        </Link>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-4">
          {APP_NAVIGATION.map((group) => {
            const Icon = group.icon;
            const groupHref = group.href;
            const groupActive = groupHref ? isActive(pathname, groupHref) : group.items?.some((item) => isActive(pathname, item.href));

            return (
              <div key={group.label}>
                {groupHref ? (
                  <Link
                    href={groupHref}
                    onClick={onNavigate}
                    className={[
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-400",
                      groupActive ? "bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{group.label}</span>
                    <ChevronRight className="h-3.5 w-3.5 opacity-50 transition group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <div className="px-3 pb-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <Icon className="h-3.5 w-3.5" />
                      {group.label}
                    </div>
                  </div>
                )}

                {group.items?.length ? (
                  <div className="mt-1 space-y-1">
                    {group.items.map((item) => {
                      const active = isActive(pathname, item.href);
                      return (
                        <Link
                          key={`${group.label}:${item.label}:${item.href}`}
                          href={item.href}
                          onClick={onNavigate}
                          className={[
                            "ml-5 block rounded-lg px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-slate-400",
                            active ? "bg-slate-100 font-medium text-slate-950 dark:bg-white/10 dark:text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10",
                          ].join(" ")}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-6 border-t pt-4 dark:border-white/10">
          <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tools</div>
          <div className="space-y-1">
            {SECONDARY_NAVIGATION.map((item) => (
              <Link
                key={`${item.label}:${item.href}`}
                href={item.href}
                onClick={onNavigate}
                className="block rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:text-slate-300 dark:hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </aside>
  );
}
