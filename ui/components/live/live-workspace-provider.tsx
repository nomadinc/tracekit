"use client";

import * as React from "react";
import { Wifi, WifiOff } from "lucide-react";
import {
  LIVE_WORKSPACE_UPDATE_EVENT,
  isWorkspaceUpdate,
  liveWorkspaceStreamUrl,
  type LiveConnectionState,
  type WorkspaceUpdate,
} from "@/lib/live";

type LiveWorkspaceContextValue = {
  workspaceId: string;
  status: LiveConnectionState;
  lastCursor: string | null;
  lastEventAt: string | null;
};

const LiveWorkspaceContext = React.createContext<LiveWorkspaceContextValue>({
  workspaceId: "default",
  status: "connecting",
  lastCursor: null,
  lastEventAt: null,
});

function nextBackoffMs(attempt: number) {
  const base = Math.min(30000, 1000 * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * 300);
  return base + jitter;
}

function rememberSeen(seen: React.MutableRefObject<Set<string>>, id: string) {
  seen.current.add(id);
  if (seen.current.size <= 500) return;
  const oldest = seen.current.values().next().value;
  if (oldest) seen.current.delete(oldest);
}

export function LiveWorkspaceProvider({
  workspaceId = "default",
  children,
}: {
  workspaceId?: string;
  children: React.ReactNode;
}) {
  const [status, setStatus] = React.useState<LiveConnectionState>("connecting");
  const [lastCursor, setLastCursor] = React.useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = React.useState<string | null>(null);
  const cursorRef = React.useRef<string | null>(null);
  const seen = React.useRef(new Set<string>());
  const reconnectAttempt = React.useRef(0);

  React.useEffect(() => {
    let cancelled = false;
    let reconnectTimer: number | null = null;
    let source: EventSource | null = null;

    function closeSource() {
      if (source) {
        source.close();
        source = null;
      }
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function scheduleReconnect() {
      if (cancelled) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setStatus("offline");
        return;
      }
      reconnectAttempt.current += 1;
      const delay = nextBackoffMs(reconnectAttempt.current);
      setStatus(reconnectAttempt.current > 1 ? "reconnecting" : "connecting");
      reconnectTimer = window.setTimeout(connect, delay);
    }

    function dispatchWorkspaceUpdate(update: WorkspaceUpdate) {
      const key = update.id || update.cursor;
      if (seen.current.has(key)) return;
      rememberSeen(seen, key);
      cursorRef.current = update.cursor;
      setLastCursor(update.cursor);
      setLastEventAt(new Date().toISOString());
      window.dispatchEvent(new CustomEvent<WorkspaceUpdate>(LIVE_WORKSPACE_UPDATE_EVENT, { detail: update }));
    }

    function connect() {
      if (cancelled) return;
      closeSource();
      setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : reconnectAttempt.current ? "reconnecting" : "connecting");
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      source = new EventSource(liveWorkspaceStreamUrl(workspaceId, cursorRef.current));
      source.addEventListener("workspace.connected", () => {
        reconnectAttempt.current = 0;
        setStatus("live");
      });
      source.addEventListener("workspace.update", (event) => {
        try {
          const update = JSON.parse((event as MessageEvent).data);
          if (isWorkspaceUpdate(update)) dispatchWorkspaceUpdate(update);
        } catch {
          setStatus("error");
        }
      });
      source.addEventListener("workspace.error", () => {
        setStatus("error");
      });
      source.onerror = () => {
        closeSource();
        scheduleReconnect();
      };
    }

    function onOnline() {
      if (!source) connect();
    }

    function onOffline() {
      closeSource();
      setStatus("offline");
    }

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    connect();

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      closeSource();
    };
  }, [workspaceId]);

  const value = React.useMemo(() => ({ workspaceId, status, lastCursor, lastEventAt }), [lastCursor, lastEventAt, status, workspaceId]);
  return <LiveWorkspaceContext.Provider value={value}>{children}</LiveWorkspaceContext.Provider>;
}

export function useLiveWorkspace() {
  return React.useContext(LiveWorkspaceContext);
}

export function LiveWorkspaceStatus() {
  const { status, lastEventAt } = useLiveWorkspace();
  const live = status === "live";
  const label = live ? "Live" : status === "offline" ? "Offline" : status === "reconnecting" ? "Reconnecting" : status === "error" ? "Live issue" : "Connecting";
  return (
    <span
      title={lastEventAt ? `Last live update ${new Date(lastEventAt).toLocaleTimeString()}` : label}
      className={[
        "hidden items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-medium md:inline-flex",
        live
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
          : "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
      ].join(" ")}
    >
      {live ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}
