"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Loader2 } from "lucide-react";

export function PageSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border bg-white p-5 shadow-sm dark:border-white/10 dark:bg-ink/85 ${className}`}>
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "success" | "warning" | "critical" | "info" | "neutral" }) {
  const cls = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100",
    warning: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-100",
    critical: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100",
    info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100",
    neutral: "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>{children}</span>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-center dark:border-white/10 dark:bg-white/5">
      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function UnavailableState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-slate-50 p-5 text-sm dark:border-white/10 dark:bg-white/5">
      <div className="font-medium">{title}</div>
      <p className="mt-2 leading-6 text-slate-500 dark:text-slate-400">{body}</p>
    </div>
  );
}

export function ErrorState({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">{title}</div>
          <p className="mt-1 leading-6">{body}</p>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="mt-3 rounded-md border border-red-300 px-3 py-2 font-medium hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300 dark:border-red-400/40 dark:hover:bg-red-500/10">
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading" aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-14 rounded-lg bg-slate-100 dark:bg-white/10" />
      ))}
    </div>
  );
}

export function LoadingInline({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </span>
  );
}

type ClipboardEnvironment = {
  clipboard?: Pick<Clipboard, "writeText"> | null;
  document?: Pick<Document, "body" | "createElement" | "execCommand"> | null;
};

export async function writeTextToClipboard(value: string, environment: ClipboardEnvironment = {}): Promise<boolean> {
  const clipboard = environment.clipboard === undefined ? globalThis.navigator?.clipboard : environment.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(value);
      return true;
    } catch {
      // Some production browser policies reject the async API despite a user gesture.
    }
  }

  const documentRef = environment.document === undefined ? globalThis.document : environment.document;
  if (!documentRef?.body || !documentRef.createElement || !documentRef.execCommand) return false;
  const textarea = documentRef.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  documentRef.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return documentRef.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [status, setStatus] = React.useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = React.useRef<number | null>(null);
  React.useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  async function copy() {
    const copied = await writeTextToClipboard(value);
    setStatus(copied ? "copied" : "failed");
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setStatus("idle"), 1600);
  }
  return (
    <button type="button" onClick={copy} aria-label={status === "idle" ? label : `${label}: ${status === "copied" ? "copied" : "copy failed"}`} className="inline-flex min-w-24 items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/10">
      <Copy className="h-3.5 w-3.5" />
      <span aria-live="polite">{status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : label}</span>
    </button>
  );
}

export function ExternalLinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/10">
      {children}
      <ExternalLink className="h-3.5 w-3.5" />
    </Link>
  );
}
