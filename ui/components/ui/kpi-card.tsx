// ui/components/ui/kpi-card.tsx
import * as React from "react";

export function KpiCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: React.ReactNode; // ✅ allow pill / JSX
}) {
  return (
    <div className="rounded-xl border bg-white dark:bg-ink p-4">
      <div className="text-xs text-slate-500">{label}</div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="text-2xl font-semibold leading-none">{value}</div>

        {helper ? (
          <div className="text-xs text-slate-500 flex items-center">
            {helper}
          </div>
        ) : null}
      </div>
    </div>
  );
}
