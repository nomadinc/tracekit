"use client";

import * as React from "react";
import { Bell, ChevronDown, Menu, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { LiveWorkspaceStatus } from "@/components/live/live-workspace-provider";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { LIVE_WORKSPACE_UPDATE_EVENT, type WorkspaceUpdate } from "@/lib/live";
import {
  CommandPaletteButton,
  CommandPaletteDialog,
  useCommandPaletteController,
} from "@/components/shared/command-palette";
import { EntityLink } from "@/components/shared/entity-link";
import {
  WORKSPACE_SUMMARY,
  breadcrumbsForPath,
  pageChromeForPath,
} from "@/lib/app-navigation";
import {
  notificationQuery,
  notificationSeverityLabel,
  notificationTimeAgo,
  type NotificationsResponse,
  type TraceKitNotification,
} from "@/lib/notifications";

export default function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const chrome = pageChromeForPath(pathname);
  const breadcrumbs = breadcrumbsForPath(pathname);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<TraceKitNotification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const commandPalette = useCommandPaletteController();

  const loadNotifications = React.useCallback(async () => {
    try {
      const res = await fetch(notificationQuery({ workspace_id: "default", limit: 5 }), {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const json = (await res.json().catch(() => ({}))) as NotificationsResponse;
      if (json?.ok === false) return;
      setNotifications(Array.isArray(json.notifications) ? json.notifications : []);
      setUnreadCount(Number(json.counts?.unread || 0));
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, []);

  React.useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  React.useEffect(() => {
    function onWorkspaceUpdate(event: Event) {
      const update = (event as CustomEvent<WorkspaceUpdate>).detail;
      if (!update || update.workspaceId !== "default") return;
      if (update.type === "notification.created" || update.type === "health.changed" || update.type === "work_item.changed") {
        void loadNotifications();
      }
    }
    window.addEventListener(LIVE_WORKSPACE_UPDATE_EVENT, onWorkspaceUpdate);
    return () => window.removeEventListener(LIVE_WORKSPACE_UPDATE_EVENT, onWorkspaceUpdate);
  }, [loadNotifications]);

  function severityTone(severity: string) {
    if (severity === "critical") return "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100";
    if (severity === "warning") return "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-100";
    if (severity === "info") return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100";
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100";
  }

  return (
    <header className="border-b bg-white/85 backdrop-blur-xl dark:border-white/10 dark:bg-ink/85">
      <div className="flex min-h-16 items-center justify-between gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:hover:bg-white/10 lg:hidden"
            onClick={onMenuClick}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            {breadcrumbs.length ? (
              <Breadcrumbs items={breadcrumbs} />
            ) : (
              <div className="text-xs text-slate-500 dark:text-slate-400">TraceKit</div>
            )}
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{chrome.title}</h1>
              <p className="max-w-2xl pb-1 text-sm text-slate-500 dark:text-slate-400">{chrome.description}</p>
            </div>
          </div>
        </div>

        <div className="hidden min-w-[22rem] max-w-xl flex-1 items-center justify-end gap-3 xl:flex">
          <CommandPaletteButton
            onOpen={commandPalette.openPalette}
            className="inline-flex h-10 w-full max-w-md items-center gap-2 rounded-xl border bg-white px-3 text-sm outline-none transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:bg-white/5 dark:hover:bg-white/10 dark:focus:ring-white/10"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hidden min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:hover:bg-white/10 md:inline-flex"
            aria-label="Switch workspace"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{WORKSPACE_SUMMARY.name}</span>
              <span className="block truncate text-xs text-slate-500">{WORKSPACE_SUMMARY.environment} · {WORKSPACE_SUMMARY.website}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>

          <LiveWorkspaceStatus />

          <ThemeToggle />

          <div className="relative">
            <button
              type="button"
              onClick={() => setNotificationsOpen((value) => !value)}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:hover:bg-white/10"
              aria-label="Open notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" /> : null}
            </button>
            {notificationsOpen ? (
              <div className="absolute right-0 top-12 z-30 w-80 rounded-xl border bg-white p-3 shadow-xl dark:border-white/10 dark:bg-ink">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Notifications</div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300">{unreadCount} unread</span>
                </div>
                <div className="mt-3 space-y-2">
                  {notifications.length ? notifications.map((notification) => (
                    notification.work_item_id ? (
                      <EntityLink
                        key={notification.id}
                        target={{ type: "work_item", id: notification.work_item_id, label: notification.title, query: { workspace_id: "default" } }}
                        href={`/operations?workspace_id=default&inspect=${encodeURIComponent(`work_item:${notification.work_item_id}`)}`}
                        onOpen={() => setNotificationsOpen(false)}
                        className={`block rounded-lg border p-3 transition hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 ${severityTone(notification.severity)}`}
                      >
                        <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide">
                          <span>{notificationSeverityLabel(notification.severity)}</span>
                          <span>{notificationTimeAgo(notification.created_at)}</span>
                        </div>
                        <div className="mt-1 text-sm font-medium normal-case tracking-normal">{notification.title}</div>
                      </EntityLink>
                    ) : (
                      <Link
                        key={notification.id}
                        href={`/notifications?notification_id=${encodeURIComponent(notification.id)}`}
                        onClick={() => setNotificationsOpen(false)}
                        className={`block rounded-lg border p-3 transition hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 ${severityTone(notification.severity)}`}
                      >
                        <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide">
                          <span>{notificationSeverityLabel(notification.severity)}</span>
                          <span>{notificationTimeAgo(notification.created_at)}</span>
                        </div>
                        <div className="mt-1 text-sm font-medium normal-case tracking-normal">{notification.title}</div>
                      </Link>
                    )
                  )) : (
                    <div className="rounded-lg border bg-slate-50 p-4 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                      Everything looks healthy. No active notifications.
                    </div>
                  )}
                </div>
                <Link
                  href="/notifications"
                  onClick={() => setNotificationsOpen(false)}
                  className="mt-3 block rounded-lg border px-3 py-2 text-center text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5"
                >
                  View All
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="border-t px-4 py-3 dark:border-white/10 xl:hidden">
        <CommandPaletteButton
          onOpen={commandPalette.openPalette}
          compact
          className="inline-flex h-10 w-full items-center gap-2 rounded-xl border bg-white px-3 text-sm outline-none transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:bg-white/5 dark:hover:bg-white/10 dark:focus:ring-white/10"
        />
      </div>
      <CommandPaletteDialog open={commandPalette.open} onClose={commandPalette.closePalette} />
    </header>
  );
}
