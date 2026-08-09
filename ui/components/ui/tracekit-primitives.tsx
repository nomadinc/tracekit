import { AlertTriangle, Beaker, CheckCircle2, CircleDot, GitCompare } from "lucide-react";
import type { ReactNode } from "react";

export type SemanticTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";
export type FindingTone = "observation" | "correlation" | "negative_finding" | "hypothesis";

const statusTone: Record<SemanticTone, string> = {
  neutral: "border-white/10 bg-white/[.045] text-slate-300",
  brand: "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
  success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  warning: "border-amber-400/25 bg-amber-400/10 text-amber-100",
  danger: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  info: "border-sky-400/25 bg-sky-400/10 text-sky-200",
};

export function StatusChip({ children, tone = "neutral", icon }: { children: ReactNode; tone?: SemanticTone; icon?: ReactNode }) {
  return <span className={`tk-status ${statusTone[tone]}`}>{icon}{children}</span>;
}

const findingTone: Record<FindingTone, { label: string; className: string; icon: ReactNode }> = {
  observation: { label: "Observation", className: "border-cyan-400/20 bg-cyan-400/[.055]", icon: <CircleDot className="h-4 w-4 text-cyan-300" aria-hidden="true" /> },
  correlation: { label: "Correlation", className: "border-violet-400/20 bg-violet-400/[.055]", icon: <GitCompare className="h-4 w-4 text-violet-300" aria-hidden="true" /> },
  negative_finding: { label: "Negative finding", className: "border-emerald-400/20 bg-emerald-400/[.055]", icon: <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" /> },
  hypothesis: { label: "Hypothesis", className: "border-amber-400/20 bg-amber-400/[.055]", icon: <Beaker className="h-4 w-4 text-amber-300" aria-hidden="true" /> },
};

export function FindingFrame({ kind, children }: { kind: FindingTone; children: ReactNode }) {
  const style = findingTone[kind];
  return <article className={`rounded-xl border p-5 ${style.className}`}><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider">{style.icon}<span>{style.label}</span></div>{children}</article>;
}

export function MetricSurface({ label, value, detail, warning }: { label: string; value: string; detail?: string; warning?: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[.03] p-4"><p className="tk-label">{label}</p><p className="mt-2 tk-metric">{value}</p>{detail ? <p className="mt-2 tk-helper">{detail}</p> : null}{warning ? <p className="mt-2 flex gap-2 text-xs leading-5 text-amber-200"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{warning}</p> : null}</div>;
}
